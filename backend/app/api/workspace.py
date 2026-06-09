from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

import git as _git

from ..core.config import settings
from ..core.db import get_session
from ..core.security import get_current_user
from ..models import Project, User
from ..services import workspace as ws
from ..services.project_fs import project_worktree
from .projects import check_member

router = APIRouter(prefix="/projects/{project_id}/workspace", tags=["workspace"])

BOT_EMAIL = "bot@researchbuddy"


def _project(project_id: str, session: Session) -> Project:
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


def _git_url(project_id: str) -> str:
    return f"{settings.frontend_url.replace(':3000', ':8000')}/git/{project_id}"


def _open_repo(project_id: str) -> _git.Repo:
    bare = settings.projects_dir / f"{project_id}.git"
    return _git.Repo(str(bare))


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


@router.get("/files")
def list_workspace_files(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Return all file paths in the project repo at HEAD."""
    _project(project_id, session)
    check_member(project_id, current_user, session)
    try:
        repo = _open_repo(project_id)
        paths = sorted(
            item.path
            for item in repo.head.commit.tree.traverse()
            if item.type == "blob"
        )
    except Exception:
        paths = []
    return {"files": paths}


@router.get("/history")
def get_workspace_history(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Return user-pushed commits (excludes ResearchBuddy bot commits)."""
    _project(project_id, session)
    check_member(project_id, current_user, session)
    try:
        repo = _open_repo(project_id)
        commits = []
        for commit in repo.iter_commits("HEAD", max_count=200):
            if commit.author.email == BOT_EMAIL:
                continue
            commits.append({
                "sha": commit.hexsha[:8],
                "full_sha": commit.hexsha,
                "message": commit.message.strip().splitlines()[0][:120],
                "author": commit.author.name,
                "date": commit.committed_datetime.isoformat(),
            })
            if len(commits) >= 50:
                break
    except Exception:
        commits = []
    return {"commits": commits}


class RevertIn(BaseModel):
    full_sha: str
    message: str = ""


@router.post("/revert")
def revert_to_commit(
    project_id: str,
    body: RevertIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Create a new commit that restores the repo to the state of the given commit."""
    _project(project_id, session)
    check_member(project_id, current_user, session, min_role="member")

    sha = body.full_sha
    try:
        bare_repo = _open_repo(project_id)
        target = bare_repo.commit(sha)
    except Exception:
        raise HTTPException(400, f"Commit {sha} not found")

    target_paths = {
        item.path
        for item in target.tree.traverse()
        if item.type == "blob"
    }
    current_paths = {
        item.path
        for item in bare_repo.head.commit.tree.traverse()
        if item.type == "blob"
    }
    to_delete = current_paths - target_paths

    short = sha[:8]
    label = (body.message or target.message.strip().splitlines()[0])[:60]

    with project_worktree(project_id) as wt:
        wt.commit_message = f"Revert to {short}: {label}"
        work_repo = _git.Repo(str(wt))
        work_repo.git.checkout(sha, "--", ".")
        for rel in to_delete:
            p = Path(str(wt)) / rel
            if p.exists():
                p.unlink()

    return {"ok": True, "reverted_to": short}
