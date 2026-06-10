"""Agent-native project workspace helpers (v2 structure)."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import frontmatter as frontmatter_lib
import git

from ..core.config import settings
from ..core.paths import (
    PAPERS_NOTES_DIR, MEETINGS_DIR, DOCS_DIR,
    WRITING_BASE, PROJECT_INFO_DIR,
)
from .project_fs import project_worktree

WORKSPACE_VERSION = "2.0"
SYSTEM_DIR = ".researchbuddy"
MANIFEST_PATH = f"{SYSTEM_DIR}/workspace.json"
INDEX_PATH = f"{SYSTEM_DIR}/index.json"

LIST_WRITING_PROJECTS_SH = """#!/usr/bin/env sh
set -eu

ROOT="${RB_WORKSPACE_ROOT:-$(pwd)}"
PROJECT_ROOT="$ROOT/writing/Project"

if [ ! -d "$PROJECT_ROOT" ]; then
  echo "No writing/Project directory found under $ROOT"
  exit 0
fi

find "$PROJECT_ROOT" -mindepth 1 -maxdepth 1 -type d -exec basename {} \\; | sort
"""

SYNC_BIBS_FROM_PAPERS_SH = """#!/usr/bin/env sh
set -eu

usage() {
  echo "Usage: sh writing/utils.read_only/sync_bibs_from_papers.sh <writing-project> [references|ai|both]"
}

PROJECT="${1:-}"
MODE="${2:-both}"
ROOT="${RB_WORKSPACE_ROOT:-$(pwd)}"

if [ -z "$PROJECT" ]; then
  usage
  exit 2
fi

case "$MODE" in
  references|ai|both) ;;
  *) usage; exit 2 ;;
esac

DEST="$ROOT/writing/Project/$PROJECT/bibs"
if [ ! -d "$DEST" ]; then
  echo "Writing project not found: writing/Project/$PROJECT"
  echo "Available projects:"
  sh "$ROOT/writing/utils.read_only/list_writing_projects.sh" || true
  exit 1
fi

copy_one() {
  SRC="$1"
  OUT="$2"
  if [ ! -f "$SRC" ]; then
    echo "Missing source: $SRC"
    return 1
  fi
  mkdir -p "$DEST"
  cp "$SRC" "$DEST/$OUT"
  echo "Synced $SRC -> writing/Project/$PROJECT/bibs/$OUT"
}

if [ "$MODE" = "references" ] || [ "$MODE" = "both" ]; then
  copy_one "$ROOT/papers/bib/references.read_only.bib" "references.read_only.bib"
fi

if [ "$MODE" = "ai" ] || [ "$MODE" = "both" ]; then
  copy_one "$ROOT/papers/bib/ai-generated.bib" "ai_generated.bib"
