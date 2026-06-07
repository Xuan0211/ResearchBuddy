"""Module-local documents, files, links, and skill attachments."""
from __future__ import annotations

import base64
import json
import shutil
import uuid
from pathlib import Path
from typing import Any

import frontmatter as frontmatter_lib

from . import frontmatter as fm
from .project_fs import list_project_dir, project_worktree, read_project_file
from .skills_service import get_skill, list_skills, slugify

ALLOWED_SECTIONS = {"papers", "meetings", "coding", "workspace", "writing", "docs", "images", "prototype"}
MAX_RESOURCE_BYTES = 25 * 1024 * 1024
DOCS_ROOT = "docs"


class ResourceValidationError(ValueError):
    """Raised when uploaded or attached resources cannot be safely parsed."""

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
        return f"writing/{clean_scope}"
    return {
        "papers": "papers",
        "meetings": "meetings",
        "coding": "coding",
        "workspace": "workspace",
        "writing": "writing",
        "docs": "docs",
        "images": "assets/images",
        "prototype": "prototypes",
    }[section]


def _docs_dir(section: str, scope: str = "") -> str:
    return f"{_resource_root(section, scope)}/docs"


def _files_dir(section: str, scope: str = "") -> str:
    return f"{_resource_root(section, scope)}/files"


def _skills_dir(section: str, scope: str = "") -> str:
    return f"{_resource_root(section, scope)}/skills"


def _docs_refs_path(section: str, scope: str = "") -> str:
    return f"{_resource_root(section, scope)}/docs.json"


def _links_path(section: str, scope: str = "") -> str:
    return f"{_resource_root(section, scope)}/links.json"


def _read_json(project_id: str, path: str, fallback: dict[str, Any]) -> dict[str, Any]:
    try:
        data = json.loads(read_project_file(project_id, path))
        return data if isinstance(data, dict) else fallback
    except Exception:
        return fallback


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


def _parse_local_skill(project_id: str, path: str, include_content: bool = False) -> dict[str, Any]:
    content = read_project_file(project_id, path)
    post = frontmatter_lib.loads(content)
    meta = dict(post.metadata)
    fallback_id = path.split("/")[-2] if path.endswith("/SKILL.md") else Path(path).stem
    skill_id = str(meta.get("id") or fallback_id)
    body = post.content
    title = str(meta.get("title") or meta.get("name") or skill_id)
    description = str(meta.get("description") or meta.get("summary") or "")
    result: dict[str, Any] = {
        "id": skill_id,
        "title": title,
        "description": description,
        "tags": meta.get("tags", []),
        "sections": [path.split("/", 1)[0]],
        "path": path,
        "folder": path.removeprefix("skills/").split("/", 1)[0],
        "readonly": False,
    }
    if include_content:
        result["content"] = content
        result["metadata"] = meta
    return result


def _validate_markdown_content(content: str, path: str) -> None:
    try:
        frontmatter_lib.loads(content)
    except Exception as exc:
        raise ResourceValidationError([{"path": path, "error": f"frontmatter parse failed: {exc}"}])


def _normalise_doc_path(project_id: str, path_or_id: str) -> str:
    raw = _safe_rel_path(path_or_id)
    candidates: list[str] = []
    if raw.startswith(f"{DOCS_ROOT}/"):
        candidates.append(raw)
    elif raw.endswith(".md"):
        candidates.append(f"{DOCS_ROOT}/{raw}")
    else:
        candidates.append(f"{DOCS_ROOT}/{raw}.md")
    for candidate in candidates:
        try:
            read_project_file(project_id, candidate)
            return candidate
        except FileNotFoundError:
            pass
    for path in list_project_dir(project_id, DOCS_ROOT):
        if not path.endswith(".md") or path.endswith(".gitkeep"):
            continue
        try:
            parsed = _parse_markdown_doc(project_id, path)
        except Exception:
            continue
        if parsed["id"] == raw or Path(path).stem == raw:
            return path
    raise FileNotFoundError(path_or_id)


def _normalise_docs_folder(project_id: str, folder: str) -> str:
    raw = _safe_rel_path(folder)
    path = raw if raw.startswith(f"{DOCS_ROOT}/") else f"{DOCS_ROOT}/{raw}"
    paths = list_project_dir(project_id, path)
    if not paths:
        raise FileNotFoundError(folder)
    return path.rstrip("/")


