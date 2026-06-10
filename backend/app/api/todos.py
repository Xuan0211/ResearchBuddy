"""Project TODO lists."""
from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..core.db import get_session
from ..core.security import get_current_user
from ..models import Project, ProjectMember, User
from ..services.contacts import list_contacts
from ..services.project_fs import project_worktree, read_project_file
from .projects import check_member, project_response

router = APIRouter(prefix="/projects", tags=["todos"])

TODO_PATH = ".researchbuddy/todos.json"


class TodoListIn(BaseModel):
    title: str
    week_start: str = ""
    meeting_id: str = ""
    doc_ids: list[str] = []
    due_at: str = ""


class TodoItemIn(BaseModel):
    text: str
    mentions: list[str] = []
    doc_ids: list[str] = []


class TodoListPatch(BaseModel):
    title: str | None = None
    week_start: str | None = None
    meeting_id: str | None = None
    doc_ids: list[str] | None = None
    due_at: str | None = None
    order: int | None = None


class TodoItemPatch(BaseModel):
    text: str | None = None
    completed: bool | None = None
    mentions: list[str] | None = None
    doc_ids: list[str] | None = None
    order: int | None = None


class ReorderIn(BaseModel):
    ids: list[str]


def _week_start(value: date | None = None) -> str:
    d = value or date.today()
    return (d - timedelta(days=d.weekday())).isoformat()


def _load_todos(project_id: str) -> dict:
    try:
        data = json.loads(read_project_file(project_id, TODO_PATH))
    except Exception:
        data = {}
    if isinstance(data.get("lists"), list):
        return {
            "schema": "researchbuddy.todos",
            "version": "2.0",
            "lists": list(data.get("lists") or []),
        }
    legacy = list(data.get("todos") or [])
    grouped: dict[str, list[dict]] = {}
    for todo in legacy:
        week = todo.get("week_start") or _week_start()
        grouped.setdefault(week, []).append(todo)
    lists = []
    for idx, (week, items) in enumerate(sorted(grouped.items())):
        items.sort(key=lambda t: (int(t.get("order", 0)), t.get("created_at", "")))
        lists.append({
            "id": uuid.uuid4().hex[:10],
            "title": "TODO",
            "week_start": week,
            "meeting_id": "",
            "doc_ids": [],
            "due_at": "",
            "order": idx,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "items": [
                {
                    "id": t.get("id") or uuid.uuid4().hex[:10],
                    "text": t.get("title") or "Untitled TODO",
                    "completed": bool(t.get("completed")),
                    "mentions": list(t.get("mentions") or []),
                    "doc_ids": list(t.get("doc_ids") or []),
                    "order": int(t.get("order", 0)),
                    "created_at": t.get("created_at") or datetime.now(timezone.utc).isoformat(),
                }
                for t in items
            ],
        })
    return {
        "schema": "researchbuddy.todos",
        "version": "2.0",
        "lists": lists,
    }


def _write_todos(project_id: str, data: dict, message: str) -> None:
    with project_worktree(project_id) as wt:
        wt.commit_message = message
        path = wt / TODO_PATH
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def _mine(project_id: str, item: dict, user: User, session: Session) -> bool:
    mine = {
        user.email.lower(),
        user.name.lower(),
        user.email.split("@", 1)[0].lower(),
    }
    for contact in list_contacts(project_id, session):
        if str(contact.get("email", "")).lower() == user.email.lower():
            handle = str(contact.get("handle", "")).strip().lstrip("@").lower()
            if handle:
                mine.add(handle)
    return any(str(m).strip().lstrip("@").lower() in mine for m in item.get("mentions", []))


def _public_item(project_id: str, item: dict, user: User, session: Session) -> dict:
    return {**item, "is_mine": _mine(project_id, item, user, session)}


def _public_list(project_id: str, todo_list: dict, user: User, session: Session) -> dict:
    items = [_public_item(project_id, item, user, session) for item in todo_list.get("items", [])]
    items.sort(key=lambda i: (int(i.get("order", 0)), i.get("created_at", "")))
    return {**todo_list, "items": items, "is_mine": any(item.get("is_mine") for item in items)}


