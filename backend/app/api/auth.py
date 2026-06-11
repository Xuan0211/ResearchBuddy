from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlmodel import Session, select

from ..core.db import get_session
from ..core.security import (
    create_access_token,
    generate_api_key,
    get_current_user,
    hash_password,
    verify_password,
)
from ..models import APIKey, DocumentShare, DriveFileMapping, FeedbackPost, FeedbackVote, GoogleDriveToken, PaperImage, Project, ProjectInvite, ProjectMember, User
from ..services import git_service
from ..services.members import apply_pending_project_invites, normalize_email

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class APIKeyIn(BaseModel):
    name: str


class AccountUpdateIn(BaseModel):
    name: str
    email: EmailStr


class PasswordUpdateIn(BaseModel):
    current_password: str
    new_password: str


class DeleteAccountIn(BaseModel):
    password: str


@router.post("/register", status_code=201)
def register(body: RegisterIn, session: Session = Depends(get_session)):
    email = normalize_email(str(body.email))
    if session.exec(select(User).where(func.lower(User.email) == email)).first():
        raise HTTPException(400, "Email already registered")
    user = User(email=email, hashed_password=hash_password(body.password), name=body.name)
    session.add(user)
    session.flush()
    apply_pending_project_invites(session, user)
    session.commit()
    session.refresh(user)
    return {"access_token": create_access_token(str(user.id)), "token_type": "bearer"}


@router.post("/login")
def login(body: LoginIn, session: Session = Depends(get_session)):
    email = normalize_email(str(body.email))
    user = session.exec(select(User).where(func.lower(User.email) == email)).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(401, "Invalid credentials")
    apply_pending_project_invites(session, user)
    session.commit()
    return {"access_token": create_access_token(str(user.id)), "token_type": "bearer"}


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {"id": str(current_user.id), "email": current_user.email, "name": current_user.name}