def _list_local_docs(project_id: str, section: str, scope: str) -> list[dict[str, Any]]:
    docs: list[dict[str, Any]] = []
    for path in list_project_dir(project_id, _docs_dir(section, scope)):
        if not path.endswith(".md") or path.endswith(".gitkeep"):
            continue
        try:
            docs.append(_parse_markdown_doc(project_id, path, include_content=True))
        except Exception:
            continue
    return docs


def _list_local_skills(project_id: str, section: str, scope: str) -> list[dict[str, Any]]:
    skills: dict[str, dict[str, Any]] = {}
    for path in list_project_dir(project_id, _skills_dir(section, scope)):
        if not path.endswith(".md") or path.endswith(".gitkeep"):
            continue
        try:
            skill = _parse_local_skill(project_id, path)
        except Exception:
            continue
        existing = skills.get(skill["id"])
        if not existing or path.endswith("/SKILL.md"):
            skills[skill["id"]] = skill
    return sorted(skills.values(), key=lambda item: item["title"].lower())


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


def _list_doc_refs(project_id: str, section: str, scope: str) -> list[dict[str, str]]:
    data = _read_json(project_id, _docs_refs_path(section, scope), {"items": []})
    refs: list[dict[str, str]] = []
    for item in data.get("items", []):
        if isinstance(item, dict) and item.get("target"):
            refs.append({
                "type": str(item.get("type") or "doc"),
                "path": str(item["target"]),
                "source": str(item.get("source") or ""),
            })
    return refs


def list_section_resources(project_id: str, section: str, scope: str = "") -> dict[str, Any]:
    _check_section(section)
    root = _resource_root(section, scope)
    local_docs = _list_local_docs(project_id, section, scope)
    local_skills = _list_local_skills(project_id, section, scope)
    root_paths = list_project_dir(project_id, root)
    return {
        "section": section,
        "scope": scope,
        "docs": sorted(local_docs, key=lambda item: item["title"].lower()),
        "attached_docs": [],
        "doc_refs": _list_doc_refs(project_id, section, scope),
        "skills": local_skills,
        "skill_ids": [skill["id"] for skill in local_skills],
        "links": _list_links(project_id, section, scope),
        "tree": _tree_from_paths(root_paths, root),
        "files": [path for path in list_project_dir(project_id, _files_dir(section, scope)) if not path.endswith(".gitkeep")],
        "local_root": root,
    }


def create_section_doc(project_id: str, section: str, title: str, content: str = "", scope: str = "") -> dict[str, Any]:
    _check_section(section)
    doc_id = slugify(title) or str(uuid.uuid4())[:8]
    meta = {"id": doc_id, "title": title, "document_type": "module_doc", "section": section, "tags": []}
    body = content if content.strip() else f"# {title}\n"
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Create {section} module doc: {title}"
        path = wt / _docs_dir(section, scope) / f"{doc_id}.md"
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
    scope: str = "",
) -> dict[str, Any]:
    _check_section(section)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update {section} module doc: {doc_id}"
        path = wt / _docs_dir(section, scope) / f"{doc_id}.md"
        if not path.exists():
            raise FileNotFoundError(doc_id)
        meta, current = fm.read(path)
        if title is not None:
            meta["title"] = title
        fm.write(path, meta, content if content is not None else current)
    return {"ok": True}


def delete_section_doc(project_id: str, section: str, doc_id: str, scope: str = "") -> None:
    _check_section(section)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Delete {section} module doc: {doc_id}"
        path = wt / _docs_dir(section, scope) / f"{doc_id}.md"
        if not path.exists():
            raise FileNotFoundError(doc_id)
        path.unlink()


