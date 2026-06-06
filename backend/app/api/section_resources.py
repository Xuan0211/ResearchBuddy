from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from ..core.db import get_session
from ..core.security import get_current_user
from ..models import User
from ..services import section_resources as resources
from .projects import check_member

router = APIRouter(prefix="/projects/{project_id}/section-resources", tags=["section-resources"])


class SectionDocIn(BaseModel):
    title: str
    content: str = ""


class SectionDocPatch(BaseModel):
    title: str | None = None
    content: str | None = None


class SkillRefIn(BaseModel):
    skill_id: str


@router.get("/{section}")
def get_section_resources(
    project_id: str,
    section: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    try:
        return resources.list_section_resources(project_id, section)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.post("/{section}/docs", status_code=201)
def create_section_doc(
    project_id: str,
    section: str,
    body: SectionDocIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return resources.create_section_doc(project_id, section, body.title, body.content)
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
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return resources.update_section_doc(project_id, section, doc_id, body.title, body.content)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except FileNotFoundError:
        raise HTTPException(404, "Document not found")


@router.delete("/{section}/docs/{doc_id}", status_code=204)
def delete_section_doc(
    project_id: str,
    section: str,
    doc_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        resources.delete_section_doc(project_id, section, doc_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except FileNotFoundError:
        raise HTTPException(404, "Document not found")


@router.post("/{section}/skills", status_code=201)
def attach_section_skill(
    project_id: str,
    section: str,
    body: SkillRefIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return resources.attach_skill(project_id, section, body.skill_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except FileNotFoundError:
        raise HTTPException(404, "Skill not found")


@router.delete("/{section}/skills/{skill_id}", status_code=204)
def detach_section_skill(
    project_id: str,
    section: str,
    skill_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        resources.detach_skill(project_id, section, skill_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
