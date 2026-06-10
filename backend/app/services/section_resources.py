"""Module-local doc references, skill references, and links."""
from __future__ import annotations

import base64
import json
import uuid
from pathlib import Path
from typing import Any

import frontmatter as frontmatter_lib

from .project_fs import list_project_dir, project_worktree, read_project_file
from .skills_service import get_skill

ALLOWED_SECTIONS = {"papers", "meetings", "coding", "writing", "document", "images", "prototype", "skills"}

_DOCS_SCHEMA = "researchbuddy.module.docs"
_SKILLS_SCHEMA = "researchbuddy.module.skills"
_SCHEMA_VERSION = "2.0"


class ResourceValidationError(ValueError):
    """Raised when resources cannot be safely parsed."""

    def __init__(self, issues: list[dict[str, str]]):
        super().__init__("Resource validation failed")
        self.issues = issues


def _check_section(section: str) -> str:
    if section not in ALLOWED_SECTIONS:
        raise ValueError(f"Unknown section: {section}")
    return section


def _safe_rel_path(path: str, *, allow_root: bool = False) -> str:
    cleaned = path.replace("\\", "/").strip().strip("/")
    if not cleaned and allow_root:
        return ""
    parts = [part for part in cleaned.split("/") if part]
    if not cleaned or cleaned.startswith("/") or any(part in {"..", "."} for part in parts):
        raise ValueError(f"Invalid path: {path}")
    return "/".join(parts)


def _resource_root(section: str, scope: str = "") -> str:
    _check_section(section)
    clean_scope = _safe_rel_path(scope, allow_root=True)
    if section == "writing" and clean_scope:
        return f"writing/Project/{clean_scope}"
    return {
        "papers": "papers",
        "meetings": "meetings",
        "coding": "coding",
        "writing": "writing",
        "document": "document",
        "images": "images",
        "prototype": "prototype",
        "skills": "skills",
    }[section]


def _links_path(section: str, scope: str = "") -> str:
    return f"{_resource_root(section, scope)}/links.json"


def _docs_json_path(section: str, scope: str = "") -> str:
    return f"{_resource_root(section, scope)}/docs.json"


def _skills_json_path(section: str, scope: str = "") -> str:
    return f"{_resource_root(section, scope)}/skills.json"


def _read_json(project_id: str, path: str, fallback: dict[str, Any]) -> dict[str, Any]:
    try:
        data = json.loads(read_project_file(project_id, path))
        return data if isinstance(data, dict) else fallback
    except Exception:
        return fallback


def _list_links(project_id: str, section: str, scope: str) -> list[dict[str, str]]:
    data = _read_json(project_id, _links_path(section, scope), {"links": []})
    links = data.get("links", [])
    if not isinstance(links, list):
        return []
    cleaned: list[dict[str, str]] = []
    for item in links:
        if not isinstance(item, dict) or not item.get("url"):
            continue
        cleaned.append({
            "id": str(item.get("id") or uuid.uuid4().hex[:8]),
            "kind": str(item.get("kind") or "link"),
            "title": str(item.get("title") or item.get("url")),
            "url": str(item.get("url")),
        })
    return cleaned


def _tree_from_paths(paths: list[str], root: str) -> list[dict[str, Any]]:
    root = root.rstrip("/")
    nodes: dict[str, dict[str, Any]] = {}
    top: list[dict[str, Any]] = []
    for path in sorted(paths):
        rel = path.removeprefix(f"{root}/")
        if not rel or rel.endswith(".gitkeep"):
            continue
        current = top
        prefix = ""
        parts = rel.split("/")
        for index, part in enumerate(parts):
            prefix = f"{prefix}/{part}".strip("/")
            node_path = f"{root}/{prefix}"
            is_file = index == len(parts) - 1
            node = nodes.get(node_path)
            if not node:
                node = {"type": "file" if is_file else "dir", "name": part, "path": node_path}
                if not is_file:
                    node["children"] = []
                nodes[node_path] = node
                current.append(node)
            current = node.setdefault("children", []) if not is_file else current
    return top


def _parse_markdown_doc(project_id: str, path: str, include_content: bool = False) -> dict[str, Any]:
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


# ── list ──────────────────────────────────────────────────────────────────────

def list_section_resources(project_id: str, section: str, scope: str = "") -> dict[str, Any]:
    _check_section(section)
    root = _resource_root(section, scope)

    docs_data = _read_json(project_id, _docs_json_path(section, scope), {"items": []})
    docs_items = [item for item in docs_data.get("items", []) if isinstance(item, dict)]

    skills_data = _read_json(project_id, _skills_json_path(section, scope), {"items": []})
    skills_items = [item for item in skills_data.get("items", []) if isinstance(item, dict)]

    return {
        "section": section,
        "docs": docs_items,
        "skills": skills_items,
        "links": _list_links(project_id, section, scope),
    }


# ── doc refs ──────────────────────────────────────────────────────────────────

def attach_doc_ref(
    project_id: str,
    section: str,
    path: str,
    kind: str = "doc",
    note: str = "",
    scope: str = "",
) -> dict[str, Any]:
    _check_section(section)
    if kind not in {"doc", "folder"}:
        raise ValueError("kind must be doc or folder")

    safe_path = _safe_rel_path(path)

    # Determine title
    if kind == "doc":
        content = read_project_file(project_id, safe_path)
        post = frontmatter_lib.loads(content)
        meta = dict(post.metadata)
        title = str(meta.get("title") or Path(safe_path).stem)
    else:
        title = safe_path.rstrip("/").split("/")[-1]

    item_id = uuid.uuid4().hex[:8]
    item: dict[str, Any] = {
        "id": item_id,
        "type": kind,
        "path": safe_path,
        "title": title,
        "note": note,
    }

    with project_worktree(project_id) as wt:
        wt.commit_message = f"Attach doc ref to {section}: {safe_path}"
        json_path = wt / _docs_json_path(section, scope)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        if json_path.exists():
            data = json.loads(json_path.read_text(encoding="utf-8"))
        else:
            data = {"schema": _DOCS_SCHEMA, "version": _SCHEMA_VERSION, "items": []}
        items = [i for i in data.get("items", []) if isinstance(i, dict)]
        # Avoid duplicate path
        if any(i.get("path") == safe_path for i in items):
            # Return existing item
            existing = next(i for i in items if i.get("path") == safe_path)
            return existing
        items.append(item)
        data["items"] = items
        json_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    return item