@router.patch("/me")
def update_me(
    body: AccountUpdateIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    email = normalize_email(str(body.email))
    existing = session.exec(
        select(User).where(func.lower(User.email) == email, User.id != current_user.id)
    ).first()
    if existing:
        raise HTTPException(400, "Email already registered")
    current_user.name = body.name.strip() or current_user.name
    current_user.email = email
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return {"id": str(current_user.id), "email": current_user.email, "name": current_user.name}


@router.patch("/password", status_code=204)
def update_password(
    body: PasswordUpdateIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(400, "Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    current_user.hashed_password = hash_password(body.new_password)
    session.add(current_user)
    session.commit()


@router.delete("/me", status_code=204)
def delete_account(
    body: DeleteAccountIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not verify_password(body.password, current_user.hashed_password):
        raise HTTPException(400, "Password is incorrect")

    owned_projects = session.exec(select(Project).where(Project.created_by == current_user.id)).all()
    for project in owned_projects:
        project_id = str(project.id)
        for row in session.exec(select(ProjectMember).where(ProjectMember.project_id == project.id)).all():
            session.delete(row)
        for row in session.exec(select(ProjectInvite).where(ProjectInvite.project_id == project.id)).all():
            session.delete(row)
        for row in session.exec(select(DriveFileMapping).where(DriveFileMapping.project_id == project.id)).all():
            session.delete(row)
        for row in session.exec(select(DocumentShare).where(DocumentShare.project_id == project.id)).all():
            session.delete(row)
        for row in session.exec(select(PaperImage).where(PaperImage.project_id == project.id)).all():
            session.delete(row)
        git_service.delete_project_repo(project_id)
        session.delete(project)

    for row in session.exec(select(ProjectMember).where(ProjectMember.user_id == current_user.id)).all():
        session.delete(row)
    for row in session.exec(select(ProjectInvite).where(ProjectInvite.invited_by == current_user.id)).all():
        session.delete(row)
    for row in session.exec(select(APIKey).where(APIKey.user_id == current_user.id)).all():
        session.delete(row)
    for row in session.exec(select(FeedbackVote).where(FeedbackVote.user_id == current_user.id)).all():
        session.delete(row)
    for post in session.exec(select(FeedbackPost).where(FeedbackPost.user_id == current_user.id)).all():
        for vote in session.exec(select(FeedbackVote).where(FeedbackVote.post_id == post.id)).all():
            session.delete(vote)
        session.delete(post)
    drive_token = session.exec(select(GoogleDriveToken).where(GoogleDriveToken.user_id == current_user.id)).first()
    if drive_token:
        session.delete(drive_token)
    session.delete(current_user)
    session.commit()


@router.post("/delete-account", status_code=204)
def delete_account_post(
    body: DeleteAccountIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return delete_account(body, current_user, session)


@router.post("/api-keys", status_code=201)
def create_api_key(
    body: APIKeyIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    raw, hashed = generate_api_key()
    key = APIKey(user_id=current_user.id, key_hash=hashed, name=body.name)
    session.add(key)
    session.commit()
    session.refresh(key)
    return {"id": str(key.id), "name": key.name, "key": raw}  # raw shown once only


@router.get("/api-keys")
def list_api_keys(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    keys = session.exec(select(APIKey).where(APIKey.user_id == current_user.id)).all()
    return [{"id": str(k.id), "name": k.name, "last_used": k.last_used} for k in keys]


@router.delete("/api-keys/{key_id}", status_code=204)
def delete_api_key(
    key_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    key = session.exec(
        select(APIKey).where(APIKey.id == key_id, APIKey.user_id == current_user.id)
    ).first()
    if not key:
        raise HTTPException(404, "API key not found")
    session.delete(key)
    session.commit()


# ── Google Drive OAuth ──────────────────────────────────────────────────────

import hashlib, hmac, time
from fastapi.responses import RedirectResponse
from ..services import google_drive as gd
from ..core.config import settings


def _make_state(user_id: str) -> str:
    """Sign user_id + timestamp so the callback can verify it."""
    ts = str(int(time.time()))
    payload = f"{user_id}:{ts}"
    sig = hmac.new(settings.secret_key.encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
    return f"{payload}:{sig}"


def _verify_state(state: str) -> str | None:
    """Return user_id if valid and not expired (5 min window)."""
    try:
        user_id, ts, sig = state.rsplit(":", 2)
        if int(time.time()) - int(ts) > 300:
            return None
        expected = hmac.new(settings.secret_key.encode(), f"{user_id}:{ts}".encode(), hashlib.sha256).hexdigest()[:16]
        if not hmac.compare_digest(sig, expected):
            return None
        return user_id
    except Exception:
        return None


@router.get("/google-drive/authorize")
def google_drive_authorize(current_user: User = Depends(get_current_user)):
    """Return the Google OAuth URL for the current user."""
    state = _make_state(str(current_user.id))
    url = gd.get_auth_url(state)
    return {"url": url}


@router.get("/google-drive/callback")
def google_drive_callback(
    code: str,
    state: str,
    session: Session = Depends(get_session),
):
    """Google redirects here after user grants access."""
    user_id = _verify_state(state)
    if not user_id:
        raise HTTPException(400, "Invalid or expired OAuth state")
    token = gd.exchange_code(code)
    gd.save_token(user_id, token, session)
    return RedirectResponse(f"{settings.frontend_url}/settings?drive=connected")


@router.get("/google-drive/status")
def google_drive_status(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    token = gd.load_token(str(current_user.id), session)
    return {"connected": token is not None}


@router.delete("/google-drive/disconnect", status_code=204)
def google_drive_disconnect(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    from ..models import GoogleDriveToken
    from sqlmodel import select as sel
    row = session.exec(sel(GoogleDriveToken).where(GoogleDriveToken.user_id == current_user.id)).first()
    if row:
        session.delete(row)
        session.commit()