def attach_doc_ref(project_id: str, section: str, path: str, kind: str = "doc", scope: str = "") -> dict[str, Any]:
    _check_section(section)
    if kind not in {"doc", "folder"}:
        raise ValueError("kind must be doc or folder")
    root_docs = _docs_dir(section, scope)
    source = _normalise_doc_path(project_id, path) if kind == "doc" else _normalise_docs_folder(project_id, path)
    sources = [source] if kind == "doc" else [
        item for item in list_project_dir(project_id, source)
        if item.endswith(".md") and not item.endswith(".gitkeep")
    ]
    issues: list[dict[str, str]] = []
    for src in sources:
        try:
            _validate_markdown_content(read_project_file(project_id, src), src)
        except ResourceValidationError as exc:
            issues.extend(exc.issues)
    if issues:
        raise ResourceValidationError(issues)

    with project_worktree(project_id) as wt:
        wt.commit_message = f"Attach docs to {section}: {source}"
        refs_path = wt / _docs_refs_path(section, scope)
        refs_path.parent.mkdir(parents=True, exist_ok=True)
        data = json.loads(refs_path.read_text(encoding="utf-8")) if refs_path.exists() else {"items": []}
        items = [item for item in data.get("items", []) if isinstance(item, dict)]
        for src in sources:
            if kind == "folder":
                rel = Path(src).relative_to(source)
                target = f"{root_docs}/{Path(source).name}/{rel}"
            else:
                target = f"{root_docs}/{Path(src).name}"
            dest = wt / target
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(read_project_file(project_id, src), encoding="utf-8")
            item = {"type": kind, "source": src, "target": target}
            if item not in items:
                items.append(item)
        refs_path.write_text(json.dumps({"items": items}, indent=2) + "\n", encoding="utf-8")
    return {"ok": True}


def detach_doc_ref(project_id: str, section: str, path: str, kind: str = "doc", scope: str = "") -> dict[str, Any]:
    _check_section(section)
    target = _safe_rel_path(path)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Detach {kind} docs from {section}: {target}"
        refs_path = wt / _docs_refs_path(section, scope)
        data = json.loads(refs_path.read_text(encoding="utf-8")) if refs_path.exists() else {"items": []}
        items = [item for item in data.get("items", []) if isinstance(item, dict)]
        next_items = [item for item in items if str(item.get("target")) != target]
        refs_path.parent.mkdir(parents=True, exist_ok=True)
        refs_path.write_text(json.dumps({"items": next_items}, indent=2) + "\n", encoding="utf-8")
        target_path = wt / target
        if target_path.exists() and target_path.is_file():
            target_path.unlink()
    return {"ok": True}


def upload_section_files(
    project_id: str,
    section: str,
    files: list[tuple[str, bytes]],
    target: str = "docs",
    scope: str = "",
) -> dict[str, Any]:
    _check_section(section)
    if target not in {"docs", "files"}:
        raise ValueError("target must be docs or files")
    issues: list[dict[str, str]] = []
    prepared: list[tuple[str, bytes]] = []
    total = 0
    base_dir = _docs_dir(section, scope) if target == "docs" else _files_dir(section, scope)
    for raw_path, content in files:
        total += len(content)
        try:
            rel = _safe_rel_path(raw_path)
        except ValueError as exc:
            issues.append({"path": raw_path, "error": str(exc)})
            continue
        if rel.endswith(".gitkeep"):
            continue
        if target == "docs" and not rel.lower().endswith(".md"):
            issues.append({"path": rel, "error": "Non-markdown files must be uploaded to files/"})
            continue
        if target == "docs":
            try:
                _validate_markdown_content(content.decode("utf-8"), rel)
            except UnicodeDecodeError as exc:
                issues.append({"path": rel, "error": f"Not valid UTF-8: {exc}"})
            except ResourceValidationError as exc:
                issues.extend(exc.issues)
        prepared.append((f"{base_dir}/{rel}", content))
    if total > MAX_RESOURCE_BYTES:
        issues.append({"path": ".", "error": f"Upload exceeds {MAX_RESOURCE_BYTES // (1024 * 1024)} MB limit"})
    if issues:
        raise ResourceValidationError(issues)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Upload {section} module files"
        for rel_path, content in prepared:
            path = wt / rel_path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
    return {"ok": True, "count": len(prepared)}


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


def attach_skill(project_id: str, section: str, skill_id: str, scope: str = "") -> dict[str, Any]:
    _check_section(section)
    skill = get_skill(project_id, skill_id)
    content = str(skill.get("content") or "")
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Attach skill to {section}: {skill_id}"
        path = wt / _skills_dir(section, scope) / skill_id / "SKILL.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    return {"ok": True}


def detach_skill(project_id: str, section: str, skill_id: str, scope: str = "") -> dict[str, Any]:
    _check_section(section)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Detach skill from {section}: {skill_id}"
        root = wt / _skills_dir(section, scope)
        target_dir = root / skill_id
        target_file = root / f"{skill_id}.md"
        if target_dir.exists():
            shutil.rmtree(target_dir)
        elif target_file.exists():
            target_file.unlink()
    return {"ok": True}
