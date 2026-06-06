"""Section-scoped documents and skill attachments."""
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

import frontmatter as frontmatter_lib

from . import frontmatter as fm
from .project_fs import list_project_dir, project_worktree, read_project_file
from .skills_service import get_skill, list_skills, slugify

RESOURCES_ROOT = "section-resources"
ALLOWED_SECTIONS = {"papers", "meetings", "coding", "workspace"}


def _check_section(section: str) -> str:
    if section not in ALLOWED_SECTIONS:
        raise ValueError(f"Unknown section: {section}")
    return section


def _docs_dir(section: str) -> str:
    return f"{RESOURCES_ROOT}/{section}/docs"


def _skills_path(section: str) -> str:
    return f"{RESOURCES_ROOT}/{section}/skills.json"


def _parse_doc(project_id: str, path: str, include_content: bool = False) -> dict[str, Any]:
    content = read_project_file(project_id, path)
    post = frontmatter_lib.loads(content)
    meta = dict(post.metadata)
    doc_id = str(meta.get("id") or Path(path).stem)
    result: dict[str, Any] = {
        "id": doc_id,
        "title": meta.get("title") or doc_id,
        "tags": meta.get("tags", []),
        "path": path,
    }
    if include_content:
        result["content"] = post.content
        result["metadata"] = meta
    return result


def list_section_resources(project_id: str, section: str) -> dict[str, Any]:
    _check_section(section)
    docs = []
    for path in list_project_dir(project_id, _docs_dir(section)):
        if not path.endswith(".md") or path.endswith(".gitkeep"):
            continue
        try:
            docs.append(_parse_doc(project_id, path, include_content=True))
        except Exception:
            continue

    attached_ids = []
    try:
        data = json.loads(read_project_file(project_id, _skills_path(section)))
        attached_ids = [str(item) for item in data.get("skills", [])]
    except Exception:
        attached_ids = []

    skills_by_id = {skill["id"]: skill for skill in list_skills(project_id)}
    return {
        "section": section,
        "docs": sorted(docs, key=lambda item: item["title"].lower()),
        "skills": [skills_by_id[sid] for sid in attached_ids if sid in skills_by_id],
        "skill_ids": attached_ids,
        "local_root": f"{RESOURCES_ROOT}/{section}",
    }


def create_section_doc(project_id: str, section: str, title: str, content: str = "") -> dict[str, Any]:
    _check_section(section)
    doc_id = slugify(title) or str(uuid.uuid4())[:8]
    meta = {
        "id": doc_id,
        "title": title,
        "document_type": "section_doc",
        "section": section,
        "tags": [],
    }
    body = content if content.strip() else f"# {title}\n"
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Create {section} resource doc: {title}"
        path = wt / _docs_dir(section) / f"{doc_id}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            raise FileExistsError(doc_id)
        fm.write(path, meta, body)
    return {"id": doc_id}


def update_section_doc(
    project_id: str,
    section: str,
    doc_id: str,
    title: str | None = None,
    content: str | None = None,
) -> dict[str, Any]:
    _check_section(section)
    path_str = f"{_docs_dir(section)}/{doc_id}.md"
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update {section} resource doc: {doc_id}"
        path = wt / path_str
        if not path.exists():
            raise FileNotFoundError(doc_id)
        meta, current = fm.read(path)
        if title is not None:
            meta["title"] = title
        fm.write(path, meta, content if content is not None else current)
    return {"ok": True}


def delete_section_doc(project_id: str, section: str, doc_id: str) -> None:
    _check_section(section)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Delete {section} resource doc: {doc_id}"
        path = wt / _docs_dir(section) / f"{doc_id}.md"
        if not path.exists():
            raise FileNotFoundError(doc_id)
        path.unlink()


def attach_skill(project_id: str, section: str, skill_id: str) -> dict[str, Any]:
    _check_section(section)
    get_skill(project_id, skill_id)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Attach skill to {section}: {skill_id}"
        path = wt / _skills_path(section)
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
        else:
            data = {"skills": []}
        skills = [str(item) for item in data.get("skills", [])]
        if skill_id not in skills:
            skills.append(skill_id)
        path.write_text(json.dumps({"skills": skills}, indent=2) + "\n", encoding="utf-8")
    return {"ok": True}


def detach_skill(project_id: str, section: str, skill_id: str) -> dict[str, Any]:
    _check_section(section)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Detach skill from {section}: {skill_id}"
        path = wt / _skills_path(section)
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
        else:
            data = {"skills": []}
        skills = [str(item) for item in data.get("skills", []) if str(item) != skill_id]
        path.write_text(json.dumps({"skills": skills}, indent=2) + "\n", encoding="utf-8")
    return {"ok": True}
