from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from ..core.config import settings
from ..core.db import get_session
from ..core.security import get_current_user
from ..models import Project, User
from ..services import workspace as ws
from .projects import check_member

router = APIRouter(prefix="/projects/{project_id}/workspace", tags=["workspace"])


def _project(project_id: str, session: Session) -> Project:
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


def _git_url(project_id: str) -> str:
    return f"{settings.frontend_url.replace(':3000', ':8000')}/git/{project_id}"


@router.get("")
def get_workspace(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = _project(project_id, session)
    member = check_member(project_id, current_user, session)
    index = ws.build_workspace_index(project_id)
    return {
        "project": {"id": project_id, "name": project.name, "role": member.role},
        "git_url": _git_url(project_id),
        "manifest_path": ws.MANIFEST_PATH,
        "index_path": ws.INDEX_PATH,
        "workspace": index,
    }


@router.post("/ensure")
def ensure_workspace(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    project = _project(project_id, session)
    check_member(project_id, current_user, session, min_role="member")
    return ws.ensure_workspace(project_id, project.name)


@router.post("/reindex")
def reindex_workspace(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _project(project_id, session)
    check_member(project_id, current_user, session, min_role="member")
    return ws.write_workspace_index(project_id)