@router.get("/todo-board")
def todo_board(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    memberships = session.exec(
        select(ProjectMember).where(ProjectMember.user_id == current_user.id)
    ).all()
    results = []
    for member in memberships:
        project = session.get(Project, member.project_id)
        if not project:
            continue
        project_id = str(project.id)
        lists = [_public_list(project_id, t, current_user, session) for t in _load_todos(project_id)["lists"]]
        active = []
        total = 0
        for todo_list in lists:
            if todo_list.get("week_start") != _week_start():
                continue
            active_items = [item for item in todo_list.get("items", []) if not item.get("completed")]
            total += len(active_items)
            active.append({**todo_list, "items": active_items[:5]})
        active.sort(key=lambda t: (int(t.get("order", 0)), t.get("created_at", "")))
        results.append({
            "project": project_response(project, member.role),
            "lists": active[:3],
            "total": total,
        })
    return results


@router.get("/{project_id}/todos")
def list_todos(
    project_id: str,
    week_start: str = "",
    include_history: bool = False,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    target_week = week_start or _week_start()
    lists = [_public_list(project_id, t, current_user, session) for t in _load_todos(project_id)["lists"]]
    if include_history:
        filtered = lists
    else:
        filtered = [t for t in lists if t.get("week_start") == target_week]
    filtered.sort(key=lambda t: (t.get("week_start", ""), int(t.get("order", 0)), t.get("created_at", "")), reverse=include_history)
    return {"week_start": target_week, "lists": filtered}


@router.post("/{project_id}/todos", status_code=201)
def create_todo_list(
    project_id: str,
    body: TodoListIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    data = _load_todos(project_id)
    week = body.week_start or _week_start()
    week_lists = [t for t in data["lists"] if t.get("week_start") == week]
    todo_list = {
        "id": uuid.uuid4().hex[:10],
        "title": body.title.strip() or "Untitled TODO",
        "week_start": week,
        "meeting_id": body.meeting_id,
        "doc_ids": body.doc_ids,
        "due_at": body.due_at,
        "order": len(week_lists),
        "items": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    data["lists"].append(todo_list)
    _write_todos(project_id, data, f"Add TODO list: {todo_list['title']}")
    return _public_list(project_id, todo_list, current_user, session)


@router.post("/{project_id}/todos/{list_id}/items", status_code=201)
def create_todo_item(
    project_id: str,
    list_id: str,
    body: TodoItemIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    data = _load_todos(project_id)
    for todo_list in data["lists"]:
        if todo_list.get("id") == list_id:
            items = todo_list.setdefault("items", [])
            item = {
                "id": uuid.uuid4().hex[:10],
                "text": body.text.strip() or "Untitled TODO",
                "completed": False,
                "mentions": body.mentions,
                "doc_ids": body.doc_ids,
                "order": len(items),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            items.append(item)
            _write_todos(project_id, data, f"Add TODO item: {item['text']}")
            return _public_item(project_id, item, current_user, session)
    raise HTTPException(404, "TODO list not found")


@router.patch("/{project_id}/todos/{todo_id}")
def update_todo_list(
    project_id: str,
    todo_id: str,
    body: TodoListPatch,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    data = _load_todos(project_id)
    for todo_list in data["lists"]:
        if todo_list.get("id") == todo_id:
            for key, value in body.model_dump(exclude_unset=True).items():
                todo_list[key] = value
            _write_todos(project_id, data, f"Update TODO list: {todo_list.get('title', todo_id)}")
            return _public_list(project_id, todo_list, current_user, session)
    raise HTTPException(404, "TODO list not found")


@router.patch("/{project_id}/todos/{list_id}/items/{item_id}")
def update_todo_item(
    project_id: str,
    list_id: str,
    item_id: str,
    body: TodoItemPatch,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    data = _load_todos(project_id)
    for todo_list in data["lists"]:
        if todo_list.get("id") != list_id:
            continue
        for item in todo_list.get("items", []):
            if item.get("id") == item_id:
                for key, value in body.model_dump(exclude_unset=True).items():
                    item[key] = value
                _write_todos(project_id, data, f"Update TODO item: {item.get('text', item_id)}")
                return _public_item(project_id, item, current_user, session)
        raise HTTPException(404, "TODO item not found")
    raise HTTPException(404, "TODO list not found")


@router.post("/{project_id}/todos/reorder")
def reorder_todos(
    project_id: str,
    body: ReorderIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    data = _load_todos(project_id)
    order = {todo_id: idx for idx, todo_id in enumerate(body.ids)}
    for todo_list in data["lists"]:
        if todo_list.get("id") in order:
            todo_list["order"] = order[todo_list["id"]]
    _write_todos(project_id, data, "Reorder TODO lists")
    return {"ok": True}


@router.post("/{project_id}/todos/{list_id}/items/reorder")
def reorder_todo_items(
    project_id: str,
    list_id: str,
    body: ReorderIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    data = _load_todos(project_id)
    order = {item_id: idx for idx, item_id in enumerate(body.ids)}
    for todo_list in data["lists"]:
        if todo_list.get("id") == list_id:
            for item in todo_list.get("items", []):
                if item.get("id") in order:
                    item["order"] = order[item["id"]]
            _write_todos(project_id, data, "Reorder TODO items")
            return {"ok": True}
    raise HTTPException(404, "TODO list not found")


@router.delete("/{project_id}/todos/{todo_id}", status_code=204)
def delete_todo_list(
    project_id: str,
    todo_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    data = _load_todos(project_id)
    next_lists = [t for t in data["lists"] if t.get("id") != todo_id]
    if len(next_lists) == len(data["lists"]):
        raise HTTPException(404, "TODO list not found")
    data["lists"] = next_lists
    _write_todos(project_id, data, "Delete TODO list")


@router.delete("/{project_id}/todos/{list_id}/items/{item_id}", status_code=204)
def delete_todo_item(
    project_id: str,
    list_id: str,
    item_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    data = _load_todos(project_id)
    for todo_list in data["lists"]:
        if todo_list.get("id") != list_id:
            continue
        next_items = [t for t in todo_list.get("items", []) if t.get("id") != item_id]
        if len(next_items) == len(todo_list.get("items", [])):
            raise HTTPException(404, "TODO item not found")
        todo_list["items"] = next_items
        _write_todos(project_id, data, "Delete TODO item")
        return
    raise HTTPException(404, "TODO list not found")
