import json
import re
import secrets
import uuid
from datetime import date as date_type, date, timedelta
from pathlib import Path
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import Session, select

from ..core.config import settings
from ..core.db import get_session
from ..core.paths import MEETINGS_DIR, MEETING_SETTINGS_PATH, MTGLOG_PATH
from ..core.security import get_current_user
from ..models import DocumentShare, User
from ..services.contacts import list_contacts
from ..services import document_tabs as dt
from ..services import frontmatter as fm
from ..services.project_fs import list_project_dir, read_project_file, project_worktree
from .projects import check_member

router = APIRouter(prefix="/projects/{project_id}/meetings", tags=["meetings"])

MEETING_TABS = [
    {
        "id": "pre-meeting",
        "title": "Pre-meeting",
        "content": "## Last Week\n\n## This Week Progress\n\n## Agenda\n",
    },
    {
        "id": "transcript-notes",
        "title": "Transcript / Notes",
        "content": "",
    },
    {
        "id": "post-meeting",
        "title": "Post-meeting",
        "content": "## Conclusions\n\n## TODO\n",
    },
]

MEETING_TEMPLATE = dt.serialize_tabs(MEETING_TABS, "Pre-meeting")

WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


class MeetingSettings(BaseModel):
    default_location: str = ""
    recurring_weekday: int | None = None  # 0=Mon..6=Sun
    recurring_frequency: str = "weekly"  # "weekly" or "biweekly"
    recurring_time: str = ""  # "HH:MM"
    recurring_duration_minutes: int = 60
    default_attendees: list[str] = []  # list of handles


def _load_meeting_settings(project_id: str) -> MeetingSettings:
    try:
        content = read_project_file(project_id, MEETING_SETTINGS_PATH)
        data = json.loads(content)
        return MeetingSettings(**data)
    except (FileNotFoundError, Exception):
        return MeetingSettings()


def _save_meeting_settings(project_id: str, settings: MeetingSettings) -> None:
    with project_worktree(project_id) as wt:
        wt.commit_message = "Update meeting settings"
        settings_path = wt / MEETING_SETTINGS_PATH
        settings_path.parent.mkdir(parents=True, exist_ok=True)
        settings_path.write_text(json.dumps(settings.model_dump(), indent=2), encoding="utf-8")


def _rebuild_mtglog_in_worktree(wt) -> None:
    """Rebuild meetings/mtglog.json from current worktree meeting files."""
    root = Path(str(wt))
    meetings_dir = root / MEETINGS_DIR
    if not meetings_dir.exists():
        return
    entries = []
    for md_file in sorted(meetings_dir.glob("*.md"), reverse=True):
        try:
            import frontmatter as _fm
            content = md_file.read_text(encoding="utf-8")
            post = _fm.loads(content)
            m = dict(post.metadata)
            entries.append({
                "id": m.get("id", ""),
                "date": str(m.get("date", "")),
                "title": m.get("title", ""),
                "drive_link": (m.get("links") or {}).get("google_drive", ""),
            })
        except Exception:
            continue
    data = {
        "schema": "researchbuddy.meetings.mtglog",
        "version": "2.0",
        "entries": entries,
    }
    mtglog_path = root / MTGLOG_PATH
    mtglog_path.parent.mkdir(parents=True, exist_ok=True)
    mtglog_path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _next_weekday_date(weekday: int) -> date:
    """Return the next occurrence of the given weekday (0=Mon..6=Sun) from today."""
    today = date.today()
    days_ahead = weekday - today.weekday()
    if days_ahead <= 0:
        days_ahead += 7
    return today + timedelta(days=days_ahead)


def _parse_date_safe(s: str) -> date | None:
    try:
        return date.fromisoformat(str(s))
    except Exception:
        return None


def _next_biweekly_date(weekday: int, meetings_meta: list[dict]) -> date:
    """Return the next biweekly occurrence of weekday anchored to past meetings."""
    today = date.today()
    same_day = [
        d for m in meetings_meta
        if (d := _parse_date_safe(m.get("date", ""))) and d.weekday() == weekday
    ]
    if same_day:
        last = max(same_day)
        candidate = last + timedelta(weeks=2)
        while candidate <= today:
            candidate += timedelta(weeks=2)
        return candidate
    return _next_weekday_date(weekday)


class MeetingIn(BaseModel):
    date: date_type
    title: str
    start_time: str = ""
    end_time: str = ""
    location: str = ""
    attendees: list[str] = []
    google_drive: str = ""
    outlook_link: str = ""
    transcript_link: str = ""


