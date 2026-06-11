"""Document-level comments and Drive round-trip markers."""
from __future__ import annotations

import base64
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any

COMMENTS_MARKER_RE = re.compile(r"\n?\s*<!--\s*rb:comments:v1\s+([A-Za-z0-9_-]+)\s*-->\s*$")


def normalize_comments(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    comments: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        comments.append({
            "id": str(item.get("id") or uuid.uuid4().hex[:10]),
            "text": text,
            "author_id": str(item.get("author_id") or ""),
            "author_name": str(item.get("author_name") or "ResearchBuddy user"),
            "created_at": str(item.get("created_at") or datetime.now(timezone.utc).isoformat()),
        })
    return comments


def make_comment(text: str, user: Any) -> dict[str, Any]:
    return {
        "id": uuid.uuid4().hex[:10],
        "text": text.strip(),
        "author_id": str(getattr(user, "id", "") or ""),
        "author_name": str(getattr(user, "name", "") or getattr(user, "email", "") or "ResearchBuddy user"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def add_comment(raw: Any, text: str, user: Any) -> list[dict[str, Any]]:
    comments = normalize_comments(raw)
    if text.strip():
        comments.append(make_comment(text, user))
    return comments


def delete_comment(raw: Any, comment_id: str) -> list[dict[str, Any]]:
    return [comment for comment in normalize_comments(raw) if str(comment.get("id")) != comment_id]


def encode_comments(comments: Any) -> str:
    normalized = normalize_comments(comments)
    payload = json.dumps(normalized, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def decode_comments(payload: str) -> list[dict[str, Any]]:
    try:
        padded = payload + ("=" * (-len(payload) % 4))
        raw = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
        return normalize_comments(json.loads(raw))
    except Exception:
        return []


def strip_comments_marker(markdown: str) -> str:
    return COMMENTS_MARKER_RE.sub("", markdown or "").rstrip()


def attach_comments_marker(markdown: str, comments: Any) -> str:
    cleaned = strip_comments_marker(markdown)
    normalized = normalize_comments(comments)
    if not normalized:
        return cleaned
    return f"{cleaned.rstrip()}\n\n<!-- rb:comments:v1 {encode_comments(normalized)} -->"


def extract_comments_marker(markdown: str) -> tuple[str, list[dict[str, Any]]]:
    text = markdown or ""
    match = COMMENTS_MARKER_RE.search(text)
    if not match:
        return text, []
    return COMMENTS_MARKER_RE.sub("", text).rstrip(), decode_comments(match.group(1))


def attach_comments_to_tabs(tabs: list[dict[str, Any]], comments: Any) -> list[dict[str, Any]]:
    if not tabs:
        return tabs
    result = [dict(tab) for tab in tabs]
    result[-1]["content"] = attach_comments_marker(str(result[-1].get("content") or ""), comments)
    return result


def extract_comments_from_tabs(tabs: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if not tabs:
        return tabs, []
    result = [dict(tab) for tab in tabs]
    content, comments = extract_comments_marker(str(result[-1].get("content") or ""))
    result[-1]["content"] = content
    return result, comments