def detach_doc_ref(project_id: str, section: str, item_id: str, scope: str = "") -> None:
    _check_section(section)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Detach doc ref from {section}: {item_id}"
        json_path = wt / _docs_json_path(section, scope)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        if json_path.exists():
            data = json.loads(json_path.read_text(encoding="utf-8"))
        else:
            data = {"schema": _DOCS_SCHEMA, "version": _SCHEMA_VERSION, "items": []}
        items = [i for i in data.get("items", []) if isinstance(i, dict) and str(i.get("id")) != item_id]
        data["items"] = items
        json_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def update_doc_ref_note(project_id: str, section: str, item_id: str, note: str, scope: str = "") -> dict[str, Any]:
    _check_section(section)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update doc ref note in {section}: {item_id}"
        json_path = wt / _docs_json_path(section, scope)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        if json_path.exists():
            data = json.loads(json_path.read_text(encoding="utf-8"))
        else:
            data = {"schema": _DOCS_SCHEMA, "version": _SCHEMA_VERSION, "items": []}
        items = [i for i in data.get("items", []) if isinstance(i, dict)]
        updated: dict[str, Any] = {}
        for item in items:
            if str(item.get("id")) == item_id:
                item["note"] = note
                updated = item
        data["items"] = items
        json_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return updated


# ── skill refs ────────────────────────────────────────────────────────────────

def attach_skill(
    project_id: str,
    section: str,
    skill_id: str,
    note: str = "",
    scope: str = "",
) -> dict[str, Any]:
    _check_section(section)
    skill = get_skill(project_id, skill_id)
    item: dict[str, Any] = {
        "id": skill["id"],
        "path": skill["path"],
        "title": skill["title"],
        "description": skill.get("description", ""),
        "note": note,
    }

    with project_worktree(project_id) as wt:
        wt.commit_message = f"Attach skill to {section}: {skill_id}"
        json_path = wt / _skills_json_path(section, scope)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        if json_path.exists():
            data = json.loads(json_path.read_text(encoding="utf-8"))
        else:
            data = {"schema": _SKILLS_SCHEMA, "version": _SCHEMA_VERSION, "items": []}
        items = [i for i in data.get("items", []) if isinstance(i, dict)]
        # Replace if already present (update), otherwise append
        items = [i for i in items if str(i.get("id")) != skill_id]
        items.append(item)
        data["items"] = items
        json_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    return item


def detach_skill(project_id: str, section: str, skill_id: str, scope: str = "") -> None:
    _check_section(section)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Detach skill from {section}: {skill_id}"
        json_path = wt / _skills_json_path(section, scope)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        if json_path.exists():
            data = json.loads(json_path.read_text(encoding="utf-8"))
        else:
            data = {"schema": _SKILLS_SCHEMA, "version": _SCHEMA_VERSION, "items": []}
        items = [i for i in data.get("items", []) if isinstance(i, dict) and str(i.get("id")) != skill_id]
        data["items"] = items
        json_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def update_skill_note(project_id: str, section: str, skill_id: str, note: str, scope: str = "") -> dict[str, Any]:
    _check_section(section)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update skill note in {section}: {skill_id}"
        json_path = wt / _skills_json_path(section, scope)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        if json_path.exists():
            data = json.loads(json_path.read_text(encoding="utf-8"))
        else:
            data = {"schema": _SKILLS_SCHEMA, "version": _SCHEMA_VERSION, "items": []}
        items = [i for i in data.get("items", []) if isinstance(i, dict)]
        updated: dict[str, Any] = {}
        for item in items:
            if str(item.get("id")) == skill_id:
                item["note"] = note
                updated = item
        data["items"] = items
        json_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return updated


# ── links (unchanged) ─────────────────────────────────────────────────────────

def create_link(project_id: str, section: str, kind: str, title: str, url: str, scope: str = "") -> dict[str, str]:
    _check_section(section)
    if not url.startswith(("http://", "https://")):
        raise ValueError("Link URL must start with http:// or https://")
    link = {
        "id": base64.urlsafe_b64encode(uuid.uuid4().bytes).decode("ascii").rstrip("=")[:10],
        "kind": kind or "link",
        "title": title or url,
        "url": url,
    }
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Add {section} link: {link['title']}"
        path = wt / _links_path(section, scope)
        path.parent.mkdir(parents=True, exist_ok=True)
        data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"links": []}
        links = data.get("links", []) if isinstance(data.get("links", []), list) else []
        links.append(link)
        path.write_text(json.dumps({"links": links}, indent=2) + "\n", encoding="utf-8")
    return link


def delete_link(project_id: str, section: str, link_id: str, scope: str = "") -> dict[str, Any]:
    _check_section(section)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Delete {section} link: {link_id}"
        path = wt / _links_path(section, scope)
        path.parent.mkdir(parents=True, exist_ok=True)
        data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"links": []}
        links = [item for item in data.get("links", []) if isinstance(item, dict) and str(item.get("id")) != link_id]
        path.write_text(json.dumps({"links": links}, indent=2) + "\n", encoding="utf-8")
    return {"ok": True}
