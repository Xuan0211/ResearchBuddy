import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlmodel import Session, select

from ..core.config import settings
from ..core.db import get_session
from ..core.paths import (
    PAPERS_NOTES_DIR, DOCS_DIR,
    WRITING_BASE, WRITING_MANIFEST, WRITING_AI_BIB, WRITING_REFS_BIB,
    PAPERS_REFERENCES_BIB,
)
from ..core.security import get_current_user
from ..models import PaperImage, User
from ..services import document_comments as dc
from ..services import frontmatter as fm
from ..services.project_fs import list_project_dir, read_project_file, project_worktree
from ..services import paper_cache
from ..services.paper_bib import generate_bibtex, rebuild_papers_bib_files
from .projects import check_member

router = APIRouter(prefix="/projects/{project_id}/papers", tags=["papers"])


class CommentIn(BaseModel):
    text: str


def _slugify(title: str) -> str:
    return re.sub(r"[^\w-]", "", title.lower().replace(" ", "-"))[:40]


def _parse_paper(project_id: str, rel_path: str) -> dict:
    import frontmatter as _fm
    content = read_project_file(project_id, rel_path)
    post = _fm.loads(content)
    meta = dict(post.metadata)
    # Derive id and title from filename when missing so the paper stays visible
    stem = rel_path.rsplit("/", 1)[-1].removesuffix(".md")
    if not meta.get("id"):
        meta["id"] = stem
    if not meta.get("title"):
        meta["title"] = stem
        meta["_missing_title"] = True
    return {**meta, "_body": post.content, "_path": rel_path}


def _generate_bibtex(meta: dict) -> str:
    return generate_bibtex(meta)


def _paper_public(meta: dict) -> dict:
    """Return a paper dict enriched with bibtex, stripped of internal keys."""
    result = {k: v for k, v in meta.items() if not k.startswith("_")}
    result["bibtex"] = _generate_bibtex(meta)
    return result


def _normalize_paper_links(meta: dict) -> dict:
    """Normalize editable link fields without dropping existing link keys."""
    if "arxiv_id" in meta and meta.get("arxiv_id"):
        from ..services.arxiv import _clean_arxiv_id
        meta["arxiv_id"] = _clean_arxiv_id(str(meta["arxiv_id"]))

    links = dict(meta.get("links") or {})
    if meta.get("arxiv_id"):
        links["arxiv"] = f"https://arxiv.org/abs/{meta['arxiv_id']}"
    if links:
        meta["links"] = links
    return meta


def _merge_researchbuddy_extra(existing_extra: str, arxiv_id: str = "", url: str = "") -> str:
    from ..services.zotero import RB_ARXIV_EXTRA_PREFIX, RB_URL_EXTRA_PREFIX

    managed_prefixes = (RB_ARXIV_EXTRA_PREFIX.lower(), RB_URL_EXTRA_PREFIX.lower())
    lines = [
        line.rstrip()
        for line in (existing_extra or "").splitlines()
        if not line.strip().lower().startswith(managed_prefixes)
    ]
    additions = []
    if arxiv_id:
        additions.append(f"{RB_ARXIV_EXTRA_PREFIX} {arxiv_id}")
    if url:
        additions.append(f"{RB_URL_EXTRA_PREFIX} {url}")
    if lines and additions:
        lines.append("")
    return "\n".join(lines + additions).strip()


