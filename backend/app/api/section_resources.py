from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import Session

from ..core.db import get_session
from ..core.security import get_current_user
from ..models import User
from ..services import section_resources as resources
from .projects import check_member

router = APIRouter(prefix="/projects/{project_id}/module-resources", tags=["module-resources"])


class SectionDocIn(BaseModel):
    title: str
    content: str = ""


class SectionDocPatch(BaseModel):
    title: str | None = None
    content: str | None = None


class SkillRefIn(BaseModel):
    skill_id: str


class DocRefIn(BaseModel):
    path: str
    kind: str = "doc"


class LinkIn(BaseModel):
    kind: str = "link"
    title: str = ""
    url: str


def _validation_http_exception(exc: resources.ResourceValidationError) -> HTTPException:
    return HTTPException(
        400,
        {
            "message": "Resource validation failed",
            "issues": exc.issues,
        },
    )


@router.get("/{section}")
def get_section_resources(
    project_id: str,
    section: str,
    scope: str = "",
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    try:
        return resources.list_section_resources(project_id, section, scope)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.post("/{section}/docs", status_code=201)
def create_section_doc(
    project_id: str,
    section: str,
    body: SectionDocIn,
    scope: str = "",
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return resources.create_section_doc(project_id, section, body.title, body.content, scope)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except FileExistsError:
        raise HTTPException(409, "Document already exists")


@router.patch("/{section}/docs/{doc_id}")
def update_section_doc(
    project_id: str,
    section: str,
    doc_id: str,
    body: SectionDocPatch,
    scope: str = "",
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return resources.update_section_doc(project_id, section, doc_id, body.title, body.content, scope)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except FileNotFoundError:
        raise HTTPException(404, "Document not found")


@router.post("/{section}/doc-refs", status_code=201)
def attach_section_doc_ref(
    project_id: str,
    section: str,
    body: DocRefIn,
    scope: str = "",
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return resources.attach_doc_ref(project_id, section, body.path, body.kind, scope)
    except resources.ResourceValidationError as exc:
        raise _validation_http_exception(exc)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except FileNotFoundError:
        raise HTTPException(404, "Document or folder not found")


@router.delete("/{section}/doc-refs")
def detach_section_doc_ref(
    project_id: str,
    section: str,
    path: str,
    kind: str = "doc",
    scope: str = "",
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return resources.detach_doc_ref(project_id, section, path, kind, scope)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/{section}/upload", status_code=201)
async def upload_section_resources(
    project_id: str,
    section: str,
    files: list[UploadFile] = File(...),
    relative_paths: list[str] = Form(default=[]),
    target: str = Form("docs"),
    scope: str = "",
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    payload: list[tuple[str, bytes]] = []
    for index, file in enumerate(files):
        rel_path = relative_paths[index] if index < len(relative_paths) else (file.filename or f"file-{index}")
        payload.append((rel_path, await file.read()))
    try:
        return resources.upload_section_files(project_id, section, payload, target, scope)
    except resources.ResourceValidationError as exc:
        raise _validation_http_exception(exc)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/{section}/links", status_code=201)
def create_section_link(
    project_id: str,
    section: str,
    body: LinkIn,
    scope: str = "",
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return resources.create_link(project_id, section, body.kind, body.title, body.url, scope)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.delete("/{section}/links/{link_id}", status_code=204)
def delete_section_link(
    project_id: str,
    section: str,
    link_id: str,
    scope: str = "",
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        resources.delete_link(project_id, section, link_id, scope)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.delete("/{section}/docs/{doc_id}", status_code=204)
def delete_section_doc(
    project_id: str,
    section: str,
    doc_id: str,
    scope: str = "",
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        resources.delete_section_doc(project_id, section, doc_id, scope)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except FileNotFoundError:
        raise HTTPException(404, "Document not found")


@router.post("/{section}/skills", status_code=201)
def attach_section_skill(
    project_id: str,
    section: str,
    body: SkillRefIn,
    scope: str = "",
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return resources.attach_skill(project_id, section, body.skill_id, scope)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except FileNotFoundError:
        raise HTTPException(404, "Skill not found")


@router.delete("/{section}/skills/{skill_id}", status_code=204)
def detach_section_skill(
    project_id: str,
    section: str,
    skill_id: str,
    scope: str = "",
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        resources.detach_skill(project_id, section, skill_id, scope)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
