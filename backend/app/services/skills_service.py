"""Project skill discovery and management."""
from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Any

import frontmatter as frontmatter_lib

from . import frontmatter as fm
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
    # Determine folder (subfolder under skills/)
    rel = path.removeprefix(f"{SKILLS_ROOT}/")
    parts = rel.split("/")
    folder = parts[0] if len(parts) > 1 else ""
    result: dict[str, Any] = {
        "id": skill_id,
        "title": title,
        "description": description,
        "tags": meta.get("tags", []),
        "sections": meta.get("sections", []),  # which sections this skill belongs to
        "path": path,
        "folder": folder,
        "readonly": False,
    }
    if include_content:
        result["content"] = content
        result["metadata"] = meta
    return result


def _build_attachment_map(project_id: str) -> dict[str, list[str]]:
    """Return {skill_id: [section, ...]} from module-local skills folders."""
    section_roots = {
        "papers": "papers/skills",
        "meetings": "meetings/skills",
        "coding": "coding/skills",
        "workspace": "workspace/skills",
        "docs": "docs/skills",
        "images": "assets/images/skills",
        "prototype": "prototypes/skills",
    }
    attachment: dict[str, list[str]] = {}
    for section, root in section_roots.items():
        for path in list_project_dir(project_id, root):
            if not path.endswith(".md") or path.endswith(".gitkeep"):
                continue
            sid = path.split("/")[-2] if path.endswith("/SKILL.md") else Path(path).stem
            attachment.setdefault(sid, []).append(section)
    for path in list_project_dir(project_id, "writing"):
        parts = path.split("/")
        if len(parts) >= 4 and parts[2] == "skills" and path.endswith(".md") and not path.endswith(".gitkeep"):
            sid = parts[-2] if path.endswith("/SKILL.md") else Path(path).stem
            attachment.setdefault(sid, []).append("writing")
    return attachment


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

    # Annotate each skill with the sections it's actually attached to
    attachment_map = _build_attachment_map(project_id)
    for sid, skill in skills.items():
        attached = attachment_map.get(sid, [])
        # Merge frontmatter `sections` hint with actual json attachments
        fm_sections: list = skill.get("sections") or []
        merged = list(dict.fromkeys(attached + fm_sections))  # attached first, deduplicated
        skill["sections"] = merged
        skill["attached_sections"] = attached

    return sorted(skills.values(), key=lambda item: item["title"].lower())


def get_skill(project_id: str, skill_id: str) -> dict[str, Any]:
    for skill in list_skills(project_id):
        if skill["id"] == skill_id:
            return _parse_skill(project_id, skill["path"], include_content=True)
    raise FileNotFoundError(skill_id)


def _build_skill_content(title: str, content: str, tags: list[str]) -> str:
    """Compose a full skill markdown file (frontmatter + body)."""
    fm_lines = ["---", f"title: {title}"]
    if tags:
        fm_lines.append("tags: [" + ", ".join(tags) + "]")
    fm_lines.append("---")
    fm_lines.append("")
    body = content if content.strip() else f"# {title}\n\nDescribe this skill here.\n"
    return "\n".join(fm_lines) + "\n" + body


def create_skill(
    project_id: str,
    title: str,
    content: str = "",
    tags: list[str] | None = None,
    folder: str = "",
) -> str:
    """Create a new skill file in skills/ and return its id."""
    skill_id = slugify(title)
    tags = tags or []
    full_content = _build_skill_content(title, content, tags)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Create skill: {title}"
        if folder:
            target_dir = wt / SKILLS_ROOT / slugify(folder)
        else:
            target_dir = wt / SKILLS_ROOT / skill_id
        target_dir.mkdir(parents=True, exist_ok=True)
        skill_file = target_dir / "SKILL.md"
        skill_file.write_text(full_content, encoding="utf-8")
    return skill_id


def create_skill_from_content(
    project_id: str,
    filename_stem: str,
    content: str,
    folder: str = "",
) -> str:
    """Upload a skill from raw .md content — preserves existing frontmatter."""
    # Try to parse the existing content
    try:
        post = frontmatter_lib.loads(content)
        meta = dict(post.metadata)
        skill_id = str(meta.get("id") or slugify(filename_stem))
        title = str(meta.get("title") or skill_id)
    except Exception:
        skill_id = slugify(filename_stem)
        title = filename_stem
        content = f"---\ntitle: {title}\n---\n\n{content}"

    with project_worktree(project_id) as wt:
        wt.commit_message = f"Upload skill: {title}"
        if folder:
            target_dir = wt / SKILLS_ROOT / slugify(folder)
        else:
            target_dir = wt / SKILLS_ROOT / skill_id
        target_dir.mkdir(parents=True, exist_ok=True)
        (target_dir / "SKILL.md").write_text(content, encoding="utf-8")
    return skill_id


def update_skill(
    project_id: str,
    skill_id: str,
    title: str | None = None,
    content: str | None = None,
    tags: list[str] | None = None,
) -> None:
    """Edit an existing skill's content and/or metadata."""
    skill = get_skill(project_id, skill_id)
    path = skill["path"]
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update skill: {skill_id}"
        file = wt / path
        if not file.exists():
            raise FileNotFoundError(skill_id)
        existing_content = file.read_text(encoding="utf-8")
        try:
            post = frontmatter_lib.loads(existing_content)
            meta = dict(post.metadata)
            body = post.content
        except Exception:
            meta = {}
            body = existing_content

        if title is not None:
            meta["title"] = title
        if tags is not None:
            meta["tags"] = tags

        new_body = content if content is not None else body
        # Rebuild the file
        import yaml
        front = yaml.dump(meta, allow_unicode=True, default_flow_style=False).rstrip()
        file.write_text(f"---\n{front}\n---\n{new_body}", encoding="utf-8")


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
