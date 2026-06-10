import re
import secrets
import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..core.config import settings
from ..core.db import get_session
from ..core.paths import DOCS_DIR, PAPERS_NOTES_DIR
from ..core.security import get_current_user
from ..models import DocumentShare, Project, User
from ..services import document_tabs as dt
from ..services import frontmatter as fm
from ..services.project_fs import list_project_dir, read_project_file, project_worktree
from .projects import check_member
from .papers import _parse_paper

router = APIRouter(prefix="/projects/{project_id}/docs", tags=["documents"])
public_router = APIRouter(prefix="/public/docs", tags=["public-documents"])
logger = logging.getLogger(__name__)

WIKI_LINK_RE = re.compile(r"\[\[([^\]]+)\]\]")
MENTION_RE = re.compile(r"(?<![\w@])@([a-zA-Z0-9_.-]+)")


def _extract_paper_refs(body: str) -> list[str]:
    return list(dict.fromkeys(WIKI_LINK_RE.findall(body)))


def _extract_mentions(body: str) -> list[str]:
    return list(dict.fromkeys(MENTION_RE.findall(body)))


def _doc_default_tab_title(meta: dict | None = None) -> str:
    return "Main"


def _parse_doc(project_id: str, rel_path: str) -> dict:
    import frontmatter as _fm
    content = read_project_file(project_id, rel_path)
    post = _fm.loads(content)
    meta = dict(post.metadata)
    return {
        **meta,
        "_body": post.content,
        "tabs": dt.parse_tabs(post.content, _doc_default_tab_title(meta)),
        "_path": rel_path,
    }


class DocIn(BaseModel):
    title: str
    tags: list[str] = []
    folder: str = ""


class DocPatch(BaseModel):
    title: str | None = None
    tags: list[str] | None = None
    folder: str | None = None
    content: str | None = None
    tab_id: str | None = None


class TabIn(BaseModel):
    title: str
    content: str = ""


class TabPatch(BaseModel):
    title: str | None = None
    content: str | None = None


class DriveSyncIn(BaseModel):
    mode: str = "mapped"  # "mapped" | "new" | "existing"
    drive_url: str = ""
    file_id: str = ""