def _list_all_papers(project_id: str) -> list[dict]:
    """List papers with caching."""
    cached = paper_cache.get(project_id)
    if cached is not None:
        return cached

    paths = list_project_dir(project_id, PAPERS_NOTES_DIR)
    papers = []
    for p in paths:
        parts = p.split("/")
        if not p.endswith(".md") or len(parts) != 3:
            continue
        try:
            meta = _parse_paper(project_id, p)
            if not meta.get("title"):
                continue  # unreachable: _parse_paper always sets a fallback title
            papers.append(_paper_public(meta))
        except Exception:
            continue

    # Deduplicate: if same zotero_key appears in multiple files, keep the one with notes
    seen: dict[str, dict] = {}
    for p in papers:
        zk = p.get("zotero_key", "")
        if not zk:
            continue
        if zk not in seen:
            seen[zk] = p
        else:
            existing_body = seen[zk].get("_body", "")
            new_body = p.get("_body", "")
            if len(new_body.strip()) > len(existing_body.strip()):
                seen[zk] = p
    deduped = [p for p in papers if not p.get("zotero_key")] + list(seen.values())

    paper_cache.set(project_id, deduped)
    return deduped


@router.get("/bib/status")
def get_bib_status(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Return status of papers/bib/references.read_only.bib."""
    check_member(project_id, current_user, session)
    try:
        content = read_project_file(project_id, PAPERS_REFERENCES_BIB)
        entry_count = content.count("\n@") + (1 if content.lstrip().startswith("@") else 0)
        return {"path": PAPERS_REFERENCES_BIB, "entry_count": entry_count, "exists": True}
    except FileNotFoundError:
        return {"path": PAPERS_REFERENCES_BIB, "entry_count": 0, "exists": False}


@router.get("/bib/content")
def get_bib_content(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Return raw content of papers/bib/references.read_only.bib."""
    check_member(project_id, current_user, session)
    try:
        return {"content": read_project_file(project_id, PAPERS_REFERENCES_BIB)}
    except FileNotFoundError:
        return {"content": ""}


@router.post("/bib/rebuild")
def rebuild_bib(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Force-rebuild bib files from papers/notes/*.md."""
    check_member(project_id, current_user, session, min_role="member")
    with project_worktree(project_id) as wt:
        wt.commit_message = "Rebuild bib files from papers"
        stats = rebuild_papers_bib_files(Path(str(wt)))
    paper_cache.invalidate(project_id)
    return {"ok": True, "entry_count": stats["references"]}


@router.get("/search")
def search_papers(
    project_id: str,
    q: str = "",
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Fast paper search for wiki-link autocomplete. Returns id, title, authors."""
    check_member(project_id, current_user, session)
    q_lower = q.lower().strip()
    papers = _list_all_papers(project_id)
    results = []
    for p in papers:
        if not q_lower:
            results.append(p)
            continue
        if (q_lower in p.get("id", "").lower()
                or q_lower in p.get("title", "").lower()
                or any(q_lower in a.lower() for a in p.get("authors", []))):
            results.append(p)
    return [{"id": p["id"], "title": p["title"], "authors": p.get("authors", []), "year": p.get("year")} for p in results[:12]]


@router.get("/export/bib")
def export_bibtex(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Export all papers as a single .bib file."""
    from fastapi.responses import Response
    check_member(project_id, current_user, session)
    papers = _list_all_papers(project_id)
    bib = "\n\n".join(p.get("bibtex", "") for p in papers if p.get("bibtex"))
    return Response(
        content=bib.encode("utf-8"),
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename=library.bib"},
    )


@router.get("")
def list_papers(
    project_id: str,
    tag: str | None = None,
    year: int | None = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    papers = _list_all_papers(project_id)
    if tag:
        papers = [p for p in papers if tag in p.get("tags", [])]
    if year:
        papers = [p for p in papers if p.get("year") == year]
    return papers


@router.post("", status_code=201)
async def create_paper(
    project_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")

    arxiv_id = body.get("arxiv_id", "")
    if arxiv_id and not body.get("title"):
        from ..services.arxiv import fetch_metadata
        body = await fetch_metadata(arxiv_id)
    else:
        body = _normalize_paper_links(body)

    paper_id = body.get("id") or _slugify(body.get("title", str(uuid.uuid4())))
    body["id"] = paper_id

    with project_worktree(project_id) as wt:
        wt.commit_message = f"Add paper: {body.get('title', paper_id)}"
        paper_path = wt / PAPERS_NOTES_DIR / f"{paper_id}.md"
        paper_path.parent.mkdir(parents=True, exist_ok=True)
        if paper_path.exists():
            raise HTTPException(409, "Paper already exists")
        body.setdefault("links", {"zotero": "", "arxiv": "", "url": "", "google_drive_pdf": ""})
        body.setdefault("tags", [])
        body.setdefault("preview_image", "")
        body.setdefault("source", "manual")
        fm.write(paper_path, body, "\n## Notes\n\n\n## Related\n\n")
        rebuild_papers_bib_files(Path(str(wt)))

    paper_cache.invalidate(project_id)
    return {"id": paper_id}


@router.get("/{paper_id}")
def get_paper(
    project_id: str,
    paper_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    try:
        meta = _parse_paper(project_id, f"{PAPERS_NOTES_DIR}/{paper_id}.md")
        return _paper_public(meta)
    except FileNotFoundError:
        raise HTTPException(404, "Paper not found")


@router.get("/{paper_id}/comments")
def get_paper_comments(
    project_id: str,
    paper_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    try:
        meta = _parse_paper(project_id, f"{PAPERS_NOTES_DIR}/{paper_id}.md")
    except FileNotFoundError:
        raise HTTPException(404)
    return {"comments": dc.normalize_comments(meta.get("comments", []))}


@router.post("/{paper_id}/comments", status_code=201)
def create_paper_comment(
    project_id: str,
    paper_id: str,
    body: CommentIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Add paper comment: {paper_id}"
        path = wt / PAPERS_NOTES_DIR / f"{paper_id}.md"
        if not path.exists():
            raise HTTPException(404)
        meta, content = fm.read(path)
        meta["comments"] = dc.add_comment(meta.get("comments", []), body.text, current_user)
        fm.write(path, meta, content)
    paper_cache.invalidate(project_id)
    return {"comments": meta["comments"]}


@router.delete("/{paper_id}/comments/{comment_id}", status_code=204)
def delete_paper_comment(
    project_id: str,
    paper_id: str,
    comment_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Delete paper comment: {paper_id}"
        path = wt / PAPERS_NOTES_DIR / f"{paper_id}.md"
        if not path.exists():
            raise HTTPException(404)
        meta, content = fm.read(path)
        meta["comments"] = dc.delete_comment(meta.get("comments", []), comment_id)
        fm.write(path, meta, content)
    paper_cache.invalidate(project_id)


@router.patch("/{paper_id}")
def update_paper(
    project_id: str,
    paper_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update paper: {paper_id}"
        paper_path = wt / PAPERS_NOTES_DIR / f"{paper_id}.md"
        if not paper_path.exists():
            raise HTTPException(404)
        notes = body.pop("notes", None)
        if body:
            _normalize_paper_links(body)
            fm.update_metadata(paper_path, body)
        if notes is not None:
            meta, _ = fm.read(paper_path)
            fm.write(paper_path, meta, f"\n## Notes\n\n{notes}\n")
        rebuild_papers_bib_files(Path(str(wt)))

    paper_cache.invalidate(project_id)
    return {"ok": True}


@router.post("/{paper_id}/image", status_code=201)
async def upload_image(
    project_id: str,
    paper_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")

    allowed = {"image/png", "image/jpeg", "image/webp", "image/gif"}
    if file.content_type not in allowed:
        raise HTTPException(400, "Unsupported image type")

    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "png"
    filename = f"{project_id}_{paper_id}.{ext}"
    dest = settings.images_dir / filename
    dest.write_bytes(await file.read())

    existing = session.exec(
        select(PaperImage).where(PaperImage.project_id == project_id, PaperImage.paper_id == paper_id)
    ).first()
    if existing:
        existing.filename = filename
        existing.content_type = file.content_type
        session.add(existing)
    else:
        img = PaperImage(project_id=project_id, paper_id=paper_id, filename=filename, content_type=file.content_type)
        session.add(img)
    session.commit()

    url = f"/api/images/{filename}"
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Add preview image: {paper_id}"
        paper_path = wt / PAPERS_NOTES_DIR / f"{paper_id}.md"
        if paper_path.exists():
            fm.update_metadata(paper_path, {"preview_image": url})

    paper_cache.invalidate(project_id)
    return {"url": url}


@router.get("/{paper_id}/refs")
def get_paper_refs(
    project_id: str,
    paper_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Documents that cite [[paper_id]]."""
    check_member(project_id, current_user, session)
    doc_paths = list_project_dir(project_id, DOCS_DIR)
    refs = []
    wiki_re = re.compile(r"\[\[([^\]]+)\]\]")
    for p in doc_paths:
        parts = p.split("/")
        if not p.endswith(".md") or len(parts) != 3:
            continue
        try:
            import frontmatter as _fm
            content = read_project_file(project_id, p)
            post = _fm.loads(content)
            meta = dict(post.metadata)
            paper_ids_in_doc = meta.get("papers") or wiki_re.findall(post.content)
            if paper_id in paper_ids_in_doc:
                refs.append({"id": meta.get("id", ""), "title": meta.get("title", p)})
        except Exception:
            continue
    return refs


@router.post("/{paper_id}/sync-to-zotero")
async def sync_paper_to_zotero(
    project_id: str,
    paper_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Write back notes and tags from this paper to Zotero."""
    import html
    from ..models import Project

    check_member(project_id, current_user, session, min_role="member")
    project = session.get(Project, project_id)
    if not project or not project.zotero_api_key:
        raise HTTPException(400, "Zotero not configured for this project")

    try:
        meta = _parse_paper(project_id, f"{PAPERS_NOTES_DIR}/{paper_id}.md")
    except FileNotFoundError:
        raise HTTPException(404)

    zotero_key = meta.get("zotero_key")
    if not zotero_key:
        raise HTTPException(400, "Paper has no Zotero key (not synced from Zotero)")

    import httpx
    headers = {"Zotero-API-Key": project.zotero_api_key, "Zotero-API-Version": "3"}
    lib_type = project.zotero_library_type
    lib_id = project.zotero_library_id
    base = f"https://api.zotero.org/{lib_type}s/{lib_id}"

    our_tags = set(meta.get("tags", []))
    notes_body = meta.get("_body", "").strip()
    msgs = []

    async with httpx.AsyncClient(timeout=15) as client:
        # ── 1. Merge tags (union, never remove existing Zotero tags) ──────────
        resp = await client.get(f"{base}/items/{zotero_key}", headers=headers)
        if resp.status_code == 404:
            raise HTTPException(404, "Item not found in Zotero")
        resp.raise_for_status()
        item = resp.json()
        version = item.get("version", 0)
        data = item.get("data", {})
        existing_tags = {t["tag"] for t in data.get("tags", [])}
        merged_tags = [{"tag": t} for t in sorted(existing_tags | our_tags)]
        links = meta.get("links") or {}
        merged_extra = _merge_researchbuddy_extra(
            data.get("extra", ""),
            arxiv_id=meta.get("arxiv_id", ""),
            url=links.get("url", ""),
        )

        patch_body = {"version": version, "tags": merged_tags}
        if merged_extra != data.get("extra", ""):
            patch_body["extra"] = merged_extra

        patch_resp = await client.patch(
            f"{base}/items/{zotero_key}",
            headers={**headers, "If-Unmodified-Since-Version": str(version)},
            json=patch_body,
        )
        patch_resp.raise_for_status()
        added = len(our_tags - existing_tags)
        msgs.append(f"{len(merged_tags)} tags ({added} new)")
        if patch_body.get("extra") is not None:
            msgs.append("updated Extra links")

        # ── 2. Write notes as a Zotero child note ────────────────────────────
        if notes_body:
            notes_resp = await client.get(
                f"{base}/items/{zotero_key}/children",
                headers=headers,
                params={"itemType": "note"},
            )
            children = notes_resp.json() if notes_resp.is_success else []
            rb_note = next(
                (c for c in children if "ResearchBuddy" in c.get("data", {}).get("note", "")),
                None,
            )
            note_html = f"<h3>ResearchBuddy Notes</h3><pre>{html.escape(notes_body[:4000])}</pre>"
            if rb_note:
                note_version = rb_note.get("version", 0)
                await client.patch(
                    f"{base}/items/{rb_note['key']}",
                    headers={**headers, "If-Unmodified-Since-Version": str(note_version)},
                    json={"version": note_version, "note": note_html},
                )
                msgs.append("updated note")
            else:
                await client.post(
                    f"{base}/items",
                    headers=headers,
                    json=[{"itemType": "note", "parentItem": zotero_key, "note": note_html}],
                )
                msgs.append("created note")

    return {"ok": True, "message": "Synced to Zotero: " + ", ".join(msgs)}


@router.get("/{paper_id}/context")
def get_paper_context(
    project_id: str,
    paper_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """AI-friendly: full metadata + bibtex + notes body."""
    check_member(project_id, current_user, session)
    try:
        meta = _parse_paper(project_id, f"{PAPERS_NOTES_DIR}/{paper_id}.md")
    except FileNotFoundError:
        raise HTTPException(404)
    return {
        "paper": _paper_public(meta),
        "notes": meta.get("_body", ""),
        "project_id": project_id,
    }


@router.post("/{paper_id}/sync-notes-to-drive")
async def sync_notes_to_drive(
    project_id: str,
    paper_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    from ..services import google_drive as gd
    from ..models import DriveFileMapping, Project
    from sqlmodel import select as sel
    from datetime import datetime, timezone

    check_member(project_id, current_user, session, min_role="member")
    token = gd.load_token(str(current_user.id), session)
    if not token:
        raise HTTPException(400, "Google Drive not connected. Go to Settings to connect.")

    try:
        meta = _parse_paper(project_id, f"{PAPERS_NOTES_DIR}/{paper_id}.md")
    except FileNotFoundError:
        raise HTTPException(404)

    project = session.get(Project, project_id)
    notes_body = meta.get("_body", "").strip()
    title = meta.get("title", paper_id)
    content = dc.attach_comments_marker(f"# {title}\n\n{notes_body}", meta.get("comments", []))

    service = gd.get_service(token, str(current_user.id), session)
    rb_folder = gd.get_or_create_folder(service, "ResearchBuddy")
    proj_folder = gd.get_or_create_folder(service, project.name, rb_folder)
    notes_folder = gd.get_or_create_folder(service, "Paper Notes", proj_folder)

    mapping = session.exec(
        sel(DriveFileMapping).where(
            DriveFileMapping.project_id == project_id,
            DriveFileMapping.item_type == "paper_notes",
            DriveFileMapping.item_id == paper_id,
        )
    ).first()

    result = gd.upsert_file(service, content, f"{paper_id}-notes.md", notes_folder,
                            existing_file_id=mapping.drive_file_id if mapping else None)

    if mapping:
        mapping.drive_file_id = result["id"]
        mapping.drive_link = result.get("webViewLink", "")
        mapping.synced_at = datetime.now(timezone.utc)
        session.add(mapping)
    else:
        from uuid import UUID
        session.add(DriveFileMapping(
            project_id=UUID(project_id), item_type="paper_notes", item_id=paper_id,
            drive_file_id=result["id"], drive_link=result.get("webViewLink", ""),
        ))
    session.commit()
    return {"ok": True, "drive_link": result.get("webViewLink", "")}


# ── AI-generated papers ───────────────────────────────────────────────────────

def _parse_bibtex_entries(bib_text: str) -> list[dict]:
    """Very simple BibTeX parser — extracts key, title, author, year."""
    entries: list[dict] = []
    for entry_match in re.finditer(r"@\w+\{([^,]+),(.*?)\n\}", bib_text, re.DOTALL):
        key = entry_match.group(1).strip()
        body = entry_match.group(2)
        def _field(name: str) -> str:
            m = re.search(rf"{name}\s*=\s*[{{\"](.*?)[}}\"]", body, re.IGNORECASE | re.DOTALL)
            return " ".join((m.group(1) if m else "").split())
        entries.append({
            "key": key,
            "title": _field("title"),
            "author": _field("author"),
            "year": _field("year"),
        })
    return entries


@router.get("/ai-generated")
def list_ai_papers(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    writing_paths = list_project_dir(project_id, WRITING_BASE)
    all_entries: list[dict] = []
    seen_writing_dirs: set[str] = set()
    for p in writing_paths:
        parts = p.split("/")
        # Expected: writing/Project/{id}/bibs/ai_generated.bib
        if not p.endswith(f"/{WRITING_AI_BIB}"):
            continue
        if len(parts) < 3:
            continue
        writing_id = parts[2]
        if writing_id in seen_writing_dirs:
            continue
        seen_writing_dirs.add(writing_id)
        try:
            bib_text = read_project_file(project_id, p)
            entries = _parse_bibtex_entries(bib_text)
            for e in entries:
                e["writing_id"] = writing_id
                e["bib_path"] = p
            all_entries.extend(entries)
        except Exception:
            continue
    return all_entries


class AIBibAddIn(BaseModel):
    bibtex: str
    writing_id: str


@router.post("/ai-generated", status_code=201)
def add_ai_paper(
    project_id: str,
    body: AIBibAddIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    bib_path = f"{WRITING_BASE}/{body.writing_id}/{WRITING_AI_BIB}"
    with project_worktree(project_id) as wt:
        wt.commit_message = "Add AI-generated reference"
        path = wt / bib_path
        if not path.exists():
            raise HTTPException(404, f"{WRITING_AI_BIB} not found in writing project {body.writing_id}")
        existing = path.read_text(encoding="utf-8")
        path.write_text(existing.rstrip() + "\n\n" + body.bibtex.strip() + "\n", encoding="utf-8")
        rebuild_papers_bib_files(Path(str(wt)))
    return {"ok": True}


class AIConfirmIn(BaseModel):
    writing_id: str
    key: str


@router.post("/ai-generated/confirm")
def confirm_ai_paper(
    project_id: str,
    body: AIConfirmIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Move a BibTeX entry from ai_generated.bib to references.read_only.bib (local confirmation).
    Full Zotero sync must be done separately via the Zotero integration."""
    check_member(project_id, current_user, session, min_role="member")
    ai_path = f"{WRITING_BASE}/{body.writing_id}/{WRITING_AI_BIB}"
    ref_path = f"{WRITING_BASE}/{body.writing_id}/{WRITING_REFS_BIB}"

    try:
        ai_text = read_project_file(project_id, ai_path)
        ref_text = read_project_file(project_id, ref_path)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))

    pattern = re.compile(
        rf"(@\w+\{{{re.escape(body.key)},.*?\n\}})", re.DOTALL
    )
    m = pattern.search(ai_text)
    if not m:
        raise HTTPException(404, f"Key '{body.key}' not found in ai_generated.bib")

    entry_text = m.group(1)
    new_ai_text = pattern.sub("", ai_text).strip() + "\n"
    new_ref_text = ref_text.rstrip() + f"\n\n% Confirmed from AI references\n{entry_text}\n"

    with project_worktree(project_id) as wt:
        wt.commit_message = f"Confirm AI reference: {body.key}"
        (wt / ai_path).write_text(new_ai_text, encoding="utf-8")
        (wt / ref_path).write_text(new_ref_text, encoding="utf-8")
        rebuild_papers_bib_files(Path(str(wt)))

    return {"ok": True, "key": body.key}
