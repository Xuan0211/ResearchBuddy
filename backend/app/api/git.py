"""HTTP Smart Protocol for git clone/push/pull on project repos."""
import subprocess
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from fastapi.security import HTTPBasicCredentials
from sqlmodel import Session, select

from ..core.security import get_current_user, basic_scheme, hash_api_key, verify_password
from ..models import User
from ..services.git_service import get_repo_path, repo_exists
from .projects import check_member
from ..core.db import get_session

router = APIRouter(prefix="/git", tags=["git"])

GIT_SERVICES = {"git-upload-pack", "git-receive-pack"}


def get_git_user(
    basic: Optional[HTTPBasicCredentials] = Depends(basic_scheme),
    session: Session = Depends(get_session),
) -> User:
    """Accept HTTP Basic Auth for git clients: password = API key (rb_...) or account password."""
    from ..models import APIKey
    from fastapi import status

    if basic is None:
        raise HTTPException(status_code=401, headers={"WWW-Authenticate": "Basic"})

    password = basic.password

    # API key path
    if password.startswith("rb_"):
        key_hash = hash_api_key(password)
        api_key = session.exec(select(APIKey).where(APIKey.key_hash == key_hash)).first()
        if not api_key:
            raise HTTPException(status_code=401, headers={"WWW-Authenticate": "Basic"})
        user = session.get(User, api_key.user_id)
        if not user:
            raise HTTPException(status_code=401, headers={"WWW-Authenticate": "Basic"})
        return user

    # Email + password path
    user = session.exec(select(User).where(User.email == basic.username)).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, headers={"WWW-Authenticate": "Basic"})
    return user


def _pkt_line(s: str) -> str:
    return f"{len(s) + 4:04x}{s}"


@router.get("/{project_id}/info/refs")
async def info_refs(
    project_id: str,
    service: str,
    request: Request,
    current_user: User = Depends(get_git_user),
    session: Session = Depends(get_session),
):
    if service not in GIT_SERVICES:
        raise HTTPException(400)
    if not repo_exists(project_id):
        raise HTTPException(404)
    required_role = "viewer" if service == "git-upload-pack" else "member"
    check_member(project_id, current_user, session, min_role=required_role)

    repo_path = get_repo_path(project_id)
    result = subprocess.run(
        ["git", service, "--stateless-rpc", "--advertise-refs", str(repo_path)],
        capture_output=True,
    )
    if result.returncode != 0:
        raise HTTPException(500)

    body = (_pkt_line(f"# service={service}\n") + "0000").encode() + result.stdout
    return Response(content=body, media_type=f"application/x-{service}-advertisement")


@router.post("/{project_id}/{service}")
async def git_rpc(
    project_id: str,
    service: str,
    request: Request,
    current_user: User = Depends(get_git_user),
    session: Session = Depends(get_session),
):
    if service not in GIT_SERVICES:
        raise HTTPException(400)
    if not repo_exists(project_id):
        raise HTTPException(404)
    required_role = "viewer" if service == "git-upload-pack" else "member"
    check_member(project_id, current_user, session, min_role=required_role)

    body = await request.body()
    repo_path = get_repo_path(project_id)
    result = subprocess.run(
        ["git", service, "--stateless-rpc", str(repo_path)],
        input=body,
        capture_output=True,
    )
    if result.returncode != 0:
        raise HTTPException(500, result.stderr.decode())
    if service == "git-receive-pack":
        from ..services.paper_cache import invalidate
        invalidate(project_id)
    return Response(content=result.stdout, media_type=f"application/x-{service}-result")
