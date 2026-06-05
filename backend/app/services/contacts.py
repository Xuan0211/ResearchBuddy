"""Project contact book stored in the workspace repo."""
from __future__ import annotations

import json
import re
from typing import Any

from sqlmodel import Session, select

from ..models import ProjectMember, User
from .project_fs import read_project_file, project_worktree

CONTACTS_PATH = "team/contacts.json"


def _handle(value: str) -> str:
    value = (value or "").strip().lower()
    if "@" in value:
        value = value.split("@", 1)[0]
    return re.sub(r"[^a-z0-9_.-]", "", value.replace(" ", "."))


def _normalize_contact(contact: dict[str, Any]) -> dict[str, Any]:
    email = (contact.get("email") or "").strip()
    name = (contact.get("name") or "").strip() or email.split("@", 1)[0]
    handle = _handle(contact.get("handle") or name or email)
    return {
        "handle": handle,
        "name": name,
        "email": email,
        "role": (contact.get("role") or "").strip(),
        "source": contact.get("source") or "workspace",
    }


def load_workspace_contacts(project_id: str) -> list[dict[str, Any]]:
    try:
        raw = read_project_file(project_id, CONTACTS_PATH)
        data = json.loads(raw)
    except Exception:
        return []
    contacts = data.get("contacts", data if isinstance(data, list) else [])
    return [_normalize_contact(c) for c in contacts if isinstance(c, dict)]


def list_contacts(project_id: str, session: Session) -> list[dict[str, Any]]:
    by_key: dict[str, dict[str, Any]] = {}
    for contact in load_workspace_contacts(project_id):
        key = contact["email"].lower() or contact["handle"]
        by_key[key] = contact

    members = session.exec(select(ProjectMember).where(ProjectMember.project_id == project_id)).all()
    for member in members:
        user = session.get(User, member.user_id)
        if not user:
            continue
        contact = _normalize_contact({
            "name": user.name,
            "email": user.email,
            "role": member.role,
            "source": "member",
        })
        key = contact["email"].lower() or contact["handle"]
        by_key.setdefault(key, contact)

    return sorted(by_key.values(), key=lambda c: (c.get("name") or c.get("handle") or "").lower())


def delete_contact(project_id: str, handle: str) -> bool:
    existing = load_workspace_contacts(project_id)
    filtered = [c for c in existing if c["handle"] != handle]
    if len(filtered) == len(existing):
        return False
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Delete contact: {handle}"
        path = wt / CONTACTS_PATH
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"contacts": filtered}, indent=2) + "\n", encoding="utf-8")
    return True


def upsert_contact(project_id: str, contact: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize_contact(contact)
    existing = load_workspace_contacts(project_id)
    key = normalized["email"].lower() or normalized["handle"]
    replaced = False
    merged: list[dict[str, Any]] = []
    for item in existing:
        item_key = item["email"].lower() or item["handle"]
        if item_key == key:
            merged.append({**item, **normalized})
            replaced = True
        else:
            merged.append(item)
    if not replaced:
        merged.append(normalized)

    with project_worktree(project_id) as wt:
        wt.commit_message = f"Update contact: {normalized['handle']}"
        path = wt / CONTACTS_PATH
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"contacts": merged}, indent=2) + "\n", encoding="utf-8")

    return normalized
