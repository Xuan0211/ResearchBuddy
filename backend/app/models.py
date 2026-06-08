from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


def utcnow():
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: str
    name: str
    created_at: datetime = Field(default_factory=utcnow)


class Project(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str
    description: str = ""
    repo_path: str
    created_by: UUID = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow)
    zotero_api_key: str = ""
    zotero_library_id: str = ""
    zotero_library_type: str = "user"
    zotero_last_sync: Optional[datetime] = None


class ProjectMember(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    project_id: UUID = Field(foreign_key="project.id", index=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)
    role: str = "member"  # "admin" | "member" | "viewer"
    joined_at: datetime = Field(default_factory=utcnow)


class ProjectInvite(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    project_id: UUID = Field(foreign_key="project.id")
    invited_by: UUID = Field(foreign_key="user.id")
    token: str = Field(unique=True, index=True)
    role: str = "member"
    email: Optional[str] = None
    used: bool = False
    created_at: datetime = Field(default_factory=utcnow)


class APIKey(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id")
    key_hash: str = Field(unique=True, index=True)
    name: str
    created_at: datetime = Field(default_factory=utcnow)
    last_used: Optional[datetime] = None


class GoogleDriveToken(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id", unique=True, index=True)
    token_encrypted: str   # Fernet-encrypted JSON token blob
    updated_at: datetime = Field(default_factory=utcnow)


class DriveFileMapping(SQLModel, table=True):
    """Tracks which Drive file corresponds to each local doc/meeting."""
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    project_id: UUID = Field(foreign_key="project.id", index=True)
    item_type: str   # "doc" | "meeting"
    item_id: str     # doc_id or meeting_id
    drive_file_id: str
    drive_link: str
    synced_at: datetime = Field(default_factory=utcnow)


class DocumentShare(SQLModel, table=True):
    """Public read-only share token for one project document."""
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    project_id: UUID = Field(foreign_key="project.id", index=True)
    doc_id: str = Field(index=True)
    token: str = Field(unique=True, index=True)
    created_by: UUID = Field(foreign_key="user.id")
    enabled: bool = True
    created_at: datetime = Field(default_factory=utcnow)


class PaperImage(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    project_id: UUID = Field(foreign_key="project.id", index=True)
    paper_id: str
    filename: str
    content_type: str
    created_at: datetime = Field(default_factory=utcnow)