fi
"""

CONTENT_DIRS = {
    "papers": "Paper notes, bibliographic metadata and BibTeX files",
    "document": "Long-form notes, drafts, and shared project documents",
    "meetings": "Meeting notes and agenda records",
    "writing": "Paper-writing workspace (LaTeX projects)",
    "coding": "Qualitative coding and literature screening projects",
    "images": "Design assets, figures, and visual resources",
    "prototype": "Prototype code, experiments, and design explorations",
    "skills": "Reusable agent/team playbooks and local skills",
}

DEFAULT_MANIFEST: dict[str, Any] = {
    "schema": "researchbuddy.workspace",
    "version": WORKSPACE_VERSION,
    "source_of_truth": "git-workspace",
    "agent_contract": {
        "editable": ["papers", "document", "meetings", "writing", "coding", "images", "prototype", "skills"],
        "system_owned": [SYSTEM_DIR, PROJECT_INFO_DIR],
        "content_format": "markdown-with-yaml-frontmatter",
        "citation_syntax": "[[paper_id]]",
    },
    "folders": CONTENT_DIRS,
    "v2_paths": {
        "paper_notes": PAPERS_NOTES_DIR,
        "meetings": MEETINGS_DIR,
        "documents": DOCS_DIR,
        "writing_projects": WRITING_BASE,
        "coding_projects": "coding/Project",
        "contacts": f"{PROJECT_INFO_DIR}/contacts.json",
    },
    "extensions": {
        "paper_writing": {
            "root": WRITING_BASE,
            "preferred": ["latex", "markdown"],
            "bib": "bibs/references.read_only.bib + bibs/ai_generated.bib",
        },
        "coding_analysis": {
            "root": "coding/Project",
            "preferred": ["json", "csv"],
        },
        "team_skills": {
            "root": "skills",
            "preferred": ["markdown", "codex-skill"],
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
    """Create missing v2 workspace folders and system files."""
    created: list[str] = []
    with project_worktree(project_id) as wt:
        wt.commit_message = "Ensure ResearchBuddy v2 workspace"
        root = Path(wt.__fspath__())

        for rel_dir in [
            SYSTEM_DIR,
            PROJECT_INFO_DIR,
            "papers/notes",
            "papers/bib",
            "papers/images",
            "papers/resources",
            "papers/utils.read_only",
            "meetings/mygdocs",
            "meetings/resources",
            "meetings/utils.read_only",
            "document/docs",
            "document/images",
            "document/resources",
            "document/utils.read_only",
            "writing/Project",
            "writing/resources",
            "writing/utils.read_only",
            "coding/Project",
            "coding/resources",
            "coding/utils.read_only",
            "images/resources",
            "prototype/resources",
            "skills",
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
                "Agents should edit the top-level content folders. "
                "ResearchBuddy owns files in this directory (indexes, sync state, adapter metadata).\n",
                encoding="utf-8",
            )
            created.append(f"{SYSTEM_DIR}/README.md")

        contacts = root / PROJECT_INFO_DIR / "contacts.json"
        if not contacts.exists():
            contacts.parent.mkdir(parents=True, exist_ok=True)
            contacts.write_text('{\n  "contacts": []\n}\n', encoding="utf-8")
            created.append(f"{PROJECT_INFO_DIR}/contacts.json")

        default_files = {
            "papers/bib/references.read_only.bib": "% Generated by ResearchBuddy from papers/notes/*.md. Do not edit by hand.\n",
            "papers/bib/ai-generated.bib": "% Generated by ResearchBuddy from writing/Project/*/bibs/ai_generated.bib.\n",
            "writing/utils.read_only/list_writing_projects.sh": LIST_WRITING_PROJECTS_SH,
            "writing/utils.read_only/sync_bibs_from_papers.sh": SYNC_BIBS_FROM_PAPERS_SH,
        }
        for rel, content in default_files.items():
            file_path = root / rel
            if not file_path.exists():
                file_path.parent.mkdir(parents=True, exist_ok=True)
                file_path.write_text(content, encoding="utf-8")
                if rel.endswith(".sh"):
                    file_path.chmod(0o755)
                created.append(rel)

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


def _is_system_path(path: str) -> bool:
    """Skip non-content paths in the workspace index."""
    parts = path.split("/")
    top = parts[0]
    # system dirs
    if top in {SYSTEM_DIR, PROJECT_INFO_DIR, ".git"}:
        return True
    # module support dirs (not user content)
    if len(parts) >= 2 and parts[1] in {"bib", "images", "resources", "utils.read_only"}:
        return True
    # writing subproject support dirs
    if top == "writing" and len(parts) >= 4 and parts[1] == "Project" and parts[3] in {"bibs", "images", "other", "sections"}:
        return True
    # coding subproject support dirs
    if top == "coding" and len(parts) >= 4 and parts[1] == "Project" and parts[3] in {"screening", "transcripts", "images"}:
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
        if _is_system_path(path):
            continue

        # Only index Markdown content files from v2 locations
        is_content = (
            (path.startswith(PAPERS_NOTES_DIR + "/") and path.endswith(".md")) or
            (path.startswith(MEETINGS_DIR + "/") and path.endswith(".md")) or
            (path.startswith(DOCS_DIR + "/") and path.endswith(".md")) or
            (top == "skills" and path.endswith(".md"))
        )
        if not is_content:
            continue

        meta, body, parse_issues = _parse_markdown(project_id, path)
        issues.extend(parse_issues)
        item_id = meta.get("id") or Path(path).stem
        refs = sorted(set(re.findall(r"\[\[([^\]]+)\]\]", body)))
        items.append({
            "id": item_id,
            "type": path.split("/")[0],
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
