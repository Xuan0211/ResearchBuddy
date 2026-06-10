"""Global editable Skills library."""
from __future__ import annotations

import shutil
import io
import zipfile
from pathlib import Path

import frontmatter as frontmatter_lib
import yaml
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import Session, select

from ..core.config import settings
from ..core.db import get_session
from ..core.security import get_current_user
from ..models import User, Project, ProjectMember
from ..services import skills_service as project_skills
from .projects import check_member

router = APIRouter(prefix="/global-skills", tags=["global-skills"])

GLOBAL_SKILLS_DIR = settings.projects_dir / "_global_skills"
MAX_SKILL_BYTES = 10 * 1024 * 1024


class GlobalSkillIn(BaseModel):
    title: str
    content: str = ""
    tags: list[str] = []
    sections: list[str] = []
    recommended_docs: list[str] = []


class GlobalSkillPatch(BaseModel):
    title: str | None = None
    content: str | None = None
    tags: list[str] | None = None
    sections: list[str] | None = None
    recommended_docs: list[str] | None = None


class GlobalSkillDeleteIn(BaseModel):
    confirm_title: str


class ImportSkillIn(BaseModel):
    project_id: str
    folder: str = ""


class ImportMultiIn(BaseModel):
    project_ids: list[str]
    folder: str = ""


def _root() -> Path:
    GLOBAL_SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    return GLOBAL_SKILLS_DIR


def _path(skill_id: str) -> Path:
    if "/" in skill_id or ".." in skill_id or skill_id.startswith("."):
        raise HTTPException(400, "Invalid skill id")
    return _root() / skill_id / "SKILL.md"


def _first_heading(body: str) -> str:
    for line in body.splitlines():
        text = line.strip()
        if text.startswith("#"):
            return text.lstrip("#").strip()
    return ""


def _first_paragraph(body: str) -> str:
    chunks = []
    for line in body.splitlines():
        text = line.strip()
        if not text or text.startswith("#"):
            if chunks:
                break
            continue
        chunks.append(text)
    return " ".join(chunks)[:280]


def _parse(path: Path, include_content: bool = False) -> dict:
    content = path.read_text(encoding="utf-8")
    post = frontmatter_lib.loads(content)
    meta = dict(post.metadata)
    skill_id = path.parent.name
    body = post.content
    title = str(meta.get("title") or meta.get("name") or _first_heading(body) or skill_id)
    result = {
        "id": skill_id,
        "title": title,
        "description": str(meta.get("description") or meta.get("summary") or _first_paragraph(body)),
        "tags": meta.get("tags", []),
        "sections": meta.get("sections", []),
        "recommended_docs": meta.get("recommended_docs", []),
        "created_by": meta.get("created_by", ""),
        "creator_email": meta.get("creator_email", ""),
        "path": str(path.relative_to(_root())),
    }
    if include_content:
        result["content"] = content
        result["metadata"] = meta
    return result


