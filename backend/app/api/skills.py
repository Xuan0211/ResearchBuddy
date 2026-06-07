"""Project skills API — create, upload, download, edit, delete."""
import io
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session

from ..core.db import get_session
from ..core.security import get_current_user
from ..models import User
from ..services import skills_service as skills
from .projects import check_member

router = APIRouter(prefix="/projects/{project_id}/skills", tags=["skills"])

MAX_SKILL_BYTES = 10 * 1024 * 1024  # 10 MB


# ── List / Get ────────────────────────────────────────────────────────────────

@router.get("")
def list_project_skills(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    return skills.list_skills(project_id)


@router.get("/{skill_id}")
def get_project_skill(
    project_id: str,
    skill_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    try:
        return skills.get_skill(project_id, skill_id)
    except FileNotFoundError:
        raise HTTPException(404, "Skill not found")


# ── Create (from template / new) ──────────────────────────────────────────────

class SkillCreateIn(BaseModel):
    title: str
    content: str = ""
    tags: list[str] = []
    folder: str = ""          # optional subfolder under skills/


@router.post("", status_code=201)
def create_skill(
    project_id: str,
    body: SkillCreateIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    if len(body.content.encode()) > MAX_SKILL_BYTES:
        raise HTTPException(413, "Skill content exceeds 10 MB limit")
    skill_id = skills.create_skill(
        project_id,
        title=body.title,
        content=body.content,
        tags=body.tags,
        folder=body.folder,
    )
    return {"id": skill_id}


# ── Update (edit content) ─────────────────────────────────────────────────────

class SkillPatch(BaseModel):
    title: str | None = None
    content: str | None = None
    tags: list[str] | None = None


@router.patch("/{skill_id}")
def update_skill(
    project_id: str,
    skill_id: str,
    body: SkillPatch,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    if body.content is not None and len(body.content.encode()) > MAX_SKILL_BYTES:
        raise HTTPException(413, "Skill content exceeds 10 MB limit")
    try:
        skills.update_skill(project_id, skill_id, body.title, body.content, body.tags)
    except FileNotFoundError:
        raise HTTPException(404, "Skill not found")
    return {"ok": True}


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{skill_id}", status_code=204)
def delete_project_skill(
    project_id: str,
    skill_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        skills.delete_skill(project_id, skill_id)
    except FileNotFoundError:
        raise HTTPException(404, "Skill not found")


# ── Upload .md file ───────────────────────────────────────────────────────────

@router.post("/upload", status_code=201)
async def upload_skill(
    project_id: str,
    file: UploadFile = File(...),
    folder: str = Form(""),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Upload a single Markdown skill file (max 10 MB)."""
    check_member(project_id, current_user, session, min_role="member")

    if not (file.filename or "").endswith(".md"):
        raise HTTPException(400, "Only .md files are supported")

    raw = await file.read()
    if len(raw) > MAX_SKILL_BYTES:
        raise HTTPException(413, f"File exceeds 10 MB limit ({len(raw) // 1024} KB uploaded)")

    content = raw.decode("utf-8", errors="replace")
    # Extract title from filename or frontmatter
    stem = Path(file.filename or "skill").stem
    skill_id = skills.create_skill_from_content(
        project_id, filename_stem=stem, content=content, folder=folder
    )
    return {"id": skill_id}


# ── Download .md file ─────────────────────────────────────────────────────────

@router.get("/{skill_id}/download")
def download_skill(
    project_id: str,
    skill_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Download a skill as a raw Markdown file."""
    check_member(project_id, current_user, session)
    try:
        skill = skills.get_skill(project_id, skill_id)
    except FileNotFoundError:
        raise HTTPException(404, "Skill not found")
    content = (skill.get("content") or "").encode("utf-8")
    filename = f"{skill_id}.md"
    return Response(
        content=content,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── Download all skills as zip ────────────────────────────────────────────────

@router.get("/export/zip")
def download_all_skills_zip(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Download all project skills as a zip archive."""
    check_member(project_id, current_user, session)
    all_skills = skills.list_skills(project_id)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for skill in all_skills:
            full = skills.get_skill(project_id, skill["id"])
            content = (full.get("content") or "").encode("utf-8")
            zf.writestr(f"{skill['id']}.md", content)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=skills-{project_id[:8]}.zip"},
    )
