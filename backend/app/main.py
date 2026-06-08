from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .core.config import settings
from .core.db import init_db
from .api import auth, projects, papers, meetings, documents, workspace, git, codebooks, media, skills, section_resources, writing, gantt
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
app.include_router(documents.public_router, prefix="/api")
app.include_router(workspace.router, prefix="/api")
app.include_router(git.router)
app.include_router(codebooks.router, prefix="/api")
app.include_router(media.router, prefix="/api")
app.include_router(skills.router, prefix="/api")
app.include_router(section_resources.router, prefix="/api")
app.include_router(writing.router, prefix="/api")
app.include_router(gantt.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.app_name}


def _scan_docs_tree(directory: pathlib.Path, base: pathlib.Path) -> list[dict]:
    """Recursively scan docs/ and return a nested tree of {type, name, title, path, children}."""
    import frontmatter as _fm
    items: list[dict] = []
    try:
        entries = sorted(directory.iterdir(), key=lambda p: (p.is_dir(), p.name))
    except PermissionError:
        return []
    for entry in entries:
        rel = entry.relative_to(base)
        if entry.is_dir():
            children = _scan_docs_tree(entry, base)
            if children:
                items.append({
                    "type": "dir",
                    "name": entry.name,
                    "title": entry.name.replace("-", " ").title(),
                    "path": str(rel),
                    "children": children,
                })
        elif entry.suffix == ".md":
            try:
                post = _fm.loads(entry.read_text(encoding="utf-8"))
                title = post.metadata.get("title") or entry.stem.replace("-", " ").title()
            except Exception:
                title = entry.stem.replace("-", " ").title()
            doc_path = str(rel)[:-3]  # strip .md
            items.append({"type": "doc", "name": entry.stem, "title": title, "path": doc_path})
    return items


@app.get("/api/help")
def get_help():
    """Return help index: nested doc tree + content of HOW_TO_USE file."""
    root = pathlib.Path(__file__).parent.parent.parent
    docs_dir = root / "docs"

    tree = _scan_docs_tree(docs_dir, docs_dir) if docs_dir.exists() else []
    # Flat list for backwards-compat
    def _flatten(nodes: list) -> list:
        result = []
        for n in nodes:
            if n["type"] == "doc":
                result.append({"name": n["path"], "title": n["title"]})
            elif n.get("children"):
                result.extend(_flatten(n["children"]))
        return result

    content = ""
    for name in ("HOW_TO_USE_RESEARCHBUDDY.md", "README.md"):
        p = root / name
        if p.exists():
            content = p.read_text(encoding="utf-8")
            break

    return {"content": content, "docs": _flatten(tree), "tree": tree}


@app.get("/api/help/{doc_path:path}")
def get_help_doc(doc_path: str):
    """Return the content of a doc. doc_path can be nested, e.g. 'guides/getting-started'."""
    import re as _re
    from fastapi import HTTPException
    if not _re.fullmatch(r"[a-zA-Z0-9/_-]+", doc_path):
        raise HTTPException(400, "Invalid doc path")
    root = pathlib.Path(__file__).parent.parent.parent
    p = root / "docs" / f"{doc_path}.md"
    if not p.exists():
        raise HTTPException(404, f"Doc '{doc_path}' not found")
    try:
        import frontmatter as _fm
        post = _fm.loads(p.read_text(encoding="utf-8"))
        title = post.metadata.get("title") or p.stem.replace("-", " ").title()
        content = p.read_text(encoding="utf-8")
    except Exception:
        title = p.stem
        content = p.read_text(encoding="utf-8")
    return {"path": doc_path, "title": title, "content": content}
