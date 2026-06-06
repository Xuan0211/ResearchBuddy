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
    """Return help index: list of docs + content of HOW_TO_USE file."""
    root = pathlib.Path(__file__).parent.parent.parent
    docs_dir = root / "docs"

    # Collect available docs
    docs: list[dict] = []
    if docs_dir.exists():
        for md in sorted(docs_dir.glob("*.md")):
            try:
                import frontmatter as _fm
                post = _fm.loads(md.read_text(encoding="utf-8"))
                title = post.metadata.get("title") or md.stem.replace("-", " ").title()
            except Exception:
                title = md.stem.replace("-", " ").title()
            docs.append({"name": md.stem, "title": title})

    # Main help content
    content = ""
    for name in ("HOW_TO_USE_RESEARCHBUDDY.md", "README.md"):
        p = root / name
        if p.exists():
            content = p.read_text(encoding="utf-8")
            break

    return {"content": content, "docs": docs}


@app.get("/api/help/{doc_name}")
def get_help_doc(doc_name: str):
    """Return the content of a specific doc from the docs/ folder."""
    root = pathlib.Path(__file__).parent.parent.parent
    # Sanitise: only allow alphanumeric + hyphens/underscores
    import re as _re
    if not _re.fullmatch(r"[a-zA-Z0-9_-]+", doc_name):
        from fastapi import HTTPException
        raise HTTPException(400, "Invalid doc name")
    p = root / "docs" / f"{doc_name}.md"
    if not p.exists():
        from fastapi import HTTPException
        raise HTTPException(404, f"Doc '{doc_name}' not found")
    return {"name": doc_name, "content": p.read_text(encoding="utf-8")}
