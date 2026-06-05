"""Generic project media (image) upload."""
import uuid
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session

from ..core.config import settings
from ..core.db import get_session
from ..core.security import get_current_user
from ..models import User
from .projects import check_member

router = APIRouter(prefix="/projects/{project_id}/media", tags=["media"])

_ALLOWED = {
    "image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg",
    "image/gif": ".gif", "image/webp": ".webp",
}


@router.post("/images")
async def upload_image(
    project_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    ct = (file.content_type or "").lower()
    ext = _ALLOWED.get(ct)
    if not ext:
        # Try to guess from filename
        fn = file.filename or ""
        for e in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
            if fn.lower().endswith(e):
                ext = e if e != ".jpeg" else ".jpg"
                break
    if not ext:
        raise HTTPException(400, "File must be a PNG/JPEG/GIF/WebP image")
    filename = f"{uuid.uuid4().hex}{ext}"
    dest_dir = settings.images_dir / "docs" / project_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    (dest_dir / filename).write_bytes(await file.read())
    return {"url": f"/api/images/docs/{project_id}/{filename}"}
