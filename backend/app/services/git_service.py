"""Manage bare git repos for research projects."""
import shutil
from pathlib import Path

import git

from ..core.config import settings


def init_project_repo(project_id: str) -> Path:
    bare_path = settings.projects_dir / f"{project_id}.git"
    bare_repo = git.Repo.init(str(bare_path), bare=True)

    tmp_path = settings.projects_dir / f"{project_id}_init_tmp"
    try:
        work_repo = bare_repo.clone(str(tmp_path))
        with work_repo.config_writer() as cw:
            cw.set_value("user", "name", "ResearchBuddy")
            cw.set_value("user", "email", "bot@researchbuddy")
        _copy_template(tmp_path)
        work_repo.git.add(A=True)
        work_repo.git.commit("-m", "Initial project structure", "--allow-empty")
        work_repo.remotes.origin.push("HEAD:refs/heads/main")
    finally:
        shutil.rmtree(tmp_path, ignore_errors=True)

    return bare_path


def _copy_template(dest: Path) -> None:
    tmpl = settings.project_template_dir
    if not tmpl.exists():
        return
    for src in tmpl.rglob("*"):
        if src.is_file():
            rel = src.relative_to(tmpl)
            dst = dest / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)


def get_repo_path(project_id: str) -> Path:
    return settings.projects_dir / f"{project_id}.git"


def repo_exists(project_id: str) -> bool:
    return (settings.projects_dir / f"{project_id}.git").exists()


def delete_project_repo(project_id: str) -> None:
    bare_path = settings.projects_dir / f"{project_id}.git"
    if bare_path.exists():
        shutil.rmtree(bare_path)