def _write(skill_id: str, title: str, content: str, tags: list[str], recommended_docs: list[str], sections: list[str] | None = None, created_by: str = "", creator_email: str = "") -> None:
    path = _path(skill_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    body = content.strip() or f"# {title}\n\nDescribe this skill here.\n"
    try:
        post = frontmatter_lib.loads(body)
        meta = dict(post.metadata)
        raw_body = post.content
    except Exception:
        meta = {}
        raw_body = body
    meta.update({"title": title, "tags": tags, "recommended_docs": recommended_docs, "sections": sections or meta.get("sections", [])})
    if created_by and not meta.get("created_by"):
        meta["created_by"] = created_by
    if creator_email and not meta.get("creator_email"):
        meta["creator_email"] = creator_email
    front = yaml.dump(meta, allow_unicode=True, default_flow_style=False).rstrip()
    path.write_text(f"---\n{front}\n---\n{raw_body}", encoding="utf-8")


@router.get("")
def list_global_skills(current_user: User = Depends(get_current_user)):
    return sorted(
        [_parse(path) for path in _root().glob("*/SKILL.md")],
        key=lambda item: item["title"].lower(),
    )


@router.get("/{skill_id}")
def get_global_skill(skill_id: str, current_user: User = Depends(get_current_user)):
    path = _path(skill_id)
    if not path.exists():
        raise HTTPException(404, "Skill not found")
    return _parse(path, include_content=True)


@router.post("", status_code=201)
def create_global_skill(body: GlobalSkillIn, current_user: User = Depends(get_current_user)):
    if len(body.content.encode()) > MAX_SKILL_BYTES:
        raise HTTPException(413, "Skill content exceeds 10 MB limit")
    skill_id = project_skills.slugify(body.title)
    path = _path(skill_id)
    if path.exists():
        raise HTTPException(409, "Skill already exists")
    _write(skill_id, body.title, body.content, body.tags, body.recommended_docs, sections=body.sections, created_by=current_user.name or current_user.email, creator_email=current_user.email)
    return {"id": skill_id}


@router.patch("/{skill_id}")
def update_global_skill(
    skill_id: str,
    body: GlobalSkillPatch,
    current_user: User = Depends(get_current_user),
):
    path = _path(skill_id)
    if not path.exists():
        raise HTTPException(404, "Skill not found")
    if body.content is not None and len(body.content.encode()) > MAX_SKILL_BYTES:
        raise HTTPException(413, "Skill content exceeds 10 MB limit")
    current = _parse(path, include_content=True)
    meta = current.get("metadata", {})
    _write(
        skill_id,
        body.title if body.title is not None else current["title"],
        body.content if body.content is not None else current.get("content", ""),
        body.tags if body.tags is not None else meta.get("tags", []),
        body.recommended_docs if body.recommended_docs is not None else meta.get("recommended_docs", []),
        sections=body.sections if body.sections is not None else meta.get("sections", []),
    )
    return {"ok": True}


@router.delete("/{skill_id}", status_code=204)
def delete_global_skill(
    skill_id: str,
    body: GlobalSkillDeleteIn,
    current_user: User = Depends(get_current_user),
):
    path = _path(skill_id)
    if not path.exists():
        raise HTTPException(404, "Skill not found")
    skill = _parse(path)
    if body.confirm_title != skill["title"]:
        raise HTTPException(400, "Skill name confirmation does not match")
    shutil.rmtree(path.parent)


@router.post("/upload", status_code=201)
async def upload_global_skill(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    filename = file.filename or "skill.md"
    if not (filename.endswith(".md") or filename.endswith(".zip")):
        raise HTTPException(400, "Only .md and .zip files are supported")
    raw = await file.read()
    if len(raw) > MAX_SKILL_BYTES:
        raise HTTPException(413, "File exceeds 10 MB limit")
    try:
        if filename.endswith(".zip"):
            content, extra_files = project_skills._extract_zip_skill(raw)
        else:
            content = raw.decode("utf-8", errors="replace")
            extra_files = []
    except zipfile.BadZipFile:
        raise HTTPException(400, "Invalid zip file")
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    post = frontmatter_lib.loads(content)
    meta = dict(post.metadata)
    meta.setdefault("created_by", current_user.name or current_user.email)
    meta.setdefault("creator_email", current_user.email)
    front = yaml.dump(meta, allow_unicode=True, default_flow_style=False).rstrip()
    content = f"---\n{front}\n---\n{post.content}"
    skill_id = project_skills.slugify(Path(filename).stem)
    path = _path(skill_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    for name, payload in extra_files:
        target = path.parent / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
    return {"id": skill_id}


@router.get("/{skill_id}/download")
def download_global_skill(skill_id: str, current_user: User = Depends(get_current_user)):
    path = _path(skill_id)
    if not path.exists():
        raise HTTPException(404, "Skill not found")
    return Response(
        content=path.read_bytes(),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={skill_id}.md"},
    )


@router.post("/{skill_id}/import")
def import_global_skill(
    skill_id: str,
    body: ImportSkillIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(body.project_id, current_user, session, min_role="member")
    path = _path(skill_id)
    if not path.exists():
        raise HTTPException(404, "Skill not found")
    content = path.read_text(encoding="utf-8")
    imported_id = project_skills.create_skill_from_content(
        body.project_id,
        filename_stem=skill_id,
        content=content,
        folder=body.folder,
    )
    return {"id": imported_id}


@router.post("/{skill_id}/import-multi")
def import_global_skill_multi(
    skill_id: str,
    body: ImportMultiIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Import a global skill into multiple projects at once."""
    path = _path(skill_id)
    if not path.exists():
        raise HTTPException(404, "Skill not found")
    content = path.read_text(encoding="utf-8")
    results = []
    for project_id in body.project_ids:
        try:
            check_member(project_id, current_user, session, min_role="member")
            imported_id = project_skills.create_skill_from_content(
                project_id,
                filename_stem=skill_id,
                content=content,
                folder=body.folder,
            )
            results.append({"project_id": project_id, "ok": True, "id": imported_id})
        except Exception as exc:
            results.append({"project_id": project_id, "ok": False, "error": str(exc)})
    return {"results": results}


@router.get("/{skill_id}/project-status")
def get_global_skill_project_status(
    skill_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Return which of the user's editable projects have this global skill imported."""
    memberships = session.exec(
        select(ProjectMember).where(
            ProjectMember.user_id == current_user.id,
            ProjectMember.role.in_(["member", "admin"]),
        )
    ).all()
    result = []
    for m in memberships:
        project = session.get(Project, m.project_id)
        if not project:
            continue
        try:
            project_skills.get_skill(str(project.id), skill_id)
            is_imported = True
        except Exception:
            is_imported = False
        result.append({
            "project_id": str(project.id),
            "project_name": project.name,
            "role": m.role,
            "is_imported": is_imported,
        })
    return result


@router.post("/{skill_id}/sync")
def sync_global_skill_to_project(
    skill_id: str,
    body: ImportSkillIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Overwrite a project's imported copy with the latest global version."""
    check_member(body.project_id, current_user, session, min_role="member")
    path = _path(skill_id)
    if not path.exists():
        raise HTTPException(404, "Global skill not found")
    try:
        project_skills.get_skill(body.project_id, skill_id)
    except FileNotFoundError:
        raise HTTPException(404, "This skill hasn't been imported to the project yet; use Import instead.")
    global_content = path.read_text(encoding="utf-8")
    project_skills.create_skill_from_content(
        body.project_id,
        filename_stem=skill_id,
        content=global_content,
        folder=body.folder,
    )
    return {"ok": True}
