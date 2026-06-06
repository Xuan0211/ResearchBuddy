"""Project skill discovery and management."""
from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Any

import frontmatter as frontmatter_lib

from .project_fs import list_project_dir, project_worktree, read_project_file

SKILLS_ROOT = "skills"


def slugify(value: str) -> str:
    slug = re.sub(r"[^\w-]", "", value.lower().replace(" ", "-"))[:48]
    return slug or "skill"


def _skill_id_from_path(path: str) -> str:
    rel = path.removeprefix(f"{SKILLS_ROOT}/")
    parts = rel.split("/")
    if len(parts) > 1 and parts[-1].lower() == "skill.md":
        return parts[0]
    return Path(rel).stem


def _first_heading(body: str) -> str:
    for line in body.splitlines():
        text = line.strip()
        if text.startswith("#"):
            return text.lstrip("#").strip()
    return ""


def _first_paragraph(body: str) -> str:
    chunks: list[str] = []
    for line in body.splitlines():
        text = line.strip()
        if not text or text.startswith("#"):
            if chunks:
                break
            continue
        chunks.append(text)
    return " ".join(chunks)[:280]


def _parse_skill(project_id: str, path: str, include_content: bool = False) -> dict[str, Any]:
    content = read_project_file(project_id, path)
    post = frontmatter_lib.loads(content)
    meta = dict(post.metadata)
    skill_id = str(meta.get("id") or _skill_id_from_path(path))
    body = post.content
    title = str(meta.get("title") or meta.get("name") or _first_heading(body) or skill_id)
    description = str(meta.get("description") or meta.get("summary") or _first_paragraph(body))
    result: dict[str, Any] = {
        "id": skill_id,
        "title": title,
        "description": description,
        "tags": meta.get("tags", []),
        "path": path,
        "readonly": True,
    }
    if include_content:
        result["content"] = content
        result["metadata"] = meta
    return result


def list_skills(project_id: str) -> list[dict[str, Any]]:
    skills: dict[str, dict[str, Any]] = {}
    for path in list_project_dir(project_id, SKILLS_ROOT):
        if not path.endswith(".md") or path.endswith(".gitkeep"):
            continue
        try:
            skill = _parse_skill(project_id, path)
        except Exception:
            continue
        existing = skills.get(skill["id"])
        if not existing or path.endswith("/SKILL.md"):
            skills[skill["id"]] = skill
    return sorted(skills.values(), key=lambda item: item["title"].lower())


def get_skill(project_id: str, skill_id: str) -> dict[str, Any]:
    for skill in list_skills(project_id):
        if skill["id"] == skill_id:
            return _parse_skill(project_id, skill["path"], include_content=True)
    raise FileNotFoundError(skill_id)


def delete_skill(project_id: str, skill_id: str) -> None:
    skill = get_skill(project_id, skill_id)
    path = Path(skill["path"])
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Delete skill: {skill_id}"
        target = wt / str(path)
        if not target.exists():
            raise FileNotFoundError(skill_id)
        if path.name.lower() == "skill.md" and target.parent.name == skill_id:
            shutil.rmtree(target.parent)
        else:
            target.unlink()
