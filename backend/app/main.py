from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .core.config import settings
from .core.db import init_db
from .api import auth, projects, papers, meetings, documents, workspace, git, codebooks, media, skills, section_resources, writing, gantt, sync, todos, global_skills, feedback
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

_help_images_dir = pathlib.Path(__file__).parent.parent.parent / "docs" / "images"
if _help_images_dir.exists():
    app.mount("/api/help-images", StaticFiles(directory=str(_help_images_dir)), name="help-images")

app.include_router(auth.router, prefix="/api")
app.include_router(todos.router, prefix="/api")
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
app.include_router(global_skills.router, prefix="/api")
app.include_router(feedback.router, prefix="/api")
app.include_router(section_resources.router, prefix="/api")
app.include_router(writing.router, prefix="/api")
app.include_router(gantt.router, prefix="/api")
app.include_router(sync.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.app_name}


import re as _re_module

def _strip_order_prefix(name: str) -> str:
    """Strip leading numeric sort prefix like '01-', '02-' from filenames/dirnames."""
    return _re_module.sub(r"^\d+-", "", name)


def _dir_display_title(dirname: str) -> str:
    """Human-readable title for a directory: strip order prefix, title-case."""
    return _strip_order_prefix(dirname).replace("-", " ").title()


def _scan_docs_tree(directory: pathlib.Path, base: pathlib.Path) -> list[dict]:
    """Recursively scan docs/ and return a nested tree of {type, name, title, path, children}.
    Files/dirs named with leading numbers (01-, 02-) are sorted by that prefix and
    the prefix is stripped from the display title.
    """
    import frontmatter as _fm
    items: list[dict] = []
    try:
        # Sort dirs before files; within each group sort by filename (numeric prefix sorts correctly)
        entries = sorted(directory.iterdir(), key=lambda p: (not p.is_dir(), p.name))
    except PermissionError:
        return []
    for entry in entries:
        # Skip hidden files and README (shown inline by parent dir)
        if entry.name.startswith(".") or entry.name.startswith("_"):
            continue
        rel = entry.relative_to(base)
        if entry.is_dir():
            children = _scan_docs_tree(entry, base)
            if children:
                items.append({
                    "type": "dir",
                    "name": entry.name,
                    "title": _dir_display_title(entry.name),
                    "path": str(rel),
                    "children": children,
                })
        elif entry.suffix == ".md":
            stem = entry.stem
            display_stem = _strip_order_prefix(stem)
            try:
                post = _fm.loads(entry.read_text(encoding="utf-8"))
                title = post.metadata.get("title") or display_stem.replace("-", " ").title()
                body = post.content  # content without frontmatter
            except Exception:
                title = display_stem.replace("-", " ").title()
                body = entry.read_text(encoding="utf-8")
            doc_path = str(rel)[:-3]  # strip .md
            items.append({
                "type": "doc",
                "name": stem,
                "title": title,
                "path": doc_path,
                "display_name": display_stem,
            })
    return items


def _first_doc_path(tree: list) -> str | None:
    """Return the path of the first doc in the tree (depth-first)."""
    for node in tree:
        if node["type"] == "doc":
            return node["path"]
        if node.get("children"):
            found = _first_doc_path(node["children"])
            if found:
                return found
    return None


@app.get("/api/help")
def get_help():
    """Return help index: nested doc tree. first_path points to the first available doc."""
    root = pathlib.Path(__file__).parent.parent.parent
    docs_dir = root / "docs"

    tree = _scan_docs_tree(docs_dir, docs_dir) if docs_dir.exists() else []
    first_path = _first_doc_path(tree)

    return {"tree": tree, "first_path": first_path}


@app.get("/api/help/{doc_path:path}")
def get_help_doc(doc_path: str):
    """Return the content of a doc (body only, no frontmatter). doc_path can be nested."""
    from fastapi import HTTPException
    if not _re_module.fullmatch(r"[a-zA-Z0-9/_-]+", doc_path):
        raise HTTPException(400, "Invalid doc path")
    root = pathlib.Path(__file__).parent.parent.parent
    p = root / "docs" / f"{doc_path}.md"
    if not p.exists():
        raise HTTPException(404, f"Doc '{doc_path}' not found")
    try:
        import frontmatter as _fm
        post = _fm.loads(p.read_text(encoding="utf-8"))
        title = post.metadata.get("title") or p.stem.replace("-", " ").title()
        body = post.content  # strip frontmatter — NotionEditor doesn't need it
    except Exception:
        title = p.stem
        body = p.read_text(encoding="utf-8")
    return {"path": doc_path, "title": title, "content": body}
