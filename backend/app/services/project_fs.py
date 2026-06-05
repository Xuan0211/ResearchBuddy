"""Read/write project files via a temporary clone of the bare repo."""
import shutil
from contextlib import contextmanager
from pathlib import Path

import git

from ..core.config import settings


class _Worktree:
    """Thin wrapper around a cloned working tree path."""
    def __init__(self, path: Path, repo: git.Repo):
        self._path = path
        self._repo = repo
        self.commit_message = "Update project"

    def __truediv__(self, other):
        return self._path / other

    def __fspath__(self):
        return str(self._path)


@contextmanager
def project_worktree(project_id: str):
    """
    Yield a _Worktree for the project. Edit files via `wt / "subpath"`.
    Set `wt.commit_message` before any writes. Changes are committed on exit.
    """
    bare = settings.projects_dir / f"{project_id}.git"
    tmp = settings.projects_dir / f"{project_id}_wt_tmp"
    try:
        repo = git.Repo.clone_from(str(bare), str(tmp))
        wt = _Worktree(tmp, repo)
        yield wt
        repo.git.add(A=True)
        if repo.is_dirty(untracked_files=True):
            repo.git.commit("-m", wt.commit_message)
            repo.remotes.origin.push()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def read_project_file(project_id: str, rel_path: str) -> str:
    bare = settings.projects_dir / f"{project_id}.git"
    repo = git.Repo(str(bare))
    try:
        blob = repo.head.commit.tree[rel_path]
        return blob.data_stream.read().decode("utf-8")
    except KeyError:
        raise FileNotFoundError(rel_path)


def list_project_dir(project_id: str, rel_dir: str) -> list[str]:
    bare = settings.projects_dir / f"{project_id}.git"
    repo = git.Repo(str(bare))
    try:
        tree = repo.head.commit.tree[rel_dir]
    except KeyError:
        return []
    return [item.path for item in tree.traverse() if item.type == "blob"]
