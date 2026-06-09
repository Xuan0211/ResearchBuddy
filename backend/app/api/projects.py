import secrets
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
import frontmatter as frontmatter_lib
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from ..core.db import get_session
from ..core.security import get_current_user
from ..models import DriveFileMapping, User, Project, ProjectInvite, ProjectMember
from ..services import git_service
from ..services.contacts import list_contacts as list_project_contacts, upsert_contact
from ..services.members import ensure_creator_admin, is_project_creator, normalize_email, validate_role
from ..services.project_fs import list_project_dir, read_project_file

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectIn(BaseModel):
    name: str
    description: str = ""


class InviteIn(BaseModel):
    role: str = "member"
    email: str | None = None
    name: str | None = None


class MemberInviteIn(BaseModel):
    email: str
    role: str = "member"


class MemberRoleIn(BaseModel):
    role: str


class ContactIn(BaseModel):
    name: str = ""
    email: str = ""
    handle: str = ""
    role: str = ""


class ZoteroConfigIn(BaseModel):
    api_key: str | None = None  # omit to keep existing key
    library_id: str
    library_type: str = "user"


class DriveRootIn(BaseModel):
    mode: str = "existing"  # "existing" | "new" | "default"
    folder_url: str = ""
    folder_id: str = ""
    folder_name: str = ""
    parent_folder_url: str = ""
    parent_folder_id: str = ""


class BatchDriveSyncIn(BaseModel):
    scope: str = "all"  # "all" | "docs" | "meetings"
    mode: str = "mapped"  # "mapped" | "new"


def check_member(project_id: str, user: User, session: Session, min_role: str = "viewer") -> ProjectMember:
    member = session.exec(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user.id
        )
    ).first()
    if not member:
        raise HTTPException(403, "Not a member of this project")
    roles = ["viewer", "member", "admin"]
    if roles.index(member.role) < roles.index(min_role):
        raise HTTPException(403, "Insufficient permissions")
    return member


def _get_last_edited_at(project_id: str):
    """Return the datetime of the latest git commit, or None."""
    try:
        if not git_service.repo_exists(project_id):
            return None
        import git as _git
        repo = _git.Repo(str(git_service.get_repo_path(project_id)))
        return repo.head.commit.committed_datetime
    except Exception:
        return None


def project_response(project: Project, role: str) -> dict:
    return {
        "id": str(project.id),
        "name": project.name,
        "description": project.description,
        "created_at": project.created_at,
        "last_edited_at": _get_last_edited_at(str(project.id)),
        "role": role,
        "zotero_configured": bool(project.zotero_api_key),
        "zotero_last_sync": project.zotero_last_sync,
    }


def _parse_markdown_item(project_id: str, rel_path: str) -> tuple[dict, str]:
    post = frontmatter_lib.loads(read_project_file(project_id, rel_path))
    return dict(post.metadata), post.content


def _mapping_for(session: Session, project_id: str, item_type: str, item_id: str) -> DriveFileMapping | None:
    return session.exec(
        select(DriveFileMapping).where(
            DriveFileMapping.project_id == project_id,
            DriveFileMapping.item_type == item_type,
            DriveFileMapping.item_id == item_id,
        )
    ).first()


def _save_mapping(
    session: Session,
    project_id: str,
    item_type: str,
    item_id: str,
    drive_file_id: str,
    drive_link: str,
) -> None:
    mapping = _mapping_for(session, project_id, item_type, item_id)
    if mapping:
        mapping.drive_file_id = drive_file_id
        mapping.drive_link = drive_link
        mapping.synced_at = datetime.now(timezone.utc)
        session.add(mapping)
    else:
        session.add(DriveFileMapping(
            project_id=UUID(project_id),
            item_type=item_type,
            item_id=item_id,
            drive_file_id=drive_file_id,
            drive_link=drive_link,
        ))


