from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets
import hashlib

import bcrypt as _bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import Session, select

from .config import settings
from .db import get_session

bearer_scheme = HTTPBearer(auto_error=False)
from fastapi.security import HTTPBasic, HTTPBasicCredentials
basic_scheme = HTTPBasic(auto_error=False)


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    return jwt.encode(
        {"sub": subject, "exp": expire},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def generate_api_key() -> tuple[str, str]:
    """Returns (raw_key, hashed_key). Store only the hash."""
    raw = "rb_" + secrets.token_urlsafe(32)
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed


def hash_api_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    session: Session = Depends(get_session),
):
    from ..models import User, APIKey

    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    token = credentials.credentials

    # Try API key first (prefix "rb_")
    if token.startswith("rb_"):
        key_hash = hash_api_key(token)
        api_key = session.exec(select(APIKey).where(APIKey.key_hash == key_hash)).first()
        if not api_key:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        user = session.get(User, api_key.user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        api_key.last_used = datetime.now(timezone.utc)
        session.add(api_key)
        session.commit()
        return user

    # Otherwise treat as JWT
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return user
