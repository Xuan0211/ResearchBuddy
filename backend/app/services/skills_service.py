"""Project skill discovery and management."""
from __future__ import annotations

import json
import re
import shutil
import zipfile
import io
from pathlib import Path
from typing import Any

import frontmatter as frontmatter_lib

from . import frontmatter as fm
from .project_fs import list_project_dir, project_worktree, read_project_file

SKILLS_ROOT = "skills"

# All sections that can have skills.json attachments
_SKILL_SECTIONS = ["papers", "meetings", "coding", "writing", "document", "images", "prototype", "skills"]


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
        "created_by": meta.get("created_by", ""),
        "creator_email": meta.get("creator_email", ""),
        "path": path,
        "folder": folder,
        "readonly": False,
    }
    if include_content:
        result["content"] = content
        result["metadata"] = meta
        # List extra files in the skill package directory (all files except SKILL.md itself)
        package_files: list[str] = []
        if len(parts) > 1:  # skill lives in a subdirectory (skills/{id}/SKILL.md)
            skill_dir = path.rsplit("/", 1)[0]  # e.g. "skills/my-skill"
            try:
                all_paths = list_project_dir(project_id, skill_dir)
                for p in sorted(all_paths):
                    if p == path or p.endswith(".gitkeep"):
                        continue
                    # Make path relative to the skill dir
                    rel_to_dir = p.removeprefix(skill_dir + "/")
                    if rel_to_dir:
                        package_files.append(rel_to_dir)
            except Exception:
                pass
        result["package_files"] = package_files
    return result


def _build_attachment_map(project_id: str) -> dict[str, list[str]]:
    """Return {skill_id: [section, ...]} by scanning all module skills.json files."""
    attachment: dict[str, list[str]] = {}
    for section in _SKILL_SECTIONS:
        try:
            content = read_project_file(project_id, f"{section}/skills.json")
            data = json.loads(content)
            for item in data.get("items", []):
                if isinstance(item, dict) and item.get("id"):
                    sid = str(item["id"])
                    if section not in attachment.get(sid, []):
                        attachment.setdefault(sid, []).append(section)
        except Exception:
            pass
    # Also scan scoped writing projects: writing/Project/*/skills.json
    try:
        for path in list_project_dir(project_id, "writing/Project"):
            if path.endswith("/skills.json"):
                try:
                    content = read_project_file(project_id, path)
                    data = json.loads(content)
                    for item in data.get("items", []):
                        if isinstance(item, dict) and item.get("id"):
                            sid = str(item["id"])
                            if "writing" not in attachment.get(sid, []):
                                attachment.setdefault(sid, []).append("writing")
                except Exception:
                    pass
    except Exception:
        pass
    return attachment


def get_skill_attachments(project_id: str, skill_id: str) -> list[str]:
    """Return list of section names where this skill is currently attached."""
    return _build_attachment_map(project_id).get(skill_id, [])


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


def _build_skill_content(
    skill_id: str,
    title: str,
    content: str,
    tags: list[str],
    sections: list[str] | None = None,
    created_by: str = "",
    creator_email: str = "",
) -> str:
    """Compose a full skill markdown file (frontmatter + body)."""
    fm_lines = ["---", f"id: {skill_id}", f"title: {title}"]
    if tags:
        fm_lines.append("tags: [" + ", ".join(tags) + "]")
    if sections:
        fm_lines.append("sections: [" + ", ".join(sections) + "]")
    if created_by:
        fm_lines.append(f"created_by: {created_by}")
    if creator_email:
        fm_lines.append(f"creator_email: {creator_email}")
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
    sections: list[str] | None = None,
    created_by: str = "",
    creator_email: str = "",
) -> str:
    """Create a new skill file in skills/ and return its id."""
    skill_id = slugify(title)
    tags = tags or []
    full_content = _build_skill_content(skill_id, title, content, tags, sections or [], created_by, creator_email)
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
    title: str | None = None,
    tags: list[str] | None = None,
    sections: list[str] | None = None,
    created_by: str = "",
    creator_email: str = "",
) -> str:
    """Upload a skill from raw .md content — preserves existing frontmatter."""
    # Try to parse the existing content
    try:
        post = frontmatter_lib.loads(content)
        meta = dict(post.metadata)
        skill_id = str(meta.get("id") or slugify(filename_stem))
        parsed_title = str(meta.get("title") or skill_id)
    except Exception:
        skill_id = slugify(filename_stem)
        parsed_title = filename_stem
        content = f"---\ntitle: {parsed_title}\n---\n\n{content}"

    post = frontmatter_lib.loads(content)
    meta = dict(post.metadata)
    body = post.content
    if title is not None:
        meta["title"] = title
    else:
        meta["title"] = meta.get("title") or parsed_title
    meta["id"] = skill_id
    if tags is not None:
        meta["tags"] = tags
    if sections is not None:
        meta["sections"] = sections
    if created_by and not meta.get("created_by"):
        meta["created_by"] = created_by
    if creator_email and not meta.get("creator_email"):
        meta["creator_email"] = creator_email
    import yaml
    front = yaml.dump(meta, allow_unicode=True, default_flow_style=False).rstrip()
    content = f"---\n{front}\n---\n{body}"

    with project_worktree(project_id) as wt:
        wt.commit_message = f"Upload skill: {meta.get('title', skill_id)}"
        if folder:
            target_dir = wt / SKILLS_ROOT / slugify(folder)
        else:
            target_dir = wt / SKILLS_ROOT / skill_id
        target_dir.mkdir(parents=True, exist_ok=True)
        (target_dir / "SKILL.md").write_text(content, encoding="utf-8")
    return skill_id


