"""Sync Zotero library → project papers/*.md files."""
import re

import httpx

from . import frontmatter as fm
from .project_fs import project_worktree

ZOTERO_API = "https://api.zotero.org"
RB_ARXIV_EXTRA_PREFIX = "ResearchBuddy ArXiv:"
RB_URL_EXTRA_PREFIX = "ResearchBuddy URL:"


def _zotero_web_url(item_key: str, library_id: str, library_type: str) -> str:
    if not library_id:
        return ""
    if library_type == "group":
        return f"https://www.zotero.org/groups/{library_id}/items/{item_key}"
    return f"https://www.zotero.org/myusername/items/{item_key}"  # personal: can't know username


# Item types that are actual publications (not meta-items)
_SKIP_TYPES = {
    "note", "attachment",
}


def _is_valid_item(item: dict) -> bool:
    data = item.get("data", {})
    if data.get("itemType") in _SKIP_TYPES:
        return False
    if not data.get("title", "").strip():
        return False
    return True


def _bbt_citation_key(extra: str) -> str | None:
    """Extract Better BibTeX citation key from Zotero's extra field.
    BBT stores it as:  Citation Key: smithetal2023
    """
    for line in extra.splitlines():
        line = line.strip()
        if line.lower().startswith("citation key:"):
            key = line.split(":", 1)[1].strip()
            # Validate: must be non-empty and filesystem-safe ASCII
            if key and re.match(r"^[a-zA-Z0-9_:.\-]+$", key):
                return key
    return None


def _extra_field(extra: str, prefix: str) -> str:
    prefix_lower = prefix.lower()
    for line in extra.splitlines():
        if line.strip().lower().startswith(prefix_lower):
            return line.split(":", 1)[1].strip()
    return ""


def _paper_id(item: dict) -> str:
    """Use Better BibTeX citation key if present; otherwise generate Author+Year+slug."""
    key = item["key"]
    data = item.get("data", {})

    # 1. Prefer BBT citation key from extra field
    bbt = _bbt_citation_key(data.get("extra", ""))
    if bbt:
        return bbt

    # 2. Fallback: AuthorYEARslug
    first_author = ""
    for c in data.get("creators", []):
        last = c.get("lastName") or c.get("name", "")
        ascii_last = last.encode("ascii", errors="ignore").decode()
        candidate = re.sub(r"[^a-zA-Z0-9]", "", ascii_last, flags=re.ASCII).lower()[:12]
        if candidate:
            first_author = candidate
            break

    date_raw = data.get("date", "")
    year_match = re.search(r"\b(19|20)\d{2}\b", date_raw)
    year = year_match.group(0) if year_match else ""

    title = data.get("title", "")
    ascii_title = title.encode("ascii", errors="ignore").decode()
    slug = re.sub(r"[^a-zA-Z0-9]", "", ascii_title, flags=re.ASCII).lower()[:15]

    candidate = f"{first_author}{year}{slug}"
    return candidate if len(candidate) >= 4 else key


def _parse_authors(creators: list) -> list[str]:
    """Handle both lastName/firstName and name (institution) formats."""
    authors = []
    for c in creators:
        if c.get("creatorType") not in ("author", "editor"):
            continue
        if c.get("lastName"):
            name = f"{c['lastName']}, {c.get('firstName', '')}".rstrip(", ")
        elif c.get("name"):
            name = c["name"]
        else:
            continue
        if name:
            authors.append(name)
    return authors