def _sync_tree_to_drive(
    *,
    service,
    docs_service,
    session: Session,
    project_id: str,
    folder_id: str,
    rel_dir: str,
    item_type: str,
    mode: str,
) -> dict:
    from ..services import google_drive as gd
    from ..services import document_tabs as dt

    result = {"synced": 0, "failed": 0, "items": []}
    for rel_path in list_project_dir(project_id, rel_dir):
        if not rel_path.endswith(".md"):
            continue
        item_id = Path(rel_path).stem
        try:
            meta, content = _parse_markdown_item(project_id, rel_path)
            item_id = str(meta.get("id") or item_id)
            title = str(meta.get("title") or item_id)
            default_tab = "Pre-meeting" if item_type == "meeting" else "Main"
            tabs = dt.parse_tabs(content, default_tab)
            mapping = _mapping_for(session, project_id, item_type, item_id)
            existing_id = mapping.drive_file_id if (mode == "mapped" and mapping) else None
            drive_doc = gd.upsert_google_doc_tabs(
                service,
                docs_service,
                title,
                tabs,
                folder_id,
                existing_file_id=existing_id,
            )
            _save_mapping(
                session,
                project_id,
                item_type,
                item_id,
                drive_doc["id"],
                drive_doc.get("webViewLink", ""),
            )
            result["synced"] += 1
            result["items"].append({
                "id": item_id,
                "path": rel_path,
                "ok": True,
                "drive_link": drive_doc.get("webViewLink", ""),
            })
        except Exception as exc:
            result["failed"] += 1
            result["items"].append({
                "id": item_id,
                "path": rel_path,
                "ok": False,
                "error": str(exc),
            })
    return result