class MeetingPatch(BaseModel):
    title: str | None = None
    date: date_type | None = None
    attendees: list[str] | None = None
    content: str | None = None
    tab_id: str | None = None
    pre_last_week: str | None = None
    pre_this_week: str | None = None
    pre_agenda: str | None = None
    transcript: str | None = None
    conclusions: str | None = None
    todos: list[str] | None = None
    google_drive: str | None = None
    outlook_link: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    location: str | None = None


class MeetingDriveSyncIn(BaseModel):
    mode: str = "mapped"
    drive_url: str = ""
    file_id: str = ""


class MeetingTabIn(BaseModel):
    title: str
    content: str = ""


class MeetingTabPatch(BaseModel):
    title: str | None = None
    content: str | None = None


class TranscriptAnalysisIn(BaseModel):
    transcript: str


def _meeting_share_id(mtg_id: str) -> str:
    return f"meeting:{mtg_id}"


def _share_public_url(token: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/share/docs/{token}"


def _current_meeting_share(session: Session, project_id: str, mtg_id: str) -> DocumentShare | None:
    return session.exec(
        select(DocumentShare).where(
            DocumentShare.project_id == uuid.UUID(project_id),
            DocumentShare.doc_id == _meeting_share_id(mtg_id),
            DocumentShare.enabled == True,  # noqa: E712
        )
    ).first()


def _share_payload(share: DocumentShare | None) -> dict:
    if not share:
        return {"enabled": False, "token": "", "url": ""}
    return {
        "enabled": share.enabled,
        "token": share.token,
        "url": _share_public_url(share.token),
        "created_at": share.created_at,
    }


def _mtg_id(d: date_type, title: str) -> str:
    slug = re.sub(r"[^\w-]", "", title.lower().replace(" ", "-"))[:30]
    date_prefix = d.strftime("%y%m%d")
    return f"{date_prefix}-{slug}" if slug else date_prefix


def _parse_meeting(project_id: str, rel_path: str) -> dict:
    import frontmatter as _fm
    content = read_project_file(project_id, rel_path)
    post = _fm.loads(content)
    meta = dict(post.metadata)
    return {
        **meta,
        "_body": post.content,
        "tabs": dt.parse_tabs(post.content, "Pre-meeting"),
        "_path": rel_path,
    }


def _meeting_datetime(meta: dict, key: str) -> str:
    event_date = str(meta.get("date", date_type.today()))
    time_value = str(meta.get(key, "") or "").strip()
    if not time_value:
        return event_date
    return f"{event_date}T{time_value[:5]}:00"


def _outlook_calendar_url(meta: dict) -> str:
    start = _meeting_datetime(meta, "start_time")
    end = _meeting_datetime(meta, "end_time")
    if "T" not in start:
        return ""
    if "T" not in end:
        end = start
    body = f"ResearchBuddy meeting note: {meta.get('id', '')}"
    params = {
        "path": "/calendar/action/compose",
        "rru": "addevent",
        "subject": meta.get("title", ""),
        "startdt": start,
        "enddt": end,
        "location": meta.get("location", ""),
        "body": body,
    }
    return "https://outlook.office.com/calendar/0/deeplink/compose?" + urlencode(params)


def _meeting_public(meta: dict) -> dict:
    result = {k: v for k, v in meta.items() if k != "_body"}
    links = dict(result.get("links") or {})
    links.setdefault("outlook_calendar", _outlook_calendar_url(result))
    result["links"] = links
    return result


def _clean_transcript_lines(transcript: str) -> list[str]:
    return [line.strip() for line in transcript.splitlines() if line.strip()]


def _pick_lines(lines: list[str], keywords: tuple[str, ...], limit: int = 8) -> list[str]:
    hits: list[str] = []
    for line in lines:
        lower = line.lower()
        if any(keyword in lower for keyword in keywords):
            cleaned = re.sub(r"^\[[^\]]+\]\s*", "", line)
            hits.append(cleaned[:320])
        if len(hits) >= limit:
            break
    return hits


def _transcript_analysis_markdown(transcript: str) -> tuple[str, str]:
    lines = _clean_transcript_lines(transcript)
    decisions = _pick_lines(lines, ("decided", "decision", "conclusion", "agree", "agreed", "决定", "结论", "同意"))
    todos = _pick_lines(lines, ("todo", "action", "next step", "follow up", "owner", "负责", "行动", "待办", "下一步"))
    questions = _pick_lines(lines, ("?", "question", "unclear", "blocker", "问题", "疑问", "阻塞"))
    topics = lines[:6]

    if not decisions:
        decisions = ["Review the transcript summary and add final conclusions."]
    if not todos:
        todos = ["Confirm next actions and owners."]

    def bullets(items: list[str]) -> str:
        return "\n".join(f"- {item}" for item in items)

    summary = (
        "## Auto Analysis\n\n"
        "### Discussion Points\n"
        f"{bullets(topics) if topics else '- No transcript content provided.'}\n\n"
        "### Decisions / Conclusions\n"
        f"{bullets(decisions)}\n\n"
        "### Action Items\n"
        f"{bullets(todos)}\n\n"
        "### Open Questions\n"
        f"{bullets(questions) if questions else '- None detected.'}\n\n"
        "## Transcript\n\n"
        f"{transcript.strip()}\n"
    )
    post_meeting = (
        "## Conclusions\n\n"
        f"{bullets(decisions)}\n\n"
        "## TODO\n\n"
        f"{bullets(todos)}\n"
    )
    return summary, post_meeting


def _resolve_attendees(project_id: str, session: Session, attendees: list[str]) -> list[dict]:
    contacts = list_contacts(project_id, session)
    by_handle = {c["handle"].lower(): c for c in contacts if c.get("handle")}
    by_email = {c["email"].lower(): c for c in contacts if c.get("email")}
    resolved = []
    for raw in attendees:
        value = str(raw).strip().lstrip("@")
        if not value:
            continue
        contact = by_email.get(value.lower()) or by_handle.get(value.lower())
        email = contact.get("email", "") if contact else (value if "@" in value else "")
        name = contact.get("name", "") if contact else value
        resolved.append({"name": name, "email": email, "raw": raw})
    return resolved


@router.get("/settings")
def get_meeting_settings(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    return _load_meeting_settings(project_id).model_dump()


@router.patch("/settings")
def update_meeting_settings(
    project_id: str,
    body: MeetingSettings,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    _save_meeting_settings(project_id, body)
    return body.model_dump()


@router.get("")
def list_meetings(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    paths = list_project_dir(project_id, MEETINGS_DIR)
    meetings = []
    for p in sorted(paths, reverse=True):
        parts = p.split("/")
        if not p.endswith(".md") or len(parts) != 3:
            continue
        try:
            m = _parse_meeting(project_id, p)
            meetings.append(_meeting_public(m))
        except Exception:
            continue

    settings = _load_meeting_settings(project_id)
    next_date = None
    if settings.recurring_weekday is not None:
        if settings.recurring_frequency == "biweekly":
            next_date = _next_biweekly_date(settings.recurring_weekday, meetings).isoformat()
        else:
            next_date = _next_weekday_date(settings.recurring_weekday).isoformat()

    return {"meetings": meetings, "next_meeting_date": next_date, "settings": settings.model_dump()}


@router.post("", status_code=201)
def create_meeting(
    project_id: str,
    body: MeetingIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")

    mtg_settings = _load_meeting_settings(project_id)

    location = body.location
    start_time = body.start_time
    end_time = body.end_time
    attendees = body.attendees or []

    if not location and mtg_settings.default_location:
        location = mtg_settings.default_location
    if not attendees and mtg_settings.default_attendees:
        attendees = [f"@{h}" if not h.startswith("@") else h for h in mtg_settings.default_attendees]
    if not start_time and mtg_settings.recurring_time:
        start_time = mtg_settings.recurring_time
    if not end_time and mtg_settings.recurring_time and mtg_settings.recurring_duration_minutes:
        try:
            h, m = map(int, mtg_settings.recurring_time.split(":"))
            total_minutes = h * 60 + m + mtg_settings.recurring_duration_minutes
            end_time = f"{total_minutes // 60:02d}:{total_minutes % 60:02d}"
        except Exception:
            pass

    mtg_id = _mtg_id(body.date, body.title)
    meta = {
        "id": mtg_id,
        "date": body.date.isoformat(),
        "title": body.title,
        "start_time": start_time,
        "end_time": end_time,
        "location": location,
        "attendees": attendees,
        "document_type": "meeting",
        "links": {
            "google_drive": body.google_drive,
            "outlook": body.outlook_link,
            "outlook_calendar": "",
            "transcript": body.transcript_link,
        },
    }
    meta["links"]["outlook_calendar"] = _outlook_calendar_url(meta)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Add meeting: {body.title} ({body.date})"
        path = wt / MEETINGS_DIR / f"{mtg_id}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            raise HTTPException(409, "Meeting already exists")
        fm.write(path, meta, MEETING_TEMPLATE)
        _rebuild_mtglog_in_worktree(wt)
    return {"id": mtg_id}


@router.get("/{mtg_id}")
def get_meeting(
    project_id: str,
    mtg_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    try:
        meta = _parse_meeting(project_id, f"{MEETINGS_DIR}/{mtg_id}.md")
        public = _meeting_public(meta)
        public["_body"] = meta.get("_body", "")
        return public
    except FileNotFoundError:
        raise HTTPException(404, "Meeting not found")


@router.get("/{mtg_id}/share")
def get_meeting_share(
    project_id: str,
    mtg_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    try:
        _parse_meeting(project_id, f"{MEETINGS_DIR}/{mtg_id}.md")
    except FileNotFoundError:
        raise HTTPException(404)
    return _share_payload(_current_meeting_share(session, project_id, mtg_id))


@router.post("/{mtg_id}/share")
def create_meeting_share(
    project_id: str,
    mtg_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        _parse_meeting(project_id, f"{MEETINGS_DIR}/{mtg_id}.md")
    except FileNotFoundError:
        raise HTTPException(404)

    existing = _current_meeting_share(session, project_id, mtg_id)
    if existing:
        return _share_payload(existing)

    share = DocumentShare(
        project_id=uuid.UUID(project_id),
        doc_id=_meeting_share_id(mtg_id),
        token=secrets.token_urlsafe(24),
        created_by=current_user.id,
    )
    session.add(share)
    session.commit()
    session.refresh(share)
    return _share_payload(share)


@router.delete("/{mtg_id}/share")
def disable_meeting_share(
    project_id: str,
    mtg_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    share = _current_meeting_share(session, project_id, mtg_id)
    if share:
        share.enabled = False
        session.add(share)
        session.commit()
    return {"enabled": False, "token": "", "url": ""}


@router.patch("/{mtg_id}")
def update_meeting(
    project_id: str,
    mtg_id: str,
    body: MeetingPatch,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    content = updates.pop("content", None)
    tab_id = updates.pop("tab_id", None)
    if isinstance(updates.get("date"), date_type):
        updates["date"] = updates["date"].isoformat()
    link_updates = {}
    if "google_drive" in updates:
        link_updates["google_drive"] = updates.pop("google_drive")
    if "outlook_link" in updates:
        link_updates["outlook"] = updates.pop("outlook_link")
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update meeting: {mtg_id}"
        path = wt / MEETINGS_DIR / f"{mtg_id}.md"
        if not path.exists():
            raise HTTPException(404)
        meta, current = fm.read(path)
        if link_updates:
            links = dict(meta.get("links") or {})
            links.update(link_updates)
            updates["links"] = links
        meta.update(updates)
        links = dict(meta.get("links") or {})
        links["outlook_calendar"] = _outlook_calendar_url(meta)
        meta["links"] = links
        if content is not None and tab_id:
            content = dt.patch_tab(current, tab_id, content, "Pre-meeting")
        fm.write(path, meta, content if content is not None else current)
        _rebuild_mtglog_in_worktree(wt)
    return {"ok": True}


@router.post("/{mtg_id}/tabs", status_code=201)
def create_meeting_tab(
    project_id: str,
    mtg_id: str,
    body: MeetingTabIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Create meeting tab: {mtg_id}"
        path = wt / MEETINGS_DIR / f"{mtg_id}.md"
        if not path.exists():
            raise HTTPException(404)
        meta, current = fm.read(path)
        tabs = dt.parse_tabs(current, "Pre-meeting")
        tabs.append({"title": body.title, "content": body.content})
        next_content = dt.serialize_tabs(tabs, "Pre-meeting")
        fm.write(path, meta, next_content)
    return {"tabs": dt.parse_tabs(next_content, "Pre-meeting")}


@router.patch("/{mtg_id}/tabs/{tab_id}")
def update_meeting_tab(
    project_id: str,
    mtg_id: str,
    tab_id: str,
    body: MeetingTabPatch,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update meeting tab: {mtg_id}/{tab_id}"
        path = wt / MEETINGS_DIR / f"{mtg_id}.md"
        if not path.exists():
            raise HTTPException(404)
        meta, current = fm.read(path)
        tabs = dt.parse_tabs(current, "Pre-meeting")
        found = False
        for tab in tabs:
            if tab["id"] == tab_id:
                if body.title is not None:
                    tab["title"] = body.title
                if body.content is not None:
                    tab["content"] = body.content
                found = True
                break
        if not found:
            raise HTTPException(404, "Tab not found")
        next_content = dt.serialize_tabs(tabs, "Pre-meeting")
        fm.write(path, meta, next_content)
    return {"tabs": dt.parse_tabs(next_content, "Pre-meeting")}


@router.delete("/{mtg_id}/tabs/{tab_id}", status_code=204)
def delete_meeting_tab(
    project_id: str,
    mtg_id: str,
    tab_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Delete meeting tab: {mtg_id}/{tab_id}"
        path = wt / MEETINGS_DIR / f"{mtg_id}.md"
        if not path.exists():
            raise HTTPException(404)
        meta, current = fm.read(path)
        tabs = [tab for tab in dt.parse_tabs(current, "Pre-meeting") if tab["id"] != tab_id]
        if not tabs:
            raise HTTPException(400, "A meeting document needs at least one tab")
        next_content = dt.serialize_tabs(tabs, "Pre-meeting")
        fm.write(path, meta, next_content)


@router.delete("/{mtg_id}", status_code=204)
def delete_meeting(
    project_id: str,
    mtg_id: str,
    delete_drive: bool = True,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    from ..services import google_drive as gd
    from ..models import DriveFileMapping
    from sqlmodel import select as sel

    check_member(project_id, current_user, session, min_role="member")
    mapping = session.exec(
        sel(DriveFileMapping).where(
            DriveFileMapping.project_id == project_id,
            DriveFileMapping.item_type == "meeting",
            DriveFileMapping.item_id == mtg_id,
        )
    ).first()

    if delete_drive and mapping:
        token = gd.load_token(str(current_user.id), session)
        if not token:
            raise HTTPException(400, "Google Drive is not connected; cannot delete linked Drive file")
        try:
            service = gd.get_service(token, str(current_user.id), session)
            gd.trash_file(service, mapping.drive_file_id)
        except Exception as exc:
            raise HTTPException(400, f"Could not delete linked Drive file: {exc}")
        session.delete(mapping)
        session.commit()

    with project_worktree(project_id) as wt:
        wt.commit_message = f"Delete meeting: {mtg_id}"
        path = wt / MEETINGS_DIR / f"{mtg_id}.md"
        if not path.exists():
            raise HTTPException(404)
        path.unlink()
        _rebuild_mtglog_in_worktree(wt)


@router.post("/{mtg_id}/analyze-transcript")
def analyze_meeting_transcript(
    project_id: str,
    mtg_id: str,
    body: TranscriptAnalysisIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    transcript_tab, post_meeting_tab = _transcript_analysis_markdown(body.transcript)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Analyze meeting transcript: {mtg_id}"
        path = wt / MEETINGS_DIR / f"{mtg_id}.md"
        if not path.exists():
            raise HTTPException(404)
        meta, current = fm.read(path)
        tabs = dt.parse_tabs(current, "Pre-meeting")
        tab_by_id = {tab["id"]: tab for tab in tabs}
        if "transcript-notes" in tab_by_id:
            tab_by_id["transcript-notes"]["content"] = transcript_tab
        else:
            tabs.append({"id": "transcript-notes", "title": "Transcript / Notes", "content": transcript_tab})
        if "post-meeting" in tab_by_id:
            tab_by_id["post-meeting"]["content"] = post_meeting_tab
        else:
            tabs.append({"id": "post-meeting", "title": "Post-meeting", "content": post_meeting_tab})
        next_content = dt.serialize_tabs(tabs, "Pre-meeting")
        fm.write(path, meta, next_content)
    return {"tabs": dt.parse_tabs(next_content, "Pre-meeting")}


@router.get("/{mtg_id}/ics")
def download_ics(
    project_id: str,
    mtg_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    try:
        meta = _parse_meeting(project_id, f"{MEETINGS_DIR}/{mtg_id}.md")
    except FileNotFoundError:
        raise HTTPException(404)

    from icalendar import Calendar, Event, vCalAddress, vText
    from datetime import datetime as dt

    cal = Calendar()
    cal.add("prodid", "-//ResearchBuddy//EN")
    cal.add("version", "2.0")
    cal.add("method", "PUBLISH")
    event = Event()
    event.add("summary", meta.get("title", mtg_id))
    event.add("description", f"ResearchBuddy meeting: {mtg_id}")
    if meta.get("location"):
        event.add("location", meta.get("location"))
    start = _meeting_datetime(meta, "start_time")
    end = _meeting_datetime(meta, "end_time")
    if "T" in start:
        event.add("dtstart", dt.fromisoformat(start))
        event.add("dtend", dt.fromisoformat(end if "T" in end else start))
    else:
        event.add("dtstart", dt.fromisoformat(start).date())
        event.add("dtend", dt.fromisoformat(start).date())
    event.add("uid", f"{mtg_id}@researchbuddy")
    for attendee in _resolve_attendees(project_id, session, meta.get("attendees", [])):
        if not attendee["email"]:
            continue
        cal_attendee = vCalAddress(f"MAILTO:{attendee['email']}")
        cal_attendee.params["cn"] = vText(attendee["name"])
        cal_attendee.params["role"] = vText("REQ-PARTICIPANT")
        event.add("attendee", cal_attendee, encode=0)
    cal.add_component(event)

    return Response(
        content=cal.to_ical(),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={mtg_id}.ics"},
    )


@router.post("/{mtg_id}/sync-to-drive")
async def sync_meeting_to_drive(
    project_id: str,
    mtg_id: str,
    body: MeetingDriveSyncIn | None = None,
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
        meta = _parse_meeting(project_id, f"{MEETINGS_DIR}/{mtg_id}.md")
    except FileNotFoundError:
        raise HTTPException(404)
    content = meta.get("_body", "")
    title = meta.get("title", mtg_id)
    tabs = meta.get("tabs") or dt.parse_tabs(content, "Pre-meeting")
    body = body or MeetingDriveSyncIn()

    project = session.get(Project, project_id)

    mapping = session.exec(
        sel(DriveFileMapping).where(
            DriveFileMapping.project_id == project_id,
            DriveFileMapping.item_type == "meeting",
            DriveFileMapping.item_id == mtg_id,
        )
    ).first()

    target_file_id = None
    if body.mode == "existing":
        target_file_id = body.file_id or gd.extract_file_id(body.drive_url)
        if not target_file_id:
            raise HTTPException(400, "Existing Drive sync needs a Drive URL or file id")
    elif body.mode == "mapped":
        target_file_id = mapping.drive_file_id if mapping else None
    elif body.mode == "new":
        target_file_id = None
    else:
        raise HTTPException(400, "mode must be mapped, new, or existing")

    try:
        service = gd.get_service(token, str(current_user.id), session)
        docs_service = gd.get_docs_service(token, str(current_user.id), session)
        mtg_folder = gd.ensure_project_drive_child_folder(
            service,
            project_id,
            project.name,
            "Meetings",
        )
        result = gd.upsert_google_doc_tabs(
            service, docs_service, title, tabs, mtg_folder,
            existing_file_id=target_file_id,
        )
    except Exception as exc:
        raise HTTPException(502, f"Google Drive sync failed: {exc}")

    if mapping:
        mapping.drive_file_id = result["id"]
        mapping.drive_link = result.get("webViewLink", "")
        mapping.synced_at = datetime.now(timezone.utc)
        session.add(mapping)
    else:
        from uuid import UUID
        session.add(DriveFileMapping(
            project_id=UUID(project_id), item_type="meeting", item_id=mtg_id,
            drive_file_id=result["id"], drive_link=result.get("webViewLink", ""),
        ))
    session.commit()
    return {"ok": True, "drive_link": result.get("webViewLink", "")}


@router.post("/{mtg_id}/pull-from-drive")
async def pull_meeting_from_drive(
    project_id: str,
    mtg_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    from ..services import google_drive as gd
    from ..models import DriveFileMapping
    from sqlmodel import select as sel

    check_member(project_id, current_user, session, min_role="member")
    token = gd.load_token(str(current_user.id), session)
    if not token:
        raise HTTPException(400, "Google Drive not connected. Go to Settings to connect.")

    mapping = session.exec(
        sel(DriveFileMapping).where(
            DriveFileMapping.project_id == project_id,
            DriveFileMapping.item_type == "meeting",
            DriveFileMapping.item_id == mtg_id,
        )
    ).first()
    if not mapping:
        raise HTTPException(400, "No Drive document is linked yet")

    try:
        docs_service = gd.get_docs_service(token, str(current_user.id), session)
        text, _ = gd.export_google_doc_tabs_markdown(docs_service, mapping.drive_file_id)
    except Exception as exc:
        raise HTTPException(502, f"Google Drive pull failed: {exc}")

    pulled_tabs = dt.parse_tabs(text, "Pre-meeting")
    if pulled_tabs:
        pulled_tabs[-1]["content"] = gd.strip_sync_footer(pulled_tabs[-1]["content"])
    next_content = dt.serialize_tabs(pulled_tabs, "Pre-meeting")

    from datetime import datetime, timezone
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Pull meeting from Drive: {mtg_id}"
        path = wt / MEETINGS_DIR / f"{mtg_id}.md"
        if not path.exists():
            raise HTTPException(404)
        meta, _ = fm.read(path)
        fm.write(path, meta, next_content)

    mapping.synced_at = datetime.now(timezone.utc)
    session.add(mapping)
    session.commit()

    return {"ok": True}


@router.post("/{mtg_id}/smart-sync")
async def smart_sync_meeting(
    project_id: str,
    mtg_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Push to Drive or pull from Drive depending on which side was modified more recently."""
    from ..services import google_drive as gd
    from ..models import DriveFileMapping, Project
    from sqlmodel import select as sel
    from datetime import datetime, timezone, timedelta

    check_member(project_id, current_user, session, min_role="member")
    token = gd.load_token(str(current_user.id), session)
    if not token:
        raise HTTPException(400, "Google Drive not connected. Go to Settings to connect.")

    mapping = session.exec(
        sel(DriveFileMapping).where(
            DriveFileMapping.project_id == project_id,
            DriveFileMapping.item_type == "meeting",
            DriveFileMapping.item_id == mtg_id,
        )
    ).first()

    try:
        meta = _parse_meeting(project_id, f"{MEETINGS_DIR}/{mtg_id}.md")
    except FileNotFoundError:
        raise HTTPException(404)

    if not mapping:
        content = meta.get("_body", "")
        title = meta.get("title", mtg_id)
        tabs = meta.get("tabs") or dt.parse_tabs(content, "Pre-meeting")
        project = session.get(Project, project_id)
        try:
            service = gd.get_service(token, str(current_user.id), session)
            docs_service = gd.get_docs_service(token, str(current_user.id), session)
            mtg_folder = gd.ensure_project_drive_child_folder(service, project_id, project.name, "Meetings")
            result = gd.upsert_google_doc_tabs(service, docs_service, title, tabs, mtg_folder)
        except Exception as exc:
            raise HTTPException(502, f"Google Drive sync failed: {exc}")
        from uuid import UUID
        session.add(DriveFileMapping(
            project_id=UUID(project_id), item_type="meeting", item_id=mtg_id,
            drive_file_id=result["id"], drive_link=result.get("webViewLink", ""),
        ))
        session.commit()
        return {"direction": "push", "ok": True, "drive_link": result.get("webViewLink", "")}

    service = gd.get_service(token, str(current_user.id), session)
    drive_modified = gd.get_file_modified_time(service, mapping.drive_file_id)
    synced_at = mapping.synced_at
    if synced_at.tzinfo is None:
        synced_at = synced_at.replace(tzinfo=timezone.utc)

    if drive_modified and drive_modified > synced_at + timedelta(seconds=5):
        try:
            docs_service = gd.get_docs_service(token, str(current_user.id), session)
            text, _ = gd.export_google_doc_tabs_markdown(docs_service, mapping.drive_file_id)
        except Exception as exc:
            raise HTTPException(502, f"Google Drive pull failed: {exc}")

        pulled_tabs = dt.parse_tabs(text, "Pre-meeting")
        if pulled_tabs:
            pulled_tabs[-1]["content"] = gd.strip_sync_footer(pulled_tabs[-1]["content"])
        next_content = dt.serialize_tabs(pulled_tabs, "Pre-meeting")

        with project_worktree(project_id) as wt:
            wt.commit_message = f"Smart-sync pull meeting from Drive: {mtg_id}"
            path = wt / MEETINGS_DIR / f"{mtg_id}.md"
            if not path.exists():
                raise HTTPException(404)
            old_meta, _ = fm.read(path)
            fm.write(path, old_meta, next_content)

        mapping.synced_at = datetime.now(timezone.utc)
        session.add(mapping)
        session.commit()
        return {"direction": "pull", "ok": True}

    else:
        content = meta.get("_body", "")
        title = meta.get("title", mtg_id)
        tabs = meta.get("tabs") or dt.parse_tabs(content, "Pre-meeting")
        project = session.get(Project, project_id)
        try:
            docs_service = gd.get_docs_service(token, str(current_user.id), session)
            mtg_folder = gd.ensure_project_drive_child_folder(service, project_id, project.name, "Meetings")
            result = gd.upsert_google_doc_tabs(service, docs_service, title, tabs, mtg_folder,
                                               existing_file_id=mapping.drive_file_id)
        except Exception as exc:
            raise HTTPException(502, f"Google Drive sync failed: {exc}")

        mapping.drive_file_id = result["id"]
        mapping.drive_link = result.get("webViewLink", "")
        mapping.synced_at = datetime.now(timezone.utc)
        session.add(mapping)
        session.commit()
        return {"direction": "push", "ok": True, "drive_link": result.get("webViewLink", "")}


@router.post("/mtg-log/sync")
async def sync_mtg_log(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Create / update a master MTG_LOG Google Doc in the Drive Meetings folder."""
    from ..services import google_drive as gd
    from ..models import DriveFileMapping, Project
    from sqlmodel import select as sel

    check_member(project_id, current_user, session, min_role="member")
    token = gd.load_token(str(current_user.id), session)
    if not token:
        raise HTTPException(400, "Google Drive not connected. Go to Settings to connect.")

    paths = list_project_dir(project_id, MEETINGS_DIR)
    meetings_meta: list[dict] = []
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
    all_mappings = session.exec(
        sel(DriveFileMapping).where(
            DriveFileMapping.project_id == project_id,
            DriveFileMapping.item_type == "meeting",
        )
    ).all()
    for mp in all_mappings:
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
        mapping = mappings_by_id.get(mtg_id)
        drive_link = mapping.drive_link if mapping and mapping.drive_link else None

        lines = [f"## {mtg_date} — {title}"]
        if start:
            time_str = f"{start}–{end}" if end else start
            lines.append(f"**Time:** {time_str}")
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
        + "\n\n---\n\n".join(sections)
        + "\n"
    )

    project = session.get(Project, project_id)
    log_tabs = [{"id": "main", "title": "MTG Log", "content": log_content}]

    log_mapping = session.exec(
        sel(DriveFileMapping).where(
            DriveFileMapping.project_id == project_id,
            DriveFileMapping.item_type == "mtg-log",
            DriveFileMapping.item_id == "mtg-log",
        )
    ).first()

    try:
        service = gd.get_service(token, str(current_user.id), session)
        docs_service = gd.get_docs_service(token, str(current_user.id), session)
        mtg_folder = gd.ensure_project_drive_child_folder(
            service, project_id, project.name, "Meetings"
        )
        result = gd.upsert_google_doc_tabs(
            service, docs_service, "MTG_LOG", log_tabs, mtg_folder,
            existing_file_id=log_mapping.drive_file_id if log_mapping else None,
        )
    except Exception as exc:
        raise HTTPException(502, f"Google Drive sync failed: {exc}")

    from uuid import UUID
    from datetime import datetime, timezone
    if log_mapping:
        log_mapping.drive_file_id = result["id"]
        log_mapping.drive_link = result.get("webViewLink", "")
        log_mapping.synced_at = datetime.now(timezone.utc)
        session.add(log_mapping)
    else:
        session.add(DriveFileMapping(
            project_id=UUID(project_id), item_type="mtg-log", item_id="mtg-log",
            drive_file_id=result["id"], drive_link=result.get("webViewLink", ""),
        ))
    session.commit()

    return {
        "ok": True,
        "drive_link": result.get("webViewLink", ""),
        "synced": len(meetings_meta),
    }


@router.get("/{mtg_id}/drive-link")
def get_meeting_drive_link(
    project_id: str, mtg_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    from ..models import DriveFileMapping
    from sqlmodel import select as sel
    check_member(project_id, current_user, session)
    mapping = session.exec(
        sel(DriveFileMapping).where(
            DriveFileMapping.project_id == project_id,
            DriveFileMapping.item_type == "meeting",
            DriveFileMapping.item_id == mtg_id,
        )
    ).first()
    if not mapping:
        return {"drive_link": None, "synced_at": None}
    return {"drive_link": mapping.drive_link, "synced_at": mapping.synced_at}
