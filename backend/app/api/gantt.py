"""Gantt chart / project timeline API."""
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from ..core.db import get_session
from ..core.security import get_current_user
from ..models import User
from ..services.project_fs import read_project_file, project_worktree
from .projects import check_member

router = APIRouter(prefix="/projects/{project_id}/gantt", tags=["gantt"])

GANTT_PATH = ".researchbuddy/gantt.json"


def _load_gantt(project_id: str) -> dict:
    try:
        return json.loads(read_project_file(project_id, GANTT_PATH))
    except Exception:
        return {"tracks": [], "milestones": []}


def _save_gantt(project_id: str, data: dict) -> None:
    with project_worktree(project_id) as wt:
        wt.commit_message = "Update Gantt chart"
        path = wt / GANTT_PATH
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")


class GanttItem(BaseModel):
    id: str = ""
    title: str
    start: str          # ISO date "YYYY-MM-DD"
    end: str            # ISO date "YYYY-MM-DD"
    doc_id: str = ""    # link to a doc
    mentions: list[str] = []  # @handles
    note: str = ""


class GanttTrack(BaseModel):
    id: str = ""
    name: str
    color: str = "#3b82f6"
    items: list[GanttItem] = []


class GanttMilestone(BaseModel):
    id: str = ""
    title: str
    date: str
    color: str = "#ef4444"


class GanttPatch(BaseModel):
    tracks: list[dict] | None = None
    milestones: list[dict] | None = None


@router.get("")
def get_gantt(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    return _load_gantt(project_id)


@router.patch("")
def patch_gantt(
    project_id: str,
    body: GanttPatch,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    data = _load_gantt(project_id)
    if body.tracks is not None:
        data["tracks"] = body.tracks
    if body.milestones is not None:
        data["milestones"] = body.milestones
    _save_gantt(project_id, data)
    return data


@router.post("/tracks", status_code=201)
def add_track(
    project_id: str,
    body: GanttTrack,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    data = _load_gantt(project_id)
    track = body.model_dump()
    track["id"] = track.get("id") or str(uuid.uuid4())[:8]
    data.setdefault("tracks", []).append(track)
    _save_gantt(project_id, data)
    return track


@router.patch("/tracks/{track_id}")
def update_track(
    project_id: str,
    track_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    data = _load_gantt(project_id)
    for track in data.get("tracks", []):
        if track["id"] == track_id:
            for k, v in body.items():
                if k not in ("id", "items"):
                    track[k] = v
            _save_gantt(project_id, data)
            return track
    raise HTTPException(404)


@router.delete("/tracks/{track_id}", status_code=204)
def delete_track(
    project_id: str,
    track_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    data = _load_gantt(project_id)
    data["tracks"] = [t for t in data.get("tracks", []) if t["id"] != track_id]
    _save_gantt(project_id, data)


@router.post("/tracks/{track_id}/items", status_code=201)
def add_item(
    project_id: str,
    track_id: str,
    body: GanttItem,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    data = _load_gantt(project_id)
    for track in data.get("tracks", []):
        if track["id"] == track_id:
            item = body.model_dump()
            item["id"] = item.get("id") or str(uuid.uuid4())[:8]
            track.setdefault("items", []).append(item)
            _save_gantt(project_id, data)
            return item
    raise HTTPException(404, "Track not found")


@router.patch("/tracks/{track_id}/items/{item_id}")
def update_item(
    project_id: str,
    track_id: str,
    item_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    data = _load_gantt(project_id)
    for track in data.get("tracks", []):
        if track["id"] == track_id:
            for item in track.get("items", []):
                if item["id"] == item_id:
                    for k, v in body.items():
                        if k != "id":
                            item[k] = v
                    _save_gantt(project_id, data)
                    return item
            raise HTTPException(404, "Item not found")
    raise HTTPException(404, "Track not found")


@router.delete("/tracks/{track_id}/items/{item_id}", status_code=204)
def delete_item(
    project_id: str,
    track_id: str,
    item_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    data = _load_gantt(project_id)
    for track in data.get("tracks", []):
        if track["id"] == track_id:
            track["items"] = [i for i in track.get("items", []) if i["id"] != item_id]
            _save_gantt(project_id, data)
            return
    raise HTTPException(404)


@router.post("/milestones", status_code=201)
def add_milestone(
    project_id: str,
    body: GanttMilestone,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    data = _load_gantt(project_id)
    ms = body.model_dump()
    ms["id"] = ms.get("id") or str(uuid.uuid4())[:8]
    data.setdefault("milestones", []).append(ms)
    _save_gantt(project_id, data)
    return ms


@router.delete("/milestones/{ms_id}", status_code=204)
def delete_milestone(
    project_id: str,
    ms_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    data = _load_gantt(project_id)
    data["milestones"] = [m for m in data.get("milestones", []) if m["id"] != ms_id]
    _save_gantt(project_id, data)