def _share_public_url(token: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/share/docs/{token}"


def _current_share(session: Session, project_id: str, doc_id: str) -> DocumentShare | None:
    project_uuid = uuid.UUID(project_id)
    return session.exec(
        select(DocumentShare).where(
            DocumentShare.project_id == project_uuid,
            DocumentShare.doc_id == doc_id,
            DocumentShare.enabled == True,  # noqa: E712
        )
    ).first()


def _share_payload(share: DocumentShare | None) -> dict:
    if not share:
        return {"enabled": False, "token": "", "url": ""}
    return {
        "enabled": share.enabled,
        "token": share.token,
        "url": _share_public_url(share.token),
        "created_at": share.created_at,
    }


def _drive_http_exception(operation: str, exc: Exception, **context: object) -> HTTPException:
    """Log and return a user-visible diagnostic for Drive sync failures."""
    request_id = uuid.uuid4().hex[:10]
    error = str(exc) or repr(exc)
    detail: dict[str, object] = {
        "message": "Google Drive sync failed",
        "request_id": request_id,
        "operation": operation,
        "error_type": type(exc).__name__,
        "error": error[:1200],
        "context": context,
    }

    resp = getattr(exc, "resp", None)
    status = getattr(resp, "status", None)
    reason = getattr(resp, "reason", None)
    if status:
        detail["google_status"] = status
    if reason:
        detail["google_reason"] = reason

    content = getattr(exc, "content", None)
    if content:
        if isinstance(content, bytes):
            content_text = content.decode("utf-8", errors="replace")
        else:
            content_text = str(content)
        detail["google_response"] = content_text[:1200]

    logger.exception(
        "Google Drive operation failed request_id=%s operation=%s context=%s",
        request_id,
        operation,
        context,
    )
    return HTTPException(status_code=502, detail=detail)


@router.get("")
def list_docs(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    paths = list_project_dir(project_id, DOCS_DIR)
    docs = []
    for p in paths:
        parts = p.split("/")
        if not p.endswith(".md") or len(parts) != 3:
            continue
        try:
            d = _parse_doc(project_id, p)
            docs.append({k: v for k, v in d.items() if k != "_body"})
        except Exception:
            continue
    return docs


@router.post("", status_code=201)
def create_doc(
    project_id: str,
    body: DocIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    slug = re.sub(r"[^\w-]", "", body.title.lower().replace(" ", "-"))[:40]
    doc_id = slug or str(uuid.uuid4())[:8]
    meta: dict = {"id": doc_id, "title": body.title, "tags": body.tags, "papers": [], "document_type": "doc"}
    if body.folder:
        meta["folder"] = body.folder
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Create doc: {body.title}"
        path = wt / DOCS_DIR / f"{doc_id}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            raise HTTPException(409, "Document already exists")
        fm.write(path, meta, dt.serialize_tabs([{"id": "main", "title": "Main", "content": f"# {body.title}\n"}]))
    return {"id": doc_id}


@router.get("/{doc_id}")
def get_doc(
    project_id: str,
    doc_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    try:
        return _parse_doc(project_id, f"{DOCS_DIR}/{doc_id}.md")
    except FileNotFoundError:
        raise HTTPException(404)


@router.get("/{doc_id}/share")
def get_doc_share(
    project_id: str,
    doc_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    try:
        _parse_doc(project_id, f"{DOCS_DIR}/{doc_id}.md")
    except FileNotFoundError:
        raise HTTPException(404)
    return _share_payload(_current_share(session, project_id, doc_id))


@router.post("/{doc_id}/share")
def create_doc_share(
    project_id: str,
    doc_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        _parse_doc(project_id, f"{DOCS_DIR}/{doc_id}.md")
    except FileNotFoundError:
        raise HTTPException(404)

    existing = _current_share(session, project_id, doc_id)
    if existing:
        return _share_payload(existing)

    share = DocumentShare(
        project_id=uuid.UUID(project_id),
        doc_id=doc_id,
        token=secrets.token_urlsafe(24),
        created_by=current_user.id,
    )
    session.add(share)
    session.commit()
    session.refresh(share)
    return _share_payload(share)


@router.delete("/{doc_id}/share")
def disable_doc_share(
    project_id: str,
    doc_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    share = _current_share(session, project_id, doc_id)
    if share:
        share.enabled = False
        session.add(share)
        session.commit()
    return {"enabled": False, "token": "", "url": ""}


@router.patch("/{doc_id}")
def update_doc(
    project_id: str,
    doc_id: str,
    body: DocPatch,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update doc: {doc_id}"
        path = wt / DOCS_DIR / f"{doc_id}.md"
        if not path.exists():
            raise HTTPException(404)
        if body.content is not None:
            meta, current = fm.read(path)
            next_content = (
                dt.patch_tab(current, body.tab_id, body.content, _doc_default_tab_title(meta))
                if body.tab_id else body.content
            )
            meta["papers"] = _extract_paper_refs(next_content)
            meta["mentions"] = _extract_mentions(next_content)
            if body.tags is not None:
                meta["tags"] = body.tags
            if body.title is not None:
                meta["title"] = body.title
            if body.folder is not None:
                if body.folder:
                    meta["folder"] = body.folder
                else:
                    meta.pop("folder", None)
            fm.write(path, meta, next_content)
        else:
            updates = {k: v for k, v in body.model_dump().items() if v is not None and k not in ("content", "tab_id")}
            if updates:
                fm.update_metadata(path, updates)
    return {"ok": True}


@router.post("/{doc_id}/tabs", status_code=201)
def create_doc_tab(
    project_id: str,
    doc_id: str,
    body: TabIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Create doc tab: {doc_id}"
        path = wt / DOCS_DIR / f"{doc_id}.md"
        if not path.exists():
            raise HTTPException(404)
        meta, current = fm.read(path)
        tabs = dt.parse_tabs(current, _doc_default_tab_title(meta))
        tabs.append({"title": body.title, "content": body.content})
        next_content = dt.serialize_tabs(tabs, _doc_default_tab_title(meta))
        meta["papers"] = _extract_paper_refs(next_content)
        meta["mentions"] = _extract_mentions(next_content)
        fm.write(path, meta, next_content)
    return {"tabs": dt.parse_tabs(next_content, _doc_default_tab_title(meta))}


@router.patch("/{doc_id}/tabs/{tab_id}")
def update_doc_tab(
    project_id: str,
    doc_id: str,
    tab_id: str,
    body: TabPatch,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update doc tab: {doc_id}/{tab_id}"
        path = wt / DOCS_DIR / f"{doc_id}.md"
        if not path.exists():
            raise HTTPException(404)
        meta, current = fm.read(path)
        tabs = dt.parse_tabs(current, _doc_default_tab_title(meta))
        found = False
        for tab in tabs:
            if tab["id"] == tab_id:
                if body.title is not None:
                    tab["title"] = body.title
                if body.content is not None:
                    tab["content"] = body.content
                found = True
                break
        if not found:
            raise HTTPException(404, "Tab not found")
        next_content = dt.serialize_tabs(tabs, _doc_default_tab_title(meta))
        meta["papers"] = _extract_paper_refs(next_content)
        meta["mentions"] = _extract_mentions(next_content)
        fm.write(path, meta, next_content)
    return {"tabs": dt.parse_tabs(next_content, _doc_default_tab_title(meta))}


@router.delete("/{doc_id}/tabs/{tab_id}", status_code=204)
def delete_doc_tab(
    project_id: str,
    doc_id: str,
    tab_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Delete doc tab: {doc_id}/{tab_id}"
        path = wt / DOCS_DIR / f"{doc_id}.md"
        if not path.exists():
            raise HTTPException(404)
        meta, current = fm.read(path)
        tabs = [tab for tab in dt.parse_tabs(current, _doc_default_tab_title(meta)) if tab["id"] != tab_id]
        if not tabs:
            raise HTTPException(400, "A document needs at least one tab")
        next_content = dt.serialize_tabs(tabs, _doc_default_tab_title(meta))
        meta["papers"] = _extract_paper_refs(next_content)
        meta["mentions"] = _extract_mentions(next_content)
        fm.write(path, meta, next_content)


@router.delete("/{doc_id}", status_code=204)
def delete_doc(
    project_id: str,
    doc_id: str,
    delete_drive: bool = True,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    from ..services import google_drive as gd
    from ..models import DriveFileMapping
    from sqlmodel import select as sel

    check_member(project_id, current_user, session, min_role="member")
    mapping = session.exec(
        sel(DriveFileMapping).where(
            DriveFileMapping.project_id == project_id,
            DriveFileMapping.item_type == "doc",
            DriveFileMapping.item_id == doc_id,
        )
    ).first()

    if delete_drive and mapping:
        token = gd.load_token(str(current_user.id), session)
        if not token:
            raise HTTPException(400, "Google Drive is not connected; cannot delete linked Drive file")
        try:
            service = gd.get_service(token, str(current_user.id), session)
            gd.trash_file(service, mapping.drive_file_id)
        except Exception as exc:
            raise HTTPException(400, f"Could not delete linked Drive file: {exc}")
        session.delete(mapping)
        session.commit()

    with project_worktree(project_id) as wt:
        wt.commit_message = f"Delete doc: {doc_id}"
        path = wt / DOCS_DIR / f"{doc_id}.md"
        if not path.exists():
            raise HTTPException(404)
        path.unlink()


@router.get("/{doc_id}/context")
def get_doc_context(
    project_id: str,
    doc_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    try:
        doc = _parse_doc(project_id, f"{DOCS_DIR}/{doc_id}.md")
    except FileNotFoundError:
        raise HTTPException(404)

    paper_ids = doc.get("papers") or _extract_paper_refs(doc.get("_body", ""))
    cited_papers = []
    for pid in paper_ids:
        try:
            cited_papers.append(_parse_paper(project_id, f"{PAPERS_NOTES_DIR}/{pid}.md"))
        except FileNotFoundError:
            cited_papers.append({"id": pid, "error": "not found"})

    return {
        "document": {k: v for k, v in doc.items() if k != "_path"},
        "cited_papers": cited_papers,
        "project_id": project_id,
    }


@router.get("/{doc_id}/export/markdown")
def export_doc_markdown(
    project_id: str,
    doc_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Download doc as a .md file (for manual upload to Google Drive etc.)."""
    from fastapi.responses import Response
    check_member(project_id, current_user, session)
    try:
        content = read_project_file(project_id, f"{DOCS_DIR}/{doc_id}.md")
    except FileNotFoundError:
        raise HTTPException(404)
    return Response(
        content=content.encode(),
        media_type="text/markdown",
        headers={"Content-Disposition": f"attachment; filename={doc_id}.md"},
    )


@router.post("/{doc_id}/sync-to-drive")
async def sync_doc_to_drive(
    project_id: str,
    doc_id: str,
    body: DriveSyncIn | None = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    from ..services import google_drive as gd
    from ..services import drive_doc_sync
    from ..models import DriveFileMapping
    from sqlmodel import select as sel

    check_member(project_id, current_user, session, min_role="member")
    token = gd.load_token(str(current_user.id), session)
    if not token:
        raise HTTPException(400, "Google Drive not connected. Go to Settings to connect.")

    body = body or DriveSyncIn()

    mapping = session.exec(
        sel(DriveFileMapping).where(
            DriveFileMapping.project_id == project_id,
            DriveFileMapping.item_type == "doc",
            DriveFileMapping.item_id == doc_id,
        )
    ).first()

    target_file_id = None
    if body.mode == "existing":
        target_file_id = body.file_id or gd.extract_file_id(body.drive_url)
        if not target_file_id:
            raise HTTPException(400, "Existing Drive sync needs a Drive URL or file id")
    elif body.mode == "mapped":
        target_file_id = mapping.drive_file_id if mapping else None
    elif body.mode == "new":
        target_file_id = None
    else:
        raise HTTPException(400, "mode must be mapped, new, or existing")

    doc_folder = ""
    try:
        meta = _parse_doc(project_id, f"{DOCS_DIR}/{doc_id}.md")
        doc_folder = meta.get("folder", "")
        result = drive_doc_sync.push_doc_to_drive(
            session,
            token,
            str(current_user.id),
            project_id,
            doc_id,
            mapping=mapping,
            target_file_id=target_file_id,
            force_new=(body.mode == "new"),
        )
    except FileNotFoundError:
        raise HTTPException(404)
    except Exception as exc:
        raise _drive_http_exception(
            "doc.sync_to_drive",
            exc,
            project_id=project_id,
            doc_id=doc_id,
            mode=body.mode,
            has_mapping=bool(mapping),
            target_file_id=target_file_id or "",
            folder=doc_folder,
        )

    return {"ok": True, "drive_link": result.get("drive_link") or result.get("webViewLink", "")}


@router.post("/{doc_id}/pull-from-drive")
async def pull_doc_from_drive(
    project_id: str,
    doc_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    from ..services import google_drive as gd
    from ..services import drive_doc_sync
    from ..models import DriveFileMapping
    from sqlmodel import select as sel

    check_member(project_id, current_user, session, min_role="member")
    token = gd.load_token(str(current_user.id), session)
    if not token:
        raise HTTPException(400, "Google Drive not connected. Go to Settings to connect.")

    mapping = session.exec(
        sel(DriveFileMapping).where(
            DriveFileMapping.project_id == project_id,
            DriveFileMapping.item_type == "doc",
            DriveFileMapping.item_id == doc_id,
        )
    ).first()
    if not mapping:
        raise HTTPException(400, "No Drive document is linked yet")

    try:
        drive_doc_sync.pull_doc_from_drive(
            session,
            token,
            str(current_user.id),
            project_id,
            doc_id,
            mapping,
        )
    except FileNotFoundError:
        raise HTTPException(404)
    except Exception as exc:
        raise _drive_http_exception(
            "doc.pull_from_drive",
            exc,
            project_id=project_id,
            doc_id=doc_id,
            drive_file_id=mapping.drive_file_id,
        )

    return {"ok": True}


@router.post("/{doc_id}/smart-sync")
async def smart_sync_doc(
    project_id: str,
    doc_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Push to Drive or pull from Drive depending on which side was modified more recently."""
    from ..services import google_drive as gd
    from ..services import drive_doc_sync
    from ..models import DriveFileMapping
    from sqlmodel import select as sel

    check_member(project_id, current_user, session, min_role="member")
    token = gd.load_token(str(current_user.id), session)
    if not token:
        raise HTTPException(400, "Google Drive not connected. Go to Settings to connect.")

    mapping = session.exec(
        sel(DriveFileMapping).where(
            DriveFileMapping.project_id == project_id,
            DriveFileMapping.item_type == "doc",
            DriveFileMapping.item_id == doc_id,
        )
    ).first()

    try:
        return drive_doc_sync.smart_sync_doc(
            session,
            token,
            str(current_user.id),
            project_id,
            doc_id,
        )
    except FileNotFoundError:
        raise HTTPException(404)
    except Exception as exc:
        operation = "doc.smart_sync"
        if not mapping:
            operation = "doc.smart_sync.initial_push"
        raise _drive_http_exception(
            operation,
            exc,
            project_id=project_id,
            doc_id=doc_id,
            drive_file_id=mapping.drive_file_id if mapping else "",
        )


@router.post("/sync-structure-from-drive")
async def sync_doc_structure_from_drive(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Read each doc's Drive parent folder name and update local folder metadata."""
    from ..services import google_drive as gd
    from ..models import DriveFileMapping, Project
    from sqlmodel import select as sel
    from datetime import datetime, timezone

    check_member(project_id, current_user, session, min_role="member")
    token = gd.load_token(str(current_user.id), session)
    if not token:
        raise HTTPException(400, "Google Drive not connected")

    project = session.get(Project, project_id)
    service = gd.get_service(token, str(current_user.id), session)

    docs_root_id = gd.ensure_project_drive_child_folder(service, project_id, project.name, "Docs")

    mappings = session.exec(
        sel(DriveFileMapping).where(
            DriveFileMapping.project_id == project_id,
            DriveFileMapping.item_type == "doc",
        )
    ).all()

    updated = 0
    for mapping in mappings:
        try:
            file_info = service.files().get(
                fileId=mapping.drive_file_id, fields="id,name,parents"
            ).execute()
            parents = file_info.get("parents") or []
            if not parents:
                continue
            parent_id = parents[0]
            if parent_id == docs_root_id:
                new_folder = ""
            else:
                parent_info = service.files().get(
                    fileId=parent_id, fields="id,name"
                ).execute()
                new_folder = parent_info.get("name", "")
            path_str = f"{DOCS_DIR}/{mapping.item_id}.md"
            try:
                with project_worktree(project_id) as wt:
                    p = wt / path_str
                    if p.exists():
                        meta, body = fm.read(p)
                        if new_folder:
                            meta["folder"] = new_folder
                        else:
                            meta.pop("folder", None)
                        wt.commit_message = f"Sync folder for {mapping.item_id} from Drive"
                        fm.write(p, meta, body)
                        updated += 1
            except Exception:
                pass
        except Exception:
            pass

    return {"updated": updated, "synced_at": datetime.now(timezone.utc).isoformat()}


@router.get("/{doc_id}/drive-link")
def get_doc_drive_link(
    project_id: str,
    doc_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    from ..models import DriveFileMapping
    from sqlmodel import select as sel
    check_member(project_id, current_user, session)
    mapping = session.exec(
        sel(DriveFileMapping).where(
            DriveFileMapping.project_id == project_id,
            DriveFileMapping.item_type == "doc",
            DriveFileMapping.item_id == doc_id,
        )
    ).first()
    if not mapping:
        return {"drive_link": None, "synced_at": None}
    return {"drive_link": mapping.drive_link, "synced_at": mapping.synced_at}


@public_router.get("/{token}")
def get_public_doc_share(
    token: str,
    session: Session = Depends(get_session),
):
    share = session.exec(
        select(DocumentShare).where(
            DocumentShare.token == token,
            DocumentShare.enabled == True,  # noqa: E712
        )
    ).first()
    if not share:
        raise HTTPException(404, "Share link not found")

    document_type = "doc"
    try:
        if share.doc_id.startswith("meeting:"):
            from .meetings import _parse_meeting
            from ..core.paths import MEETINGS_DIR
            mtg_id = share.doc_id.split(":", 1)[1]
            doc = _parse_meeting(str(share.project_id), f"{MEETINGS_DIR}/{mtg_id}.md")
            document_type = "meeting"
        else:
            doc = _parse_doc(str(share.project_id), f"{DOCS_DIR}/{share.doc_id}.md")
    except FileNotFoundError:
        raise HTTPException(404, "Shared document not found")

    project = session.get(Project, share.project_id)
    return {
        "token": share.token,
        "project": {
            "id": str(share.project_id),
            "name": project.name if project else "Shared project",
        },
        "document": {
            **{k: v for k, v in doc.items() if k not in {"_path"}},
            "share_type": document_type,
        },
        "created_at": share.created_at,
    }
