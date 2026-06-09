from collections import defaultdict

from fastapi import HTTPException
from sqlmodel import Session, select

from ..models import Project, ProjectInvite, ProjectMember, User


VALID_ROLES = ("viewer", "member", "admin")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_role(role: str) -> str:
    normalized = role.strip().lower()
    if normalized not in VALID_ROLES:
        raise HTTPException(400, "Role must be admin, member, or viewer")
    return normalized


def is_project_creator(project: Project, user_id) -> bool:
    return str(project.created_by) == str(user_id)


def ensure_creator_admin(session: Session, project: Project) -> ProjectMember:
    member = session.exec(
        select(ProjectMember).where(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == project.created_by,
        )
    ).first()
    if member:
        if member.role != "admin":
            member.role = "admin"
            session.add(member)
        return member
    member = ProjectMember(project_id=project.id, user_id=project.created_by, role="admin")
    session.add(member)
    return member


def apply_pending_project_invites(session: Session, user: User) -> int:
    email = normalize_email(user.email)
    pending = session.exec(
        select(ProjectInvite).where(
            ProjectInvite.email == email,
            ProjectInvite.used == False,  # noqa: E712
        )
    ).all()
    if not pending:
        return 0

    by_project: dict[str, list[ProjectInvite]] = defaultdict(list)
    for invite in pending:
        by_project[str(invite.project_id)].append(invite)

    joined = 0
    for invites in by_project.values():
        invites.sort(key=lambda item: item.created_at, reverse=True)
        invite = invites[0]
        project = session.get(Project, invite.project_id)
        if not project:
            for row in invites:
                row.used = True
                session.add(row)
            continue

        ensure_creator_admin(session, project)
        existing = session.exec(
            select(ProjectMember).where(
                ProjectMember.project_id == invite.project_id,
                ProjectMember.user_id == user.id,
            )
        ).first()
        if not existing:
            session.add(ProjectMember(
                project_id=invite.project_id,
                user_id=user.id,
                role=validate_role(invite.role),
            ))
            joined += 1
        for row in invites:
            row.used = True
            session.add(row)
    return joined
