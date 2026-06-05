"""Agent-readable tabbed Markdown helpers."""
from __future__ import annotations

import html
import re
from typing import Any

TAB_MARKER_RE = re.compile(
    r"^<!--\s*rb:tab\s+id=\"([^\"]+)\"\s+title=\"([^\"]*)\"\s*-->\s*$",
    re.MULTILINE,
)


def slugify_tab_id(title: str, fallback: str = "tab") -> str:
    slug = re.sub(r"[^\w-]", "", title.lower().replace(" ", "-"))[:48].strip("-")
    return slug or fallback


def normalize_tabs(tabs: list[dict[str, Any]], default_title: str = "Main") -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    seen: set[str] = set()
    for idx, raw in enumerate(tabs):
        title = str(raw.get("title") or default_title).strip() or default_title
        base_id = str(raw.get("id") or slugify_tab_id(title, f"tab-{idx + 1}")).strip()
        tab_id = slugify_tab_id(base_id, f"tab-{idx + 1}")
        candidate = tab_id
        suffix = 2
        while candidate in seen:
            candidate = f"{tab_id}-{suffix}"
            suffix += 1
        seen.add(candidate)
        result.append({
            "id": candidate,
            "title": title,
            "content": str(raw.get("content") or "").strip(),
        })
    return result or [{"id": "main", "title": default_title, "content": ""}]


def serialize_tabs(tabs: list[dict[str, Any]], default_title: str = "Main") -> str:
    parts: list[str] = []
    for tab in normalize_tabs(tabs, default_title):
        safe_id = html.escape(tab["id"], quote=True)
        safe_title = html.escape(tab["title"], quote=True)
        content = tab["content"].strip()
        parts.append(f"<!-- rb:tab id=\"{safe_id}\" title=\"{safe_title}\" -->\n\n{content}\n")
    return "\n".join(parts).strip() + "\n"


def parse_tabs(markdown: str, default_title: str = "Main") -> list[dict[str, str]]:
    matches = list(TAB_MARKER_RE.finditer(markdown or ""))
    if not matches:
        return normalize_tabs([{
            "id": slugify_tab_id(default_title),
            "title": default_title,
            "content": (markdown or "").strip(),
        }], default_title)

    tabs: list[dict[str, str]] = []
    for idx, match in enumerate(matches):
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(markdown)
        tabs.append({
            "id": html.unescape(match.group(1)),
            "title": html.unescape(match.group(2)) or default_title,
            "content": markdown[start:end].strip(),
        })
    return normalize_tabs(tabs, default_title)


def patch_tab(markdown: str, tab_id: str, content: str, default_title: str = "Main") -> str:
    tabs = parse_tabs(markdown, default_title)
    found = False
    for tab in tabs:
        if tab["id"] == tab_id:
            tab["content"] = content
            found = True
            break
    if not found:
        tabs.append({"id": tab_id, "title": tab_id.replace("-", " ").title(), "content": content})
    return serialize_tabs(tabs, default_title)
