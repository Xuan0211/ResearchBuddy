from pathlib import Path
import os
import subprocess

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


class UtilityRunIn(BaseModel):
    path: str
    args: list[str] = []


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


@router.get("/git-info")
def get_git_info(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _project(project_id, session)
    check_member(project_id, current_user, session)
    try:
        repo = _open_repo(project_id)
        head = repo.head.commit
        branch = repo.git.symbolic_ref("--short", "HEAD")
        remotes = [
            {"name": remote.name, "urls": list(remote.urls)}
            for remote in repo.remotes
        ]
        return {
            "branch": branch,
            "sha": head.hexsha[:8],
            "full_sha": head.hexsha,
            "message": head.message.strip().splitlines()[0],
            "author": head.author.name,
            "date": head.committed_datetime.isoformat(),
            "remotes": remotes,
        }
    except Exception as exc:
        raise HTTPException(500, f"Could not read git info: {exc}")


@router.post("/git-pull")
def pull_git_remote(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _project(project_id, session)
    check_member(project_id, current_user, session, min_role="member")
    try:
        repo = _open_repo(project_id)
        if "origin" not in [r.name for r in repo.remotes]:
            return {
                "ok": False,
                "message": "No origin remote configured. Use Git access to clone this project, then push from your local clone.",
            }
        branch = repo.git.symbolic_ref("--short", "HEAD")
        repo.git.fetch("origin", branch)
        local = repo.commit(branch).hexsha
        remote_ref = f"origin/{branch}"
        remote = repo.commit(remote_ref).hexsha
        if local == remote:
            return {"ok": True, "message": "Already up to date", "sha": local[:8]}
        try:
            repo.git.merge_base("--is-ancestor", local, remote)
        except Exception:
            raise HTTPException(409, "Remote is not a fast-forward of the local project repo")
        repo.git.update_ref(f"refs/heads/{branch}", remote)
        return {"ok": True, "message": f"Fast-forwarded {branch} to {remote[:8]}", "sha": remote[:8]}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Pull failed: {exc}")


@router.post("/git-push")
def push_git_remote(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _project(project_id, session)
    check_member(project_id, current_user, session, min_role="member")
    try:
        repo = _open_repo(project_id)
        if "origin" not in [r.name for r in repo.remotes]:
            return {
                "ok": False,
                "message": "No origin remote configured. Use Git access to clone this project, then push from your local clone.",
            }
        branch = repo.git.symbolic_ref("--short", "HEAD")
        output = repo.git.push("origin", f"{branch}:{branch}")
        return {"ok": True, "message": output or f"Pushed {branch}"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Push failed: {exc}")


@router.get("/utils")
def list_utils(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _project(project_id, session)
    check_member(project_id, current_user, session)
    try:
        repo = _open_repo(project_id)
        scripts = []
        for item in repo.head.commit.tree.traverse():
            if item.type != "blob" or not item.path.endswith(".sh"):
                continue
            parts = item.path.split("/")
            if len(parts) >= 3 and parts[-2] == "utils.read_only":
                scripts.append({
                    "path": item.path,
                    "module": parts[0],
                    "name": parts[-1],
                })
        return {"scripts": sorted(scripts, key=lambda s: s["path"])}
    except Exception as exc:
        raise HTTPException(500, f"Could not list utilities: {exc}")


@router.post("/utils/run")
def run_utility(
    project_id: str,
    body: UtilityRunIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _project(project_id, session)
    check_member(project_id, current_user, session, min_role="member")
    rel = body.path.strip()
    parts = rel.split("/")
    if rel.startswith("/") or ".." in parts or not rel.endswith(".sh") or len(parts) < 3 or parts[-2] != "utils.read_only":
        raise HTTPException(400, "Only scripts under */utils.read_only/*.sh can be run")
    if len(body.args) > 8 or any("\x00" in arg for arg in body.args):
        raise HTTPException(400, "Invalid utility arguments")

    with project_worktree(project_id) as wt:
        root = Path(str(wt))
        script = root / rel
        if not script.exists():
            raise HTTPException(404, "Utility script not found")
        wt.commit_message = f"Run utility: {rel}"
        env = dict(os.environ)
        env["RB_WORKSPACE_ROOT"] = str(root)
        result = subprocess.run(
            ["sh", str(script), *body.args],
            cwd=str(root),
            env=env,
            text=True,
            capture_output=True,
            timeout=60,
        )
        if result.returncode != 0:
            raise HTTPException(400, {
                "message": "Utility failed",
                "operation": rel,
                "error": (result.stderr or result.stdout or f"Exited with {result.returncode}")[-4000:],
            })
        return {
            "ok": result.returncode == 0,
            "returncode": result.returncode,
            "stdout": result.stdout[-4000:],
            "stderr": result.stderr[-4000:],
        }
