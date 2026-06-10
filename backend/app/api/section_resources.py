from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from ..core.db import get_session
from ..core.security import get_current_user
from ..models import User
from ..services import section_resources as resources
from .projects import check_member

router = APIRouter(prefix="/projects/{project_id}/module-resources", tags=["module-resources"])


class DocRefIn(BaseModel):
    path: str
    kind: str = "doc"  # "doc" | "folder"
    note: str = ""


class DocRefNotePatch(BaseModel):
    note: str


class SkillRefIn(BaseModel):
    skill_id: str
    note: str = ""


class SkillNotePatch(BaseModel):
    note: str


class LinkIn(BaseModel):
    kind: str = "link"
    title: str = ""
    url: str


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
        return resources.attach_doc_ref(project_id, section, body.path, body.kind, body.note, scope)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except FileNotFoundError:
        raise HTTPException(404, "Document or folder not found")


@router.delete("/{section}/doc-refs/{item_id}", status_code=204)
def detach_section_doc_ref(
    project_id: str,
    section: str,
    item_id: str,
    scope: str = "",
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        resources.detach_doc_ref(project_id, section, item_id, scope)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.patch("/{section}/doc-refs/{item_id}")
def update_section_doc_ref_note(
    project_id: str,
    section: str,
    item_id: str,
    body: DocRefNotePatch,
    scope: str = "",
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return resources.update_doc_ref_note(project_id, section, item_id, body.note, scope)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


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
        return resources.attach_skill(project_id, section, body.skill_id, body.note, scope)
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


@router.patch("/{section}/skills/{skill_id}")
def update_section_skill_note(
    project_id: str,
    section: str,
    skill_id: str,
    body: SkillNotePatch,
    scope: str = "",
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return resources.update_skill_note(project_id, section, skill_id, body.note, scope)
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
