from pydantic_settings import BaseSettings
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    app_name: str = "ResearchBuddy"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    database_url: str = f"sqlite:///{BASE_DIR}/backend/db.sqlite3"
    projects_dir: Path = BASE_DIR / "backend" / "projects"
    images_dir: Path = BASE_DIR / "backend" / "images"
    project_template_dir: Path = BASE_DIR / "project-template"

    frontend_url: str = "http://localhost:3000"

    # Email
    smtp_host: str = ""
    smtp_port: int = 465
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "ResearchBuddy"
    smtp_use_ssl: bool = True
    imap_host: str = ""
    imap_port: int = 993
    feedback_notification_email: str = ""

    # Google Drive OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/auth/google-drive/callback"

    class Config:
        env_file = BASE_DIR / ".env"
        extra = "ignore"


settings = Settings()
settings.projects_dir.mkdir(parents=True, exist_ok=True)
settings.images_dir.mkdir(parents=True, exist_ok=True)
