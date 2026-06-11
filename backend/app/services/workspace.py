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
    "design": "Design assets, Figma links, and visual resources",
    "prototype": "Prototype code, experiments, and design explorations",
    "skills": "Reusable agent/team playbooks and local skills",
}

DEFAULT_MANIFEST: dict[str, Any] = {
    "schema": "researchbuddy.workspace",
    "version": WORKSPACE_VERSION,
    "source_of_truth": "git-workspace",
    "agent_contract": {
        "editable": ["papers", "document", "meetings", "writing", "coding", "design", "prototype", "skills"],
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


def _agent_readmes(project_name: str = "") -> dict[str, str]:
    """Return a dict of {rel_path: content} for Agent-facing README files."""
    proj = project_name or "this project"
    return {
        "README.md": f"""\
# {proj} — ResearchBuddy Workspace

This is a ResearchBuddy research project workspace backed by git.
Every file in this repo is plain text (Markdown or JSON) and can be edited locally or via the web UI.

## Directory structure

| Directory | Purpose |
|---|---|
| `papers/notes/` | Paper notes — one `.md` file per paper, YAML frontmatter + freeform notes |
| `papers/bib/` | BibTeX mirrors — **auto-generated, do not edit** |
| `document/docs/` | Project documents — rich Markdown with tab support |
| `meetings/mygdocs/` | Meeting notes — Pre-meeting / Transcript / Post-meeting tabs |
| `writing/Project/` | LaTeX writing projects — one subdirectory per paper |
| `coding/Project/` | Qualitative coding projects |
| `skills/` | Reusable Agent playbooks and team conventions |
| `design/` | Design assets and Figma links |
| `prototype/` | Prototype code and experiments |
| `.researchbuddy/` | System metadata — do not edit |

## How to contribute as an Agent

1. Clone this repo and authenticate with your ResearchBuddy credentials (email + password, or `rb_` API key as password).
2. Read module-level `README.md` files before editing any directory.
3. After making changes, `git add . && git commit -m "description" && git push`.
4. The ResearchBuddy UI updates instantly after each push.

## Key files

- `papers/bib/references.read_only.bib` — BibTeX for all confirmed papers. Read-only; auto-rebuilt from `papers/notes/`.
- `.researchbuddy/workspace.json` — Workspace manifest (schema version, folder descriptions).
- `.researchbuddy/index.json` — Full content index (regenerated by ResearchBuddy on each sync).
""",

        "papers/notes/README.md": """\
# papers/notes/

One Markdown file per paper. Filename = citation key (e.g. `smithetal2023.md`).

## File format

```markdown
---
id: smithetal2023
title: "Paper Title"
authors: ["Smith, John", "Doe, Jane"]
year: 2023
venue: "CHI"
arxiv_id: "2301.00000"        # optional
zotero_key: "ABCD1234"        # set by Zotero sync
doi: "10.1145/..."            # optional
tags: ["hci", "llm"]
links:
  arxiv: "https://arxiv.org/abs/2301.00000"
  zotero_local: "zotero://select/library/items/ABCD1234"
  url: ""
  google_drive_pdf: ""
preview_image: ""
source: "zotero"              # or "manual" / "arxiv"
---

## Notes

Your reading notes here.

## Related

[[relatedpaper2022]]
```

## Rules

- **Never** edit `papers/bib/references.read_only.bib` directly — it is auto-generated from these files.
- Cite a paper in documents using `[[id]]` wiki-link syntax.
- After editing a paper file and pushing, the UI and BibTeX file update automatically.
- `source: "zotero"` papers will be overwritten on next Zotero sync (metadata only; notes are preserved).
""",

        "papers/bib/README.md": """\
# papers/bib/

**Auto-generated by ResearchBuddy. Do not edit these files by hand.**

| File | Contents |
|---|---|
| `references.read_only.bib` | BibTeX for all papers in `papers/notes/`. Rebuilt on every paper add/update/Zotero sync. |
| `ai-generated.bib` | Aggregated `ai_generated.bib` files from all writing projects. |

## How to use in LaTeX

Copy or symlink `references.read_only.bib` into your writing project:

```bash
sh writing/utils.read_only/sync_bibs_from_papers.sh <project-name> references
```

Or reference it directly from your writing project's `bibs/` directory (the sync script handles this).
""",

        "document/docs/README.md": """\
# document/docs/

One Markdown file per document. Filename = UUID (e.g. `a1b2c3d4-....md`).

## File format

```markdown
---
id: a1b2c3d4-1234-5678-abcd-000000000001
title: "Document Title"
folder: "Background"          # optional, for grouping in the UI
tabs:
  - id: main
    title: Main
    content: |
      # Document content here
  - id: tab2
    title: Methods
    content: |
      # Methods section
---
```

## Rules

- Use `[[paper_id]]` to cite papers — renders as a hoverable card in the UI.
- Use `@handle` to mention team members.
- Paste images inline — they are auto-uploaded and stored in `backend/images/`.
- Do not create new files here directly; use the ResearchBuddy UI or PATCH the API.
  Creating files manually may miss UUID generation and Drive sync setup.
""",

        "meetings/mygdocs/README.md": """\
# meetings/mygdocs/

One Markdown file per meeting. Filename = UUID.

## File format

```markdown
---
id: a1b2c3d4-...
title: "Weekly Sync #12"
date: "2024-03-15"
start_time: "10:00"
end_time: "11:00"
location: "Zoom"
attendees: ["@alice", "@bob"]
tags: []
tabs:
  - id: pre
    title: Pre-meeting
    content: |
      ## Last week
      ## This week
      ## Agenda
  - id: transcript
    title: Transcript / Notes
    content: |
      ## Notes
  - id: post
    title: Post-meeting
    content: |
      ## Decisions
      ## TODO
---
```

## Rules

- Do not modify `meetings/manifest.read_only.json` — it is system-managed.
- `@handle` mentions link to contacts defined in `project_info/contacts.json`.
""",

        "writing/Project/README.md": """\
# writing/Project/

One subdirectory per writing (paper) project.

## Creating a new writing project

Use the ResearchBuddy UI (Writing tab → New project). This auto-initialises the standard structure:

```
<project-name>/
├── manifest.read_only.json   # system-managed metadata
├── main.tex                  # ACM/IEEE LaTeX template
├── bibs/
│   ├── references.read_only.bib  # synced from papers/bib/ — READ-ONLY for Agents
│   └── ai_generated.bib          # Agent-writable: use \\aicite{key}
├── sections/
│   └── introduction.tex
├── images/
├── other/
└── skills/
```

## Two-tier citation system

| File | Who writes | LaTeX command |
|---|---|---|
| `bibs/references.read_only.bib` | System (from Zotero/Papers) | `\\cite{key}` |
| `bibs/ai_generated.bib` | AI Agent | `\\aicite{key}` (renders in amber) |

## Agent rules

- Agents may write to `sections/*.tex` and `bibs/ai_generated.bib` only.
- Do **not** modify `bibs/references.read_only.bib`, `manifest.read_only.json`, or the structural preamble of `main.tex`.
- To sync the latest papers into `bibs/references.read_only.bib`:
  ```bash
  sh writing/utils.read_only/sync_bibs_from_papers.sh <project-name> references
  ```
- When adding AI notes to a `.tex` file, prefix with: `% [AI note — YYYY-MM-DD]: ...`
""",

        "skills/README.md": """\
# skills/

Reusable Agent playbooks and team conventions. Each skill is a Markdown file.

## File format

```markdown
---
title: "Skill Title"
description: "One-line description shown in the UI."
tags: ["ai", "research", "workflow"]
sections: ["papers", "meetings"]   # attach to these modules in the UI
---

# Skill Title

## When to use
Describe the trigger condition.

## Inputs
- What context the Agent needs before starting.

## Steps
1. Step one
2. Step two

## Output format
Describe the expected deliverable.

## Rules
- Constraint 1
- Constraint 2
```

## Package skills (with assets)

A skill can also be a directory containing a `SKILL.md` at its root:

```
skills/
└── my-skill/
    ├── SKILL.md        # main skill file
    ├── template.tex    # asset referenced by the skill
    └── example.md
```

## How skills appear in the UI

- Skills with `sections: ["papers"]` appear in the Papers module resource panel.
- Skills are readable by Agents via the ResearchBuddy API or directly from this directory.
""",

        "prototype/README.md": """\
# prototype/

Prototype code, experiments, and design explorations.

No enforced structure — use subdirectories freely. Document your experiments here so other team members and Agents can understand what's been tried.

Suggested organisation:
```
prototype/
├── experiment-name/
│   ├── README.md      # What you tried and what you found
│   ├── code/
│   └── results/
```
""",

        "design/README.md": """\
# design/

Design assets, Figma links, and visual resources for the project.

Use the ResearchBuddy UI (Design tab) to store Figma links and attach reference documents.

Files placed here (e.g. exported assets, mockup images) are version-controlled and can be referenced in LaTeX:
```latex
\\includegraphics{../../design/my-figure.pdf}
```
""",
    }


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
            "design/resources",
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
            **_agent_readmes(project_name),
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
