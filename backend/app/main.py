from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .core.config import settings
from .core.db import init_db
from .api import auth, projects, papers, meetings, documents, workspace, git, codebooks, media
import pathlib

scheduler = AsyncIOScheduler()


async def _hourly_zotero_sync():
    from sqlmodel import Session, select
    from .core.db import engine
    from .models import Project
    from .services.zotero import sync_project
    from datetime import datetime, timezone

    with Session(engine) as session:
        configured = session.exec(select(Project).where(Project.zotero_api_key != "")).all()
        for project in configured:
            try:
                await sync_project(
                    str(project.id),
                    project.zotero_api_key,
                    project.zotero_library_id,
                    project.zotero_library_type,
                )
                project.zotero_last_sync = datetime.now(timezone.utc)
                session.add(project)
            except Exception as e:
                print(f"[zotero sync] project {project.id} failed: {e}")
        session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    scheduler.add_job(_hourly_zotero_sync, "interval", hours=1, id="zotero_hourly")
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="ResearchBuddy API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/api/images", StaticFiles(directory=str(settings.images_dir)), name="images")

app.include_router(auth.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(papers.router, prefix="/api")
app.include_router(meetings.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(workspace.router, prefix="/api")
app.include_router(git.router)
app.include_router(codebooks.router, prefix="/api")
app.include_router(media.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.app_name}


@app.get("/api/help")
def get_help():
    root = pathlib.Path(__file__).parent.parent.parent
    for name in ("HOW_TO_USE_RESEARCHBUDDY.md", "README.md"):
        p = root / name
        if p.exists():
            return {"content": p.read_text(encoding="utf-8")}
    return {"content": "# ResearchBuddy\n\nNo help file found."}