def _extract_zip_skill(raw: bytes) -> tuple[str, list[tuple[str, bytes]]]:
    """Extract SKILL.md content + extra files from a zip.

    Handles two layouts:
    - Flat root: SKILL.md at the top level
    - Single folder: folder/SKILL.md (typical macOS zip-a-folder behaviour)

    Returns (skill_md_content, [(relative_path, bytes), ...]) for extra files.
    """
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        # Filter out macOS __MACOSX artefacts and directory entries
        names = [
            n for n in zf.namelist()
            if not n.endswith("/") and not n.startswith("__MACOSX") and ".." not in Path(n).parts
        ]
        # 1. Try exact root
        root_skill = next((n for n in names if n == "SKILL.md"), "")
        prefix = ""

        if not root_skill:
            # 2. Try single top-level folder containing SKILL.md
            top_dirs = {n.split("/")[0] for n in names if "/" in n}
            if len(top_dirs) == 1:
                candidate = f"{top_dirs.pop()}/SKILL.md"
                if candidate in names:
                    root_skill = candidate
                    prefix = root_skill.rsplit("/", 1)[0] + "/"

        if not root_skill:
            raise ValueError(
                "Zip must contain SKILL.md at the archive root, or inside a single top-level folder "
                "(e.g. my-skill/SKILL.md)."
            )

        content = zf.read(root_skill).decode("utf-8", errors="replace")
        extras: list[tuple[str, bytes]] = []
        for name in names:
            if name == root_skill:
                continue
            rel = name[len(prefix):] if prefix and name.startswith(prefix) else name
            if rel:
                extras.append((rel, zf.read(name)))
    return content, extras


def create_skill_from_zip(
    project_id: str,
    raw: bytes,
    filename_stem: str,
    folder: str = "",
    title: str | None = None,
    tags: list[str] | None = None,
    sections: list[str] | None = None,
    created_by: str = "",
    creator_email: str = "",
) -> str:
    content, extra_files = _extract_zip_skill(raw)
    skill_id = create_skill_from_content(
        project_id,
        filename_stem=filename_stem,
        content=content,
        folder=folder,
        title=title,
        tags=tags,
        sections=sections,
        created_by=created_by,
        creator_email=creator_email,
    )
    skill = get_skill(project_id, skill_id)
    base = Path(skill["path"]).parent
    if extra_files:
        with project_worktree(project_id) as wt:
            wt.commit_message = f"Extract skill package: {skill_id}"
            for name, payload in extra_files:
                target = wt / base / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(payload)
    return skill_id


def update_skill(
    project_id: str,
    skill_id: str,
    title: str | None = None,
    content: str | None = None,
    tags: list[str] | None = None,
    sections: list[str] | None = None,
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
        if sections is not None:
            meta["sections"] = sections

        new_body = content if content is not None else body
        # Rebuild the file
        import yaml
        front = yaml.dump(meta, allow_unicode=True, default_flow_style=False).rstrip()
        file.write_text(f"---\n{front}\n---\n{new_body}", encoding="utf-8")


def _all_skills_json_paths(project_id: str) -> list[str]:
    """Return all skills.json relative paths found across all sections."""
    paths = []
    for section in _SKILL_SECTIONS:
        paths.append(f"{section}/skills.json")
    try:
        for p in list_project_dir(project_id, "writing/Project"):
            if p.endswith("/skills.json"):
                paths.append(p)
    except Exception:
        pass
    return paths


def delete_skill(project_id: str, skill_id: str) -> list[str]:
    """Delete a skill and remove it from all module skills.json files.

    Returns the list of section names that had this skill attached.
    """
    skill = get_skill(project_id, skill_id)
    path = Path(skill["path"])
    cleaned: list[str] = []

    with project_worktree(project_id) as wt:
        wt.commit_message = f"Delete skill: {skill_id}"
        # 1. Clean up all skills.json references
        for skills_json_rel in _all_skills_json_paths(project_id):
            json_path = wt / skills_json_rel
            if not json_path.exists():
                continue
            try:
                data = json.loads(json_path.read_text(encoding="utf-8"))
                items = data.get("items", [])
                filtered = [i for i in items if isinstance(i, dict) and str(i.get("id")) != skill_id]
                if len(filtered) != len(items):
                    data["items"] = filtered
                    json_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
                    # Derive a human-friendly section name
                    section = skills_json_rel.split("/")[0]
                    if section not in cleaned:
                        cleaned.append(section)
            except Exception:
                pass
        # 2. Delete the skill file/folder
        target = wt / str(path)
        if not target.exists():
            raise FileNotFoundError(skill_id)
        if path.name.lower() == "skill.md" and target.parent.name == skill_id:
            shutil.rmtree(target.parent)
        else:
            target.unlink()

    return cleaned
