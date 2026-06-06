from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from ..core.db import get_session
from ..core.security import get_current_user
from ..models import User
from ..services import skills_service as skills
from .projects import check_member

router = APIRouter(prefix="/projects/{project_id}/skills", tags=["skills"])


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


@router.post("/upload-zip")
def upload_skill_zip_placeholder(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    raise HTTPException(501, "后续开发")


@router.get("/{skill_id}/download-zip")
def download_skill_zip_placeholder(
    project_id: str,
    skill_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    raise HTTPException(501, "后续开发")
