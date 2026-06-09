"""
Cross-project sync status and bulk sync.

GET  /api/sync/status  — items that have been edited since their last Drive/Zotero sync
POST /api/sync/bulk    — sequentially sync all (or specified) stale items
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from ..core.db import get_session
from ..core.paths import DOCS_DIR, MEETINGS_DIR, PAPERS_NOTES_DIR
from ..core.security import get_current_user
from ..models import DriveFileMapping, Project, ProjectMember, User
from ..services.project_fs import file_last_commit_time, list_project_dir

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sync", tags=["sync"])

# Items that differ by less than this from synced_at are considered in sync.
GRACE = timedelta(seconds=60)

# Ordered priority for bulk sync (lower index = synced first).
TYPE_PRIORITY = ["meeting", "doc", "paper_notes", "mtg-log"]


# ─────────────────────────── helpers ─────────────────────────────


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _needs_sync(last_modified: Optional[datetime], synced_at: Optional[datetime]) -> bool:
    lm = _aware(last_modified)
    sa = _aware(synced_at)
    if lm is None:
        return False
    if sa is None:
        return True  # never synced
    return lm > sa + GRACE


def _item_path(item_type: str, item_id: str) -> Optional[str]:
    return {
        "doc": f"{DOCS_DIR}/{item_id}.md",
        "meeting": f"{MEETINGS_DIR}/{item_id}.md",
        "paper_notes": f"{PAPERS_NOTES_DIR}/{item_id}.md",
    }.get(item_type)


def _type_sort_key(t: str) -> int:
    try:
        return TYPE_PRIORITY.index(t)
    except ValueError:
        return 99


# ─────────────────────────── status ──────────────────────────────


class SyncItem(BaseModel):
    project_id: str
    project_name: str
    item_type: str       # "doc" | "meeting" | "paper_notes" | "mtg-log" | "paper_zotero"
    item_id: str
    item_title: str
    sync_target: str     # "drive" | "zotero"
    last_modified: Optional[str]
    last_synced: Optional[str]


@router.get("/status")
def get_sync_status(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Return items edited since their last Drive or Zotero sync."""
    from ..services import google_drive as gd

    # Projects the user belongs to
    memberships = session.exec(
        select(ProjectMember).where(ProjectMember.user_id == current_user.id)
    ).all()
    project_ids = [str(m.project_id) for m in memberships]
    if not project_ids:
        return {"items": [], "total": 0, "drive_connected": False}

    drive_token = gd.load_token(str(current_user.id), session)
    drive_connected = bool(drive_token)

    projects: dict[str, Project] = {}
    for pid in project_ids:
        p = session.get(Project, pid)
        if p:
            projects[pid] = p

    stale: list[dict] = []

    # ── Drive-backed items (doc, meeting, paper_notes, mtg-log) ──
    if drive_connected:
        all_mappings = session.exec(
            select(DriveFileMapping).where(
                DriveFileMapping.project_id.in_([UUID(pid) for pid in project_ids])
            )
        ).all()

        # Group mtg-log mappings separately for later
        mtg_log_by_project: dict[str, DriveFileMapping] = {}
        item_mappings: list[DriveFileMapping] = []
        for m in all_mappings:
            if m.item_type == "mtg-log":
                mtg_log_by_project[str(m.project_id)] = m
            else:
                item_mappings.append(m)

        for mapping in item_mappings:
            pid = str(mapping.project_id)
            proj = projects.get(pid)
            if not proj:
                continue
            path = _item_path(mapping.item_type, mapping.item_id)
            if not path:
                continue
            try:
                lm = file_last_commit_time(pid, path)
            except Exception:
                continue
            if not _needs_sync(lm, mapping.synced_at):
                continue

            # Fetch title from git frontmatter (best-effort)
            title = _fetch_title(pid, path, mapping.item_id)
            stale.append({
                "project_id": pid,
                "project_name": proj.name,
                "item_type": mapping.item_type,
                "item_id": mapping.item_id,
                "item_title": title,
                "sync_target": "drive",
                "last_modified": lm.isoformat() if lm else None,
                "last_synced": _aware(mapping.synced_at).isoformat() if mapping.synced_at else None,
            })

        # ── MTG log: stale if any meeting was committed after log's synced_at ──
        for pid, log_mapping in mtg_log_by_project.items():
            proj = projects.get(pid)
            if not proj:
                continue
            try:
                meeting_paths = [
                    p for p in list_project_dir(pid, MEETINGS_DIR) if p.endswith(".md")
                ]
                latest_meeting_commit: Optional[datetime] = None
                for mp in meeting_paths:
                    ct = file_last_commit_time(pid, mp)
                    if ct and (_aware(ct) or datetime.fromtimestamp(0, timezone.utc)) > (
                        _aware(latest_meeting_commit) or datetime.fromtimestamp(0, timezone.utc)
                    ):
                        latest_meeting_commit = ct
                if _needs_sync(latest_meeting_commit, log_mapping.synced_at):
                    stale.append({
                        "project_id": pid,
                        "project_name": proj.name,
                        "item_type": "mtg-log",
                        "item_id": "mtg-log",
                        "item_title": "Meeting Log",
                        "sync_target": "drive",
                        "last_modified": latest_meeting_commit.isoformat() if latest_meeting_commit else None,
                        "last_synced": _aware(log_mapping.synced_at).isoformat() if log_mapping.synced_at else None,
                    })
            except Exception:
                pass

    # ── Zotero-backed items: papers with notes edited after last Zotero sync ──
    for pid, proj in projects.items():
        if not proj.zotero_api_key:
            continue
        try:
            paper_paths = [
                p for p in list_project_dir(pid, "papers") if p.endswith(".md")
            ]
        except Exception:
            continue

        zotero_last_sync = _aware(proj.zotero_last_sync)

        for paper_path in paper_paths:
            try:
                lm = file_last_commit_time(pid, paper_path)
            except Exception:
                continue
            if not _needs_sync(lm, zotero_last_sync):
                continue

            # Only flag papers that have a zotero_key and non-empty notes
            try:
                from ..services.project_fs import read_project_file
                import frontmatter as _fm
                content = read_project_file(pid, paper_path)
                post = _fm.loads(content)
                meta = post.metadata
                if not meta.get("zotero_key"):
                    continue
                notes_body = post.content.strip()
                if not notes_body:
                    continue
                paper_id = meta.get("id") or paper_path.split("/")[-1].removesuffix(".md")
                title = meta.get("title", paper_id)
            except Exception:
                continue

            stale.append({
                "project_id": pid,
                "project_name": proj.name,
                "item_type": "paper_zotero",
                "item_id": paper_id,
                "item_title": title,
                "sync_target": "zotero",
                "last_modified": lm.isoformat() if lm else None,
                "last_synced": zotero_last_sync.isoformat() if zotero_last_sync else None,
            })

    # Sort: by project, then by type priority, then by last_modified descending
    stale.sort(key=lambda x: (
        x["project_id"],
        _type_sort_key(x["item_type"]),
        x.get("last_modified") or "",
    ))

    return {"items": stale, "total": len(stale), "drive_connected": drive_connected}


