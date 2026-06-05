"""In-memory cache for paper lists, keyed by (project_id, git HEAD SHA).
Invalidated automatically whenever a commit is made to the repo."""
import threading
from pathlib import Path

import git

from ..core.config import settings

_lock = threading.Lock()
_cache: dict[str, tuple[str, list]] = {}  # project_id -> (sha, papers)


def get_head_sha(project_id: str) -> str:
    bare = settings.projects_dir / f"{project_id}.git"
    repo = git.Repo(str(bare))
    return repo.head.commit.hexsha


def get(project_id: str) -> list | None:
    sha = get_head_sha(project_id)
    with _lock:
        entry = _cache.get(project_id)
        if entry and entry[0] == sha:
            return entry[1]
    return None


def set(project_id: str, papers: list) -> None:
    sha = get_head_sha(project_id)
    with _lock:
        _cache[project_id] = (sha, papers)


def invalidate(project_id: str) -> None:
    with _lock:
        _cache.pop(project_id, None)