@router.get("")
def list_projects(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    memberships = session.exec(select(ProjectMember).where(ProjectMember.user_id == current_user.id)).all()
    result = []
    for m in memberships:
        project = session.get(Project, m.project_id)
        if project:
            result.append(project_response(project, m.role))
    return result


@router.post("", status_code=201)
def create_project(
    body: ProjectIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = Project(name=body.name, description=body.description, created_by=current_user.id, repo_path="")
    session.add(project)
    session.flush()

    repo_path = git_service.init_project_repo(str(project.id))
    project.repo_path = str(repo_path)

    member = ProjectMember(project_id=project.id, user_id=current_user.id, role="admin")
    session.add(member)
    session.commit()
    session.refresh(project)
    return project_response(project, "admin")


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="admin")

    # Remove related rows
    for row in session.exec(select(ProjectMember).where(ProjectMember.project_id == project_id)).all():
        session.delete(row)
    for row in session.exec(select(ProjectInvite).where(ProjectInvite.project_id == project_id)).all():
        session.delete(row)
    for row in session.exec(select(DriveFileMapping).where(DriveFileMapping.project_id == project_id)).all():
        session.delete(row)

    # Delete git repo from filesystem
    git_service.delete_project_repo(project_id)

    project = session.get(Project, project_id)
    if project:
        session.delete(project)
    session.commit()


@router.get("/{project_id}")
def get_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    member = check_member(project_id, current_user, session)
    return project_response(project, member.role)


@router.get("/{project_id}/drive-root")
def get_drive_root(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    from ..services import google_drive as gd

    if not session.get(Project, project_id):
        raise HTTPException(404, "Project not found")
    check_member(project_id, current_user, session)
    settings = gd.load_project_drive_settings(project_id)
    return {
        "configured": bool(settings.get("root_folder_id")),
        "settings_path": gd.DRIVE_SETTINGS_PATH,
        "root_folder_id": settings.get("root_folder_id", ""),
        "root_folder_name": settings.get("root_folder_name", ""),
        "root_folder_link": settings.get("root_folder_link", ""),
        "source": settings.get("source", ""),
    }


@router.put("/{project_id}/drive-root")
def set_drive_root(
    project_id: str,
    body: DriveRootIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    from ..services import google_drive as gd

    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    check_member(project_id, current_user, session, min_role="member")
    token = gd.load_token(str(current_user.id), session)
    if not token:
        raise HTTPException(400, "Google Drive not connected. Go to Settings to connect.")

    try:
        service = gd.get_service(token, str(current_user.id), session)
        docs_service = gd.get_docs_service(token, str(current_user.id), session)
        if body.mode == "existing":
            folder_id = body.folder_id or gd.extract_file_id(body.folder_url)
            if not folder_id:
                raise HTTPException(400, "Paste a Drive folder URL or folder id")
            settings = gd.set_project_drive_root_existing(service, project_id, folder_id)
        elif body.mode == "new":
            parent_id = body.parent_folder_id or gd.extract_file_id(body.parent_folder_url)
            folder_name = body.folder_name.strip() or project.name
            settings = gd.create_project_drive_root(service, project_id, folder_name, parent_id or None)
        elif body.mode == "default":
            settings = gd.ensure_project_drive_root(service, project_id, project.name)
        else:
            raise HTTPException(400, "mode must be existing, new, or default")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Google Drive folder setup failed: {exc}")
    return settings


@router.post("/{project_id}/drive/sync")
def batch_drive_sync(
    project_id: str,
    body: BatchDriveSyncIn | None = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    from ..services import google_drive as gd

    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    check_member(project_id, current_user, session, min_role="member")
    token = gd.load_token(str(current_user.id), session)
    if not token:
        raise HTTPException(400, "Google Drive not connected. Go to Settings to connect.")

    body = body or BatchDriveSyncIn()
    if body.scope not in {"all", "docs", "meetings"}:
        raise HTTPException(400, "scope must be all, docs, or meetings")
    if body.mode not in {"mapped", "new"}:
        raise HTTPException(400, "mode must be mapped or new")

    try:
        service = gd.get_service(token, str(current_user.id), session)
        docs_service = gd.get_docs_service(token, str(current_user.id), session)
        response = {
            "ok": True,
            "root": gd.ensure_project_drive_root(service, project_id, project.name),
            "docs": None,
            "meetings": None,
        }
        if body.scope in {"all", "docs"}:
            docs_folder = gd.ensure_project_drive_child_folder(service, project_id, project.name, "Docs")
            response["docs"] = _sync_tree_to_drive(
                service=service,
                docs_service=docs_service,
                session=session,
                project_id=project_id,
                folder_id=docs_folder,
                rel_dir="docs",
                item_type="doc",
                mode=body.mode,
            )
        if body.scope in {"all", "meetings"}:
            meetings_folder = gd.ensure_project_drive_child_folder(service, project_id, project.name, "Meetings")
            response["meetings"] = _sync_tree_to_drive(
                service=service,
                docs_service=docs_service,
                session=session,
                project_id=project_id,
                folder_id=meetings_folder,
                rel_dir="meetings",
                item_type="meeting",
                mode=body.mode,
            )
        session.commit()
    except Exception as exc:
        session.rollback()
        raise HTTPException(502, f"Google Drive batch sync failed: {exc}")
    return response


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404)
    check_member(project_id, current_user, session, min_role="admin")
    git_service.delete_project_repo(project_id)
    for m in session.exec(select(ProjectMember).where(ProjectMember.project_id == project_id)):
        session.delete(m)
    session.delete(project)
    session.commit()


@router.post("/{project_id}/invites", status_code=201)
def create_invite(
    project_id: str,
    body: InviteIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not session.get(Project, project_id):
        raise HTTPException(404)
    check_member(project_id, current_user, session, min_role="admin")
    role = validate_role(body.role)
    email = normalize_email(body.email) if body.email else None
    invite = ProjectInvite(
        project_id=project_id,
        invited_by=current_user.id,
        token=secrets.token_urlsafe(24),
        role=role,
        email=email,
    )
    session.add(invite)
    session.commit()
    session.refresh(invite)
    if email:
        upsert_contact(project_id, {
            "name": body.name or email.split("@", 1)[0],
            "email": email,
            "role": role,
            "source": "invite",
        })
    return {"token": invite.token, "role": invite.role}


@router.post("/join/{token}")
def join_project(
    token: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    invite = session.exec(select(ProjectInvite).where(ProjectInvite.token == token)).first()
    if not invite or invite.used:
        raise HTTPException(404, "Invalid or expired invite")
    existing = session.exec(
        select(ProjectMember).where(
            ProjectMember.project_id == invite.project_id, ProjectMember.user_id == current_user.id
        )
    ).first()
    if existing:
        raise HTTPException(400, "Already a member")
    member = ProjectMember(project_id=invite.project_id, user_id=current_user.id, role=invite.role)
    invite.used = True
    session.add(member)
    session.add(invite)
    session.commit()
    project = session.get(Project, invite.project_id)
    return project_response(project, member.role)


def _member_payload(session: Session, project: Project, member: ProjectMember) -> dict | None:
    user = session.get(User, member.user_id)
    if not user:
        return None
    creator = is_project_creator(project, user.id)
    return {
        "id": str(member.id),
        "user_id": str(user.id),
        "name": user.name,
        "email": user.email,
        "role": "admin" if creator else member.role,
        "status": "active",
        "is_creator": creator,
        "registered": True,
        "joined_at": member.joined_at,
    }


@router.get("/{project_id}/members")
def list_members(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    check_member(project_id, current_user, session)
    ensure_creator_admin(session, project)
    session.commit()
    members = session.exec(select(ProjectMember).where(ProjectMember.project_id == project_id)).all()
    result = []
    for m in members:
        payload = _member_payload(session, project, m)
        if payload:
            result.append(payload)
    member_emails = {row["email"].lower() for row in result if row.get("email")}
    invites = session.exec(
        select(ProjectInvite).where(
            ProjectInvite.project_id == project_id,
            ProjectInvite.used == False,  # noqa: E712
        )
    ).all()
    for invite in invites:
        if not invite.email:
            continue
        email = normalize_email(invite.email)
        if email in member_emails:
            invite.used = True
            session.add(invite)
            continue
        invited_user = session.exec(select(User).where(func.lower(User.email) == email)).first()
        if invited_user:
            member = ProjectMember(
                project_id=project.id,
                user_id=invited_user.id,
                role="admin" if is_project_creator(project, invited_user.id) else validate_role(invite.role),
            )
            session.add(member)
            session.flush()
            invite.used = True
            session.add(invite)
            payload = _member_payload(session, project, member)
            if payload:
                result.append(payload)
                member_emails.add(email)
            continue
        result.append({
            "id": str(invite.id),
            "invite_id": str(invite.id),
            "user_id": None,
            "name": email.split("@", 1)[0],
            "email": email,
            "role": invite.role,
            "status": "pending",
            "is_creator": False,
            "registered": False,
            "invited_at": invite.created_at,
        })
    session.commit()
    return result


@router.post("/{project_id}/members", status_code=201)
def invite_member(
    project_id: str,
    body: MemberInviteIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    check_member(project_id, current_user, session, min_role="admin")
    ensure_creator_admin(session, project)
    email = normalize_email(body.email)
    role = validate_role(body.role)
    if not email or "@" not in email:
        raise HTTPException(400, "Invite needs a valid email")

    user = session.exec(select(User).where(func.lower(User.email) == email)).first()
    if user:
        existing = session.exec(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user.id,
            )
        ).first()
        if existing:
            if is_project_creator(project, user.id):
                existing.role = "admin"
            else:
                existing.role = role
            session.add(existing)
            member = existing
        else:
            member = ProjectMember(project_id=project.id, user_id=user.id, role="admin" if is_project_creator(project, user.id) else role)
            session.add(member)
        for invite in session.exec(
            select(ProjectInvite).where(
                ProjectInvite.project_id == project_id,
                ProjectInvite.email == email,
                ProjectInvite.used == False,  # noqa: E712
            )
        ).all():
            invite.used = True
            session.add(invite)
        session.commit()
        session.refresh(member)
        return _member_payload(session, project, member)

    existing_invite = session.exec(
        select(ProjectInvite).where(
            ProjectInvite.project_id == project_id,
            ProjectInvite.email == email,
            ProjectInvite.used == False,  # noqa: E712
        )
    ).first()
    if existing_invite:
        existing_invite.role = role
        existing_invite.invited_by = current_user.id
        session.add(existing_invite)
        invite = existing_invite
    else:
        invite = ProjectInvite(
            project_id=project.id,
            invited_by=current_user.id,
            token=secrets.token_urlsafe(24),
            role=role,
            email=email,
        )
        session.add(invite)
    session.commit()
    session.refresh(invite)
    return {
        "id": str(invite.id),
        "invite_id": str(invite.id),
        "user_id": None,
        "name": email.split("@", 1)[0],
        "email": email,
        "role": invite.role,
        "status": "pending",
        "is_creator": False,
        "registered": False,
        "invited_at": invite.created_at,
    }


@router.put("/{project_id}/members/{user_id}/role")
def update_member_role(
    project_id: str,
    user_id: str,
    body: MemberRoleIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    check_member(project_id, current_user, session, min_role="admin")
    role = validate_role(body.role)
    if is_project_creator(project, user_id):
        raise HTTPException(400, "The project creator is always an admin")
    member = session.exec(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    ).first()
    if not member:
        raise HTTPException(404, "Member not found")
    member.role = role
    session.add(member)
    session.commit()
    session.refresh(member)
    return _member_payload(session, project, member)


@router.delete("/{project_id}/members/{user_id}", status_code=204)
def remove_member(
    project_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    check_member(project_id, current_user, session, min_role="admin")
    if is_project_creator(project, user_id):
        raise HTTPException(400, "The project creator cannot be removed")
    member = session.exec(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    ).first()
    if not member:
        raise HTTPException(404, "Member not found")
    session.delete(member)
    session.commit()


@router.put("/{project_id}/invites/{invite_id}/role")
def update_pending_invite_role(
    project_id: str,
    invite_id: str,
    body: MemberRoleIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not session.get(Project, project_id):
        raise HTTPException(404, "Project not found")
    check_member(project_id, current_user, session, min_role="admin")
    role = validate_role(body.role)
    invite = session.exec(
        select(ProjectInvite).where(
            ProjectInvite.id == invite_id,
            ProjectInvite.project_id == project_id,
            ProjectInvite.used == False,  # noqa: E712
        )
    ).first()
    if not invite:
        raise HTTPException(404, "Invite not found")
    invite.role = role
    session.add(invite)
    session.commit()
    session.refresh(invite)
    email = normalize_email(invite.email or "")
    return {
        "id": str(invite.id),
        "invite_id": str(invite.id),
        "user_id": None,
        "name": email.split("@", 1)[0],
        "email": email,
        "role": invite.role,
        "status": "pending",
        "is_creator": False,
        "registered": False,
        "invited_at": invite.created_at,
    }


@router.delete("/{project_id}/invites/{invite_id}", status_code=204)
def delete_pending_invite(
    project_id: str,
    invite_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not session.get(Project, project_id):
        raise HTTPException(404, "Project not found")
    check_member(project_id, current_user, session, min_role="admin")
    invite = session.exec(
        select(ProjectInvite).where(
            ProjectInvite.id == invite_id,
            ProjectInvite.project_id == project_id,
            ProjectInvite.used == False,  # noqa: E712
        )
    ).first()
    if not invite:
        raise HTTPException(404, "Invite not found")
    session.delete(invite)
    session.commit()


@router.get("/{project_id}/contacts")
def list_contacts(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    return list_project_contacts(project_id, session)


@router.post("/{project_id}/contacts", status_code=201)
def add_contact(
    project_id: str,
    body: ContactIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    if not body.email and not body.name and not body.handle:
        raise HTTPException(400, "Contact needs a name, email, or handle")
    return upsert_contact(project_id, body.model_dump())


@router.put("/{project_id}/contacts/{handle}")
def update_contact(
    project_id: str,
    handle: str,
    body: ContactIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    # delete old handle first if it changed
    from ..services.contacts import delete_contact as _del
    _del(project_id, handle)
    return upsert_contact(project_id, body.model_dump())


@router.delete("/{project_id}/contacts/{handle}", status_code=204)
def delete_contact_route(
    project_id: str,
    handle: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    from ..services.contacts import delete_contact as _del
    _del(project_id, handle)


@router.put("/{project_id}/zotero")
def set_zotero_config(
    project_id: str,
    body: ZoteroConfigIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404)
    check_member(project_id, current_user, session, min_role="admin")
    if body.api_key:  # only update key if explicitly provided
        project.zotero_api_key = body.api_key
    project.zotero_library_id = body.library_id
    project.zotero_library_type = body.library_type
    session.add(project)
    session.commit()
    return {"ok": True}


@router.get("/{project_id}/zotero")
def get_zotero_config(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404)
    check_member(project_id, current_user, session, min_role="admin")
    return {
        "library_id": project.zotero_library_id,
        "library_type": project.zotero_library_type,
        "api_key_set": bool(project.zotero_api_key),
    }


@router.post("/{project_id}/zotero/sync")
async def trigger_zotero_sync(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404)
    check_member(project_id, current_user, session, min_role="member")
    if not project.zotero_api_key:
        raise HTTPException(400, "Zotero not configured for this project")
    from ..services.zotero import sync_project
    stats = await sync_project(project_id, project.zotero_api_key, project.zotero_library_id, project.zotero_library_type)
    project.zotero_last_sync = datetime.now(timezone.utc)
    session.add(project)
    session.commit()
    from ..services.paper_cache import invalidate
    invalidate(project_id)
    return stats
