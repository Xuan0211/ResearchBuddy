"""Agent-native project workspace helpers.

The project git repo is the source of truth. ResearchBuddy indexes it and keeps
system metadata under .researchbuddy without making agents depend on the DB.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import frontmatter as frontmatter_lib
import git

from ..core.config import settings
from .project_fs import project_worktree

WORKSPACE_VERSION = "0.1"
SYSTEM_DIR = ".researchbuddy"
MANIFEST_PATH = f"{SYSTEM_DIR}/workspace.json"
INDEX_PATH = f"{SYSTEM_DIR}/index.json"

CONTENT_DIRS = {
    "papers": "Paper notes and bibliographic metadata",
    "docs": "Long-form notes, drafts, and shared project documents",
    "meetings": "Meeting notes and agenda records",
    "prototypes": "Prototype code, experiments, and design explorations",
    "writing": "Paper-writing workspace, including LaTeX projects",
    "assets": "Images, PDFs, datasets, and other binary assets",
    "team": "Shared contacts, roles, and collaboration metadata",
    "skills": "Reusable agent/team playbooks and local skills",
    "workspace": "Workspace-level agent instructions, docs, and companion files",
}

DEFAULT_MANIFEST: dict[str, Any] = {
    "schema": "researchbuddy.workspace",
    "version": WORKSPACE_VERSION,
    "source_of_truth": "git-workspace",
    "agent_contract": {
        "editable": ["papers", "docs", "meetings", "prototypes", "writing", "assets", "team", "skills", "workspace"],
        "system_owned": [SYSTEM_DIR],
        "content_format": "markdown-with-yaml-frontmatter",
        "citation_syntax": "[[paper_id]]",
    },
    "folders": CONTENT_DIRS,
    "extensions": {
        "paper_writing": {
            "root": "writing",
            "preferred": ["latex", "markdown"],
        },
        "prototype_development": {
            "root": "prototypes",
            "preferred": ["web", "notebooks", "scripts"],
        },
        "team_skills": {
            "root": "skills",
            "preferred": ["markdown", "codex-skill"],
        },
        "module_resources": {
            "root": "<module>/skills|docs|files",
            "preferred": ["codex-skill", "markdown", "json", "assets"],
            "contract": {
                "skills": "Each module keeps copied skills in <module>/skills/ so cloned agents can read them locally.",
                "docs": "Each module keeps supporting docs in <module>/docs/.",
                "files": "Each module keeps non-markdown companion files in <module>/files/.",
                "links": "External design/code links live in <module>/links.json.",
                "writing": "Writing resources are scoped per paper at writing/<writing_id>/skills|docs|files.",
            },
        },
    },
    "sync": {
        "zotero": {"state": f"{SYSTEM_DIR}/zotero-map.json"},
        "google_drive": {
            "settings": f"{SYSTEM_DIR}/drive-settings.json",
            "state": f"{SYSTEM_DIR}/drive-map.json",
        },
        "index": {"state": INDEX_PATH},
    },
}


def _repo(project_id: str) -> git.Repo:
    return git.Repo(str(settings.projects_dir / f"{project_id}.git"))


def _all_blob_paths(project_id: str) -> list[str]:
    repo = _repo(project_id)
    return sorted(item.path for item in repo.head.commit.tree.traverse() if item.type == "blob")


def _read_blob(project_id: str, rel_path: str) -> str:
    repo = _repo(project_id)
    return repo.head.commit.tree[rel_path].data_stream.read().decode("utf-8")


def _load_manifest(project_id: str) -> tuple[dict[str, Any], bool]:
    try:
        return json.loads(_read_blob(project_id, MANIFEST_PATH)), True
    except Exception:
        return dict(DEFAULT_MANIFEST), False


def ensure_workspace(project_id: str, project_name: str = "") -> dict[str, Any]:
    """Create missing Agent workspace folders and system files."""
    created: list[str] = []
    with project_worktree(project_id) as wt:
        wt.commit_message = "Ensure ResearchBuddy workspace"
        root = Path(wt.__fspath__())

        for rel_dir in [
            *CONTENT_DIRS.keys(),
            SYSTEM_DIR,
            "workspace/docs",
            "workspace/skills",
            "workspace/files",
            "assets/images",
            "assets/images/docs",
            "assets/images/skills",
            "assets/images/files",
            "assets/pdfs",
            "papers/docs",
            "papers/skills",
            "papers/files",
            "meetings/docs",
            "meetings/skills",
            "meetings/files",
            "coding/docs",
            "coding/skills",
            "coding/files",
            "docs/docs",
            "docs/skills",
            "docs/files",
            "skills/docs",
            "skills/skills",
            "skills/files",
            "prototypes/docs",
            "prototypes/skills",
            "prototypes/files",
        ]:
            path = root / rel_dir
            path.mkdir(parents=True, exist_ok=True)
            keep = path / ".gitkeep"
            if not keep.exists() and not any(path.iterdir()):
                keep.write_text("", encoding="utf-8")
                created.append(str(keep.relative_to(root)))

        manifest_path = root / MANIFEST_PATH
        if not manifest_path.exists():
            manifest = dict(DEFAULT_MANIFEST)
            if project_name:
                manifest["project_name"] = project_name
            manifest_path.parent.mkdir(parents=True, exist_ok=True)
            manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            created.append(MANIFEST_PATH)

        readme = root / SYSTEM_DIR / "README.md"
        if not readme.exists():
            readme.write_text(
                "# ResearchBuddy Workspace\n\n"
                "Agents should edit the top-level content folders. ResearchBuddy owns files in this directory, "
                "including indexes, sync state, and adapter metadata.\n",
                encoding="utf-8",
            )
            created.append(f"{SYSTEM_DIR}/README.md")

        contacts = root / "team" / "contacts.json"
        if not contacts.exists():
            contacts.parent.mkdir(parents=True, exist_ok=True)
            contacts.write_text('{\n  "contacts": []\n}\n', encoding="utf-8")
            created.append("team/contacts.json")

    return {"created": created, "manifest": _load_manifest(project_id)[0]}


def _parse_markdown(project_id: str, path: str) -> tuple[dict[str, Any], str, list[str]]:
    issues: list[str] = []
    try:
        post = frontmatter_lib.loads(_read_blob(project_id, path))
        meta = dict(post.metadata)
        return meta, post.content, issues
    except Exception as exc:
        issues.append(f"{path}: frontmatter parse failed: {exc}")
        return {}, "", issues


def _is_module_resource_path(path: str) -> bool:
    parts = path.split("/")
    resource_dirs = {"skills", "docs", "files"}
    if len(parts) >= 3 and parts[0] in {"papers", "meetings", "coding", "prototypes", "workspace"} and parts[1] in resource_dirs:
        return True
    if len(parts) >= 3 and parts[0] == "skills" and parts[1] in resource_dirs:
        return True
    if len(parts) >= 3 and parts[0] == "docs" and parts[1] in {"skills", "files"}:
        return True
    if len(parts) >= 4 and parts[0] == "writing" and parts[2] in resource_dirs:
        return True
    if len(parts) >= 4 and parts[0] == "assets" and parts[1] == "images" and parts[2] in resource_dirs:
        return True
    return False


def build_workspace_index(project_id: str) -> dict[str, Any]:
    """Build an index from the git workspace without mutating it."""
    manifest, manifest_exists = _load_manifest(project_id)
    paths = _all_blob_paths(project_id)
    issues: list[str] = []
    items: list[dict[str, Any]] = []
    counts = {key: 0 for key in CONTENT_DIRS}

    for path in paths:
        top = path.split("/", 1)[0]
        if top in counts and not path.endswith(".gitkeep"):
            counts[top] += 1
        if _is_module_resource_path(path):
            continue
        if top not in {"papers", "docs", "meetings", "writing", "skills"} or not path.endswith(".md"):
            continue

        meta, body, parse_issues = _parse_markdown(project_id, path)
        issues.extend(parse_issues)
        item_id = meta.get("id") or Path(path).stem
        refs = sorted(set(re.findall(r"\[\[([^\]]+)\]\]", body)))
        items.append({
            "id": item_id,
            "type": top[:-1] if top.endswith("s") else top,
            "path": path,
            "title": meta.get("title") or item_id,
            "tags": meta.get("tags", []),
            "refs": refs,
            "updated": meta.get("updated", ""),
        })

    if not manifest_exists:
        issues.append(f"{MANIFEST_PATH} is missing; run ensure workspace.")

    return {
        "schema": "researchbuddy.workspace.index",
        "version": WORKSPACE_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "manifest": manifest,
        "counts": counts,
        "items": items,
        "issues": issues,
    }


def write_workspace_index(project_id: str) -> dict[str, Any]:
    index = build_workspace_index(project_id)
    with project_worktree(project_id) as wt:
        wt.commit_message = "Update ResearchBuddy workspace index"
        path = wt / INDEX_PATH
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    return index