def _fetch_title(project_id: str, path: str, fallback: str) -> str:
    try:
        from ..services.project_fs import read_project_file
        import frontmatter as _fm
        content = read_project_file(project_id, path)
        post = _fm.loads(content)
        return str(post.metadata.get("title", fallback) or fallback)
    except Exception:
        return fallback


# ─────────────────────────── bulk sync ───────────────────────────


class BulkSyncIn(BaseModel):
    items: Optional[list[dict]] = None  # [{project_id, item_type, item_id}] or None = sync all


class BulkSyncResult(BaseModel):
    synced: int
    failed: int
    skipped: int
    results: list[dict]


@router.post("/bulk")
async def bulk_sync(
    body: BulkSyncIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Sync all stale items or a specified list, in a reliable sequential queue."""
    from ..services import google_drive as gd

    drive_token = gd.load_token(str(current_user.id), session)

    # If caller didn't specify items, fetch them from status
    if body.items is None:
        status = get_sync_status(current_user=current_user, session=session)
        items_to_sync = status["items"]
    else:
        items_to_sync = body.items

    results = []
    synced = 0
    failed = 0
    skipped = 0

    # Group by project so we can reuse drive service connections
    from itertools import groupby
    items_to_sync.sort(key=lambda x: (x["project_id"], _type_sort_key(x.get("item_type", ""))))

    for item in items_to_sync:
        pid = item["project_id"]
        itype = item["item_type"]
        iid = item["item_id"]
        result_entry = {"project_id": pid, "item_type": itype, "item_id": iid, "ok": False, "error": None}

        try:
            if itype in ("doc", "meeting", "paper_notes", "mtg-log"):
                if not drive_token:
                    result_entry["error"] = "Google Drive not connected"
                    skipped += 1
                    results.append(result_entry)
                    continue
                await _sync_drive_item(
                    pid, itype, iid, drive_token, str(current_user.id), session
                )
                result_entry["ok"] = True
                synced += 1

            elif itype == "paper_zotero":
                proj = session.get(Project, pid)
                if not proj or not proj.zotero_api_key:
                    result_entry["error"] = "Zotero not configured"
                    skipped += 1
                    results.append(result_entry)
                    continue
                await _sync_zotero_paper(pid, iid, proj, current_user, session)
                result_entry["ok"] = True
                synced += 1

            else:
                result_entry["error"] = f"Unknown item type: {itype}"
                skipped += 1

        except Exception as exc:
            logger.warning("Bulk sync failed for %s/%s/%s: %s", pid, itype, iid, exc)
            result_entry["error"] = str(exc)
            failed += 1

        results.append(result_entry)

    return {"synced": synced, "failed": failed, "skipped": skipped, "results": results}


async def _sync_drive_item(
    project_id: str,
    item_type: str,
    item_id: str,
    token: dict,
    user_id: str,
    session: Session,
) -> None:
    from ..services import google_drive as gd
    from ..models import DriveFileMapping, Project
    from sqlmodel import select as sel
    from datetime import datetime, timezone
    from uuid import UUID

    proj = session.get(Project, project_id)

    if item_type == "doc":
        from ..services import drive_doc_sync
        mapping = session.exec(
            sel(DriveFileMapping).where(
                DriveFileMapping.project_id == project_id,
                DriveFileMapping.item_type == "doc",
                DriveFileMapping.item_id == item_id,
            )
        ).first()
        drive_doc_sync.push_doc_to_drive(
            session, token, user_id, project_id, item_id, mapping=mapping
        )

    elif item_type == "meeting":
        from ..api.meetings import _parse_meeting, _meeting_public
        from ..services import document_tabs as dt
        service = gd.get_service(token, user_id, session)
        docs_service = gd.get_docs_service(token, user_id, session)
        mapping = session.exec(
            sel(DriveFileMapping).where(
                DriveFileMapping.project_id == project_id,
                DriveFileMapping.item_type == "meeting",
                DriveFileMapping.item_id == item_id,
            )
        ).first()
        meta = _parse_meeting(project_id, f"{MEETINGS_DIR}/{item_id}.md")
        tabs = meta.get("tabs") or dt.parse_tabs(meta.get("_body", ""), "Pre-meeting")
        title = meta.get("title", item_id)
        mtg_folder = gd.ensure_project_drive_child_folder(service, project_id, proj.name, "Meetings")
        result = gd.upsert_google_doc_tabs(
            service, docs_service, title, tabs, mtg_folder,
            existing_file_id=mapping.drive_file_id if mapping else None,
        )
        now = datetime.now(timezone.utc)
        if mapping:
            mapping.drive_file_id = result["id"]
            mapping.drive_link = result.get("webViewLink", "")
            mapping.synced_at = now
            session.add(mapping)
        else:
            session.add(DriveFileMapping(
                project_id=UUID(project_id), item_type="meeting", item_id=item_id,
                drive_file_id=result["id"], drive_link=result.get("webViewLink", ""),
            ))
        session.commit()

    elif item_type == "paper_notes":
        from ..api.papers import _parse_paper
        service = gd.get_service(token, user_id, session)
        mapping = session.exec(
            sel(DriveFileMapping).where(
                DriveFileMapping.project_id == project_id,
                DriveFileMapping.item_type == "paper_notes",
                DriveFileMapping.item_id == item_id,
            )
        ).first()
        meta = _parse_paper(project_id, f"{PAPERS_NOTES_DIR}/{item_id}.md")
        title = meta.get("title", item_id)
        notes_body = meta.get("_body", "").strip()
        content = f"# {title}\n\n{notes_body}"
        rb_folder = gd.get_or_create_folder(service, "ResearchBuddy")
        proj_folder = gd.get_or_create_folder(service, proj.name, rb_folder)
        notes_folder = gd.get_or_create_folder(service, "Paper Notes", proj_folder)
        result = gd.upsert_file(
            service, content, f"{item_id}-notes.md", notes_folder,
            existing_file_id=mapping.drive_file_id if mapping else None,
        )
        now = datetime.now(timezone.utc)
        if mapping:
            mapping.drive_file_id = result["id"]
            mapping.drive_link = result.get("webViewLink", "")
            mapping.synced_at = now
            session.add(mapping)
        else:
            session.add(DriveFileMapping(
                project_id=UUID(project_id), item_type="paper_notes", item_id=item_id,
                drive_file_id=result["id"], drive_link=result.get("webViewLink", ""),
            ))
        session.commit()

    elif item_type == "mtg-log":
        from ..api.meetings import _parse_meeting, _meeting_public, sync_mtg_log as _sync_log
        # Reuse the existing mtg-log sync endpoint logic by calling the service directly
        from ..services import document_tabs as dt
        service = gd.get_service(token, user_id, session)
        docs_service = gd.get_docs_service(token, user_id, session)
        mapping = session.exec(
            sel(DriveFileMapping).where(
                DriveFileMapping.project_id == project_id,
                DriveFileMapping.item_type == "mtg-log",
                DriveFileMapping.item_id == "mtg-log",
            )
        ).first()

        from ..services.project_fs import list_project_dir
        paths = list_project_dir(project_id, MEETINGS_DIR)
        from ..api.meetings import _parse_meeting, _meeting_public
        meetings_meta = []
        for p in sorted(paths, reverse=True):
            parts = p.split("/")
            if not p.endswith(".md") or len(parts) != 3:
                continue
            try:
                m = _parse_meeting(project_id, p)
                meetings_meta.append(_meeting_public(m))
            except Exception:
                continue

        mappings_by_id: dict[str, DriveFileMapping] = {}
        all_mtg_mappings = session.exec(
            sel(DriveFileMapping).where(
                DriveFileMapping.project_id == project_id,
                DriveFileMapping.item_type == "meeting",
            )
        ).all()
        for mp in all_mtg_mappings:
            mappings_by_id[mp.item_id] = mp

        sections: list[str] = []
        for m in meetings_meta:
            mtg_date = m.get("date", "")
            title = m.get("title", "")
            mtg_id = m.get("id", "")
            start = m.get("start_time", "")
            end = m.get("end_time", "")
            location = m.get("location", "")
            attendees = m.get("attendees") or []
            mp = mappings_by_id.get(mtg_id)
            drive_link = mp.drive_link if mp and mp.drive_link else None
            lines = [f"## {mtg_date} — {title}"]
            if start:
                lines.append(f"**Time:** {start}–{end}" if end else f"**Time:** {start}")
            if location:
                lines.append(f"**Location:** {location}")
            if attendees:
                lines.append(f"**Attendees:** {', '.join(str(a) for a in attendees)}")
            if drive_link:
                lines.append(f"**Notes:** [Open ↗]({drive_link})")
            sections.append("\n".join(lines))

        log_content = (
            "# Meeting Log\n\n"
            f"_Last updated by ResearchBuddy. {len(meetings_meta)} meeting(s)._\n\n"
            + "\n\n---\n\n".join(sections) + "\n"
        )
        log_tabs = [{"id": "main", "title": "MTG Log", "content": log_content}]
        mtg_folder = gd.ensure_project_drive_child_folder(service, project_id, proj.name, "Meetings")
        result = gd.upsert_google_doc_tabs(
            service, docs_service, "MTG_LOG", log_tabs, mtg_folder,
            existing_file_id=mapping.drive_file_id if mapping else None,
        )
        now = datetime.now(timezone.utc)
        if mapping:
            mapping.drive_file_id = result["id"]
            mapping.drive_link = result.get("webViewLink", "")
            mapping.synced_at = now
            session.add(mapping)
        else:
            session.add(DriveFileMapping(
                project_id=UUID(project_id), item_type="mtg-log", item_id="mtg-log",
                drive_file_id=result["id"], drive_link=result.get("webViewLink", ""),
            ))
        session.commit()


async def _sync_zotero_paper(
    project_id: str,
    paper_id: str,
    proj: Project,
    current_user: User,
    session: Session,
) -> None:
    """Reuse the existing sync-to-zotero logic from papers API."""
    import html
    from ..services.project_fs import read_project_file
    import frontmatter as _fm
    import httpx

    content = read_project_file(project_id, f"{PAPERS_NOTES_DIR}/{paper_id}.md")
    post = _fm.loads(content)
    meta = post.metadata
    zotero_key = meta.get("zotero_key")
    if not zotero_key:
        return

    notes_body = post.content.strip()
    our_tags = set(meta.get("tags", []))

    headers = {"Zotero-API-Key": proj.zotero_api_key, "Zotero-API-Version": "3"}
    lib_type = proj.zotero_library_type
    lib_id = proj.zotero_library_id
    base = f"https://api.zotero.org/{lib_type}s/{lib_id}"

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{base}/items/{zotero_key}", headers=headers)
        resp.raise_for_status()
        item = resp.json()
        version = item.get("version", 0)
        data = item.get("data", {})
        existing_tags = {t["tag"] for t in data.get("tags", [])}
        merged_tags = [{"tag": t} for t in sorted(existing_tags | our_tags)]

        patch_body: dict = {"version": version, "tags": merged_tags}
        patch_resp = await client.patch(
            f"{base}/items/{zotero_key}",
            headers={**headers, "If-Unmodified-Since-Version": str(version)},
            json=patch_body,
        )
        patch_resp.raise_for_status()

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
                nv = rb_note.get("version", 0)
                await client.patch(
                    f"{base}/items/{rb_note['key']}",
                    headers={**headers, "If-Unmodified-Since-Version": str(nv)},
                    json={"version": nv, "note": note_html},
                )
            else:
                await client.post(
                    f"{base}/items",
                    headers=headers,
                    json=[{"itemType": "note", "parentItem": zotero_key, "note": note_html}],
                )

    # Update project's zotero_last_sync
    from datetime import datetime, timezone
    proj.zotero_last_sync = datetime.now(timezone.utc)
    session.add(proj)
    session.commit()