def _to_frontmatter(item: dict, library_id: str = "", library_type: str = "user") -> dict:
    data = item.get("data", {})
    year_raw = data.get("date", "")
    year = int(year_raw[:4]) if year_raw and year_raw[:4].isdigit() else None

    arxiv_id = ""
    extra = data.get("extra", "")
    for extra_line in data.get("extra", "").splitlines():
        line_lower = extra_line.lower()
        if line_lower.startswith("arxiv:") or line_lower.startswith(RB_ARXIV_EXTRA_PREFIX.lower()):
            from .arxiv import _clean_arxiv_id
            arxiv_id = _clean_arxiv_id(extra_line.split(":", 1)[1].strip())
    url = _extra_field(extra, RB_URL_EXTRA_PREFIX) or data.get("url", "")

    venue = (
        data.get("publicationTitle")
        or data.get("conferenceName")
        or data.get("bookTitle")
        or data.get("university")
        or ""
    )

    bbt_key = _bbt_citation_key(data.get("extra", ""))
    return {
        "id": bbt_key or _paper_id(item),
        "bbt_key": bbt_key or "",   # store so we know it came from BBT
        "title": data.get("title", "").strip(),
        "authors": _parse_authors(data.get("creators", [])),
        "year": year,
        "venue": venue,
        "item_type": data.get("itemType", ""),
        "arxiv_id": arxiv_id,
        "zotero_key": item["key"],
        "doi": data.get("DOI", ""),
        "tags": [t["tag"] for t in data.get("tags", [])],
        "links": {
            "zotero_local": f"zotero://select/library/items/{item['key']}",
            "zotero_web": _zotero_web_url(item["key"], library_id, library_type),
            "arxiv": f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else "",
            "url": url,
            "google_drive_pdf": "",
        },
        "preview_image": "",
        "abstract": data.get("abstractNote", ""),
        "source": "zotero",
    }


def _merge_existing_local_fields(existing: dict, incoming: dict) -> dict:
    """Keep local-only fields when Zotero has no newer value for them."""
    merged = dict(incoming)
    for field in ("arxiv_id", "preview_image"):
        if existing.get(field) and not incoming.get(field):
            merged[field] = existing[field]

    links = dict(incoming.get("links") or {})
    for key, value in (existing.get("links") or {}).items():
        if value and not links.get(key):
            links[key] = value
    if merged.get("arxiv_id") and not links.get("arxiv"):
        links["arxiv"] = f"https://arxiv.org/abs/{merged['arxiv_id']}"
    merged["links"] = links
    return merged


async def sync_project(
    project_id: str,
    api_key: str,
    library_id: str,
    library_type: str = "user",
) -> dict:
    headers = {"Zotero-API-Key": api_key, "Zotero-API-Version": "3"}
    base = f"{ZOTERO_API}/{library_type}s/{library_id}"

    items = []
    start = 0
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            resp = await client.get(
                f"{base}/items",
                headers=headers,
                params={"format": "json", "itemType": "-attachment", "start": start, "limit": 100},
            )
            resp.raise_for_status()
            batch = resp.json()
            if not batch:
                break
            items.extend(batch)
            start += len(batch)
            if len(batch) < 100:
                break

    created = updated = skipped = 0
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Zotero sync: {len(items)} items"
        papers_dir = wt / "papers"
        papers_dir.mkdir(exist_ok=True)

        # Build index: zotero_key → existing file path (to handle renamed/duplicate files)
        existing_by_zotero_key: dict[str, Path] = {}
        for md_file in papers_dir.glob("*.md"):
            try:
                meta_existing, _ = fm.read(md_file)
                zk = meta_existing.get("zotero_key", "")
                if zk:
                    existing_by_zotero_key[zk] = md_file
            except Exception:
                pass

        for item in items:
            if not _is_valid_item(item):
                skipped += 1
                continue
            meta = _to_frontmatter(item, library_id=library_id, library_type=library_type)
            zotero_key = item["key"]

            if zotero_key in existing_by_zotero_key:
                # Update in place — keep original filename (preserve user's notes)
                existing_path = existing_by_zotero_key[zotero_key]
                existing_meta, _ = fm.read(existing_path)
                merged_meta = _merge_existing_local_fields(existing_meta, meta)
                fm.update_metadata(existing_path, {k: v for k, v in merged_meta.items() if k != "id"})
                updated += 1
            else:
                # New paper — write with computed ID as filename
                paper_path = papers_dir / f"{meta['id']}.md"
                if paper_path.exists():
                    # ID collision (e.g., two papers with same author+year+slug) — use zotero key
                    paper_path = papers_dir / f"{zotero_key}.md"
                fm.write(paper_path, meta, "\n## Notes\n\n\n## Related\n\n")
                created += 1

    return {"created": created, "updated": updated, "skipped": skipped, "total": len(items)}
