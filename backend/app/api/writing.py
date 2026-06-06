"""Writing / LaTeX workspace API."""
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from ..core.db import get_session
from ..core.security import get_current_user
from ..models import User
from ..services import frontmatter as fm
from ..services.project_fs import list_project_dir, read_project_file, project_worktree
from .projects import check_member

router = APIRouter(prefix="/projects/{project_id}/writing", tags=["writing"])


class WritingProjectIn(BaseModel):
    title: str
    description: str = ""
    github_url: str = ""
    overleaf_url: str = ""


class WritingProjectPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    github_url: str | None = None
    overleaf_url: str | None = None


class WritingFilePatch(BaseModel):
    content: str


# ── LaTeX template strings ────────────────────────────────────────────────────

_MAIN_TEX = r"""\documentclass[manuscript, nonacm]{acmart}
\usepackage[UTF8, scheme=plain, punct=plain, zihao=false]{ctex}
\usepackage[dvipsnames]{xcolor}

% AI-generated citation color indicator.
% Comment the next line to render AI citations normally.
\newcommand{\aicite}[1]{\textcolor{Dandelion}{\cite{#1}}}
% \newcommand{\aicite}[1]{\cite{#1}}

\AtBeginDocument{\providecommand\BibTeX{{Bib\TeX}}}

\begin{document}

\title{}
\subtitle{\today}

\author{Yuan Xu}
\orcid{0009-0004-0811-9505}
\affiliation{%
  \institution{The Hong Kong University of Science and Technology (Guangzhou)}
  \city{Guangzhou}
  \country{China}}
\email{yxu712@connect.hkust-gz.edu.cn}
\renewcommand{\shortauthors}{Xu et al.}

\begin{abstract}
\end{abstract}

\begin{teaserfigure}
  \includegraphics[width=\textwidth]{images/teaser.jpg}
  \caption{}\label{fig:teaser}
\end{teaserfigure}

\maketitle

\section{Introduction}
\input{sections/introduction.tex}

\bibliographystyle{ACM-Reference-Format}
\bibliography{reference,ai-generated}

\newpage
\appendix

\end{document}
"""

_REFERENCE_BIB = (
    "% reference.bib — Zotero-synced trusted references\n"
    "% READ-ONLY for AI agents. Do not add or edit entries here.\n"
    "% Use ResearchBuddy Papers → Zotero sync to manage this file.\n"
)

_AI_BIB = (
    "% ai-generated.bib — AI-generated references pending human confirmation\n"
    "% AI agents MAY add BibTeX entries here.\n"
    "% Use \\aicite{key} in .tex files for these references.\n"
    "% Confirm entries to Zotero via ResearchBuddy Papers → AI Generated tab.\n"
)

_INTRO_TEX = (
    "% Introduction\n"
    "% AI: use \\aicite{key} for AI-generated references, \\cite{key} for confirmed.\n\n"
)

_GITIGNORE = "\n".join([
    "# LaTeX compilation artifacts",
    "main.aux", "main.bbl", "main.blg", "main.fdb_latexmk", "main.fls",
    "main.log", "main.out", "main.pdf", "main.synctex.gz",
    "libertinusmath-regular.otf", "main.xdv", ".DS_Store",
]) + "\n"


def _init_latex_structure(base: Path) -> None:
    (base / "sections").mkdir(exist_ok=True)
    (base / "images").mkdir(exist_ok=True)
    (base / "main.tex").write_text(_MAIN_TEX, encoding="utf-8")
    (base / "reference.bib").write_text(_REFERENCE_BIB, encoding="utf-8")
    (base / "ai-generated.bib").write_text(_AI_BIB, encoding="utf-8")
    (base / "sections" / "introduction.tex").write_text(_INTRO_TEX, encoding="utf-8")
    (base / ".gitignore").write_text(_GITIGNORE, encoding="utf-8")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
def list_writing_projects(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    paths = list_project_dir(project_id, "writing")
    results = []
    for p in paths:
        if not p.endswith("/manifest.md") and p != "writing/manifest.md":
            continue
        # Only top-level manifests: writing/<id>/manifest.md
        parts = p.split("/")
        if len(parts) != 3:
            continue
        try:
            import frontmatter as _fm
            content = read_project_file(project_id, p)
            post = _fm.loads(content)
            meta = dict(post.metadata)
            results.append({**meta, "_path": p})
        except Exception:
            continue
    return results


@router.post("", status_code=201)
def create_writing_project(
    project_id: str,
    body: WritingProjectIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    slug = re.sub(r"[^\w-]", "", body.title.lower().replace(" ", "-"))[:40]
    writing_id = slug or str(uuid.uuid4())[:8]
    meta = {
        "id": writing_id,
        "title": body.title,
        "description": body.description,
        "github_url": body.github_url,
        "overleaf_url": body.overleaf_url,
        "document_type": "writing",
    }
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Create writing project: {body.title}"
        base = wt / "writing" / writing_id
        base.mkdir(parents=True, exist_ok=True)
        fm.write(base / "manifest.md", meta, f"# {body.title}\n\n{body.description}\n")
        _init_latex_structure(base)
    return {"id": writing_id}


@router.get("/{writing_id}")
def get_writing_project(
    project_id: str,
    writing_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    try:
        import frontmatter as _fm
        content = read_project_file(project_id, f"writing/{writing_id}/manifest.md")
        post = _fm.loads(content)
        meta = dict(post.metadata)
    except FileNotFoundError:
        raise HTTPException(404)
    all_paths = list_project_dir(project_id, f"writing/{writing_id}")
    return {**meta, "files": all_paths}


@router.patch("/{writing_id}")
def update_writing_project(
    project_id: str,
    writing_id: str,
    body: WritingProjectPatch,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update writing project: {writing_id}"
        path = wt / "writing" / writing_id / "manifest.md"
        if not path.exists():
            raise HTTPException(404)
        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        if updates:
            fm.update_metadata(path, updates)
    return {"ok": True}


@router.get("/{writing_id}/file")
def get_writing_file(
    project_id: str,
    writing_id: str,
    path: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    if ".." in path or path.startswith("/"):
        raise HTTPException(400, "Invalid path")
    try:
        return {"path": path, "content": read_project_file(project_id, f"writing/{writing_id}/{path}")}
    except FileNotFoundError:
        raise HTTPException(404)


@router.patch("/{writing_id}/file")
def update_writing_file(
    project_id: str,
    writing_id: str,
    path: str,
    body: WritingFilePatch,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Update a file in the writing project. AI notes only; bib protection enforced."""
    check_member(project_id, current_user, session, min_role="member")
    if ".." in path or path.startswith("/"):
        raise HTTPException(400, "Invalid path")
    # Protect reference.bib — only ai-generated.bib and .tex/.md files allowed
    if path == "reference.bib":
        raise HTTPException(403, "reference.bib is read-only. Use Zotero sync.")
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update writing file: {path}"
        file = wt / "writing" / writing_id / path
        if not file.exists():
            raise HTTPException(404)
        file.write_text(body.content, encoding="utf-8")
    return {"ok": True}
