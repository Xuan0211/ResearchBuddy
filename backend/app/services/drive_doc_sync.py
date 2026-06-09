"""Google Drive sync orchestration for ResearchBuddy documents."""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from uuid import UUID

import frontmatter as frontmatter_lib
from sqlmodel import Session, select

from ..core.db import engine
from ..core.paths import DOCS_DIR
from ..models import DriveFileMapping, Project
from . import document_tabs as dt
from . import frontmatter as fm
from . import google_drive as gd
from .project_fs import file_last_commit_time, project_worktree, read_project_file

logger = logging.getLogger(__name__)

WIKI_LINK_RE = re.compile(r"\[\[([^\]]+)\]\]")
MENTION_RE = re.compile(r"(?<![\w@])@([a-zA-Z0-9_.-]+)")
IMAGE_MD_RE = re.compile(r"!\[[^\]]*\]\([^)]+\)")
IMAGE_PLACEHOLDER_RE = re.compile(r"\[(?:📷\s*[^\]]*|image:\s*[^\]]*)\]")
SYNC_SKEW = timedelta(seconds=5)


def _doc_default_tab_title(meta: dict | None = None) -> str:
    return "Main"


def _extract_paper_refs(body: str) -> list[str]:
    return list(dict.fromkeys(WIKI_LINK_RE.findall(body)))


def _extract_mentions(body: str) -> list[str]:
    return list(dict.fromkeys(MENTION_RE.findall(body)))


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _parse_doc(project_id: str, doc_id: str) -> dict:
    rel_path = f"{DOCS_DIR}/{doc_id}.md"
    content = read_project_file(project_id, rel_path)
    post = frontmatter_lib.loads(content)
    meta = dict(post.metadata)
    body = post.content
    return {
        **meta,
        "_body": body,
        "tabs": dt.parse_tabs(body, _doc_default_tab_title(meta)),
        "_path": rel_path,
    }


def _mapping_for_doc(session: Session, project_id: str, doc_id: str) -> DriveFileMapping | None:
    return session.exec(
        select(DriveFileMapping).where(
            DriveFileMapping.project_id == project_id,
            DriveFileMapping.item_type == "doc",
            DriveFileMapping.item_id == doc_id,
        )
    ).first()


def _local_doc_modified(project_id: str, doc_id: str) -> datetime | None:
    return _aware(file_last_commit_time(project_id, f"{DOCS_DIR}/{doc_id}.md"))


def _merge_local_images_into_pulled_tabs(
    pulled_tabs: list[dict],
    local_tabs: list[dict],
) -> list[dict]:
    """Keep local markdown image references when Google Docs only round-trips text."""
    local_by_id = {tab.get("id"): tab for tab in local_tabs if tab.get("id")}
    local_by_title = {tab.get("title"): tab for tab in local_tabs if tab.get("title")}
    merged: list[dict] = []

    for pulled in pulled_tabs:
        local = local_by_id.get(pulled.get("id")) or local_by_title.get(pulled.get("title"))
        content = pulled.get("content") or ""
        local_content = (local or {}).get("content") or ""
        local_images = IMAGE_MD_RE.findall(local_content)
        if not local_images:
            merged.append(pulled)
            continue

        present_images = set(IMAGE_MD_RE.findall(content))
        missing = [img for img in local_images if img not in present_images]
        if not missing:
            merged.append(pulled)
            continue

        remaining = iter(missing)

        def replace_placeholder(_match: re.Match[str]) -> str:
            try:
                return next(remaining)
            except StopIteration:
                return _match.group(0)

        content = IMAGE_PLACEHOLDER_RE.sub(replace_placeholder, content)
        leftovers = list(remaining)
        if leftovers:
            content = f"{content.rstrip()}\n\n" if content.strip() else ""
            content += "\n\n".join(leftovers)
        merged.append({**pulled, "content": content})

    return merged


def _pull_tabs_from_drive(
    session: Session,
    token: dict,
    user_id: str,
    project_id: str,
    doc_id: str,
    mapping: DriveFileMapping,
) -> str:
    local_meta = _parse_doc(project_id, doc_id)
    local_tabs = local_meta.get("tabs") or dt.parse_tabs(local_meta.get("_body", ""), _doc_default_tab_title(local_meta))

    docs_service = gd.get_docs_service(token, user_id, session)
    text, _ = gd.export_google_doc_tabs_markdown(docs_service, mapping.drive_file_id)
    pulled_tabs = dt.parse_tabs(text, _doc_default_tab_title({}))
    if pulled_tabs:
        pulled_tabs[-1]["content"] = gd.strip_sync_footer(pulled_tabs[-1]["content"])
    pulled_tabs = _merge_local_images_into_pulled_tabs(pulled_tabs, local_tabs)
    return dt.serialize_tabs(pulled_tabs, _doc_default_tab_title({}))


def pull_doc_from_drive(
    session: Session,
    token: dict,
    user_id: str,
    project_id: str,
    doc_id: str,
    mapping: DriveFileMapping | None = None,
) -> dict:
    mapping = mapping or _mapping_for_doc(session, project_id, doc_id)
    if not mapping:
        raise ValueError("No Drive document is linked yet")

    next_content = _pull_tabs_from_drive(session, token, user_id, project_id, doc_id, mapping)
    with project_worktree(project_id) as wt:
        wt.commit_message = f"Pull doc from Drive: {doc_id}"
        path = wt / DOCS_DIR / f"{doc_id}.md"
        if not path.exists():
            raise FileNotFoundError(f"{DOCS_DIR}/{doc_id}.md")
        meta, _ = fm.read(path)
        meta["papers"] = _extract_paper_refs(next_content)
        meta["mentions"] = _extract_mentions(next_content)
        fm.write(path, meta, next_content)

    mapping.synced_at = datetime.now(timezone.utc)
    session.add(mapping)
    session.commit()
    return {"direction": "pull", "ok": True}


def push_doc_to_drive(
    session: Session,
    token: dict,
    user_id: str,
    project_id: str,
    doc_id: str,
    *,
    mapping: DriveFileMapping | None = None,
    target_file_id: str | None = None,
    force_new: bool = False,
) -> dict:
    meta = _parse_doc(project_id, doc_id)
    title = meta.get("title", doc_id)
    tabs = meta.get("tabs") or dt.parse_tabs(meta.get("_body", ""), _doc_default_tab_title(meta))
    doc_folder = meta.get("folder", "")
    project = session.get(Project, project_id)
    if not project:
        raise ValueError("Project not found")

    service = gd.get_service(token, user_id, session)
    docs_service = gd.get_docs_service(token, user_id, session)
    docs_root = gd.ensure_project_drive_child_folder(service, project_id, project.name, "Docs")
    docs_folder = gd.get_or_create_folder(service, doc_folder, docs_root) if doc_folder else docs_root
    result = gd.upsert_google_doc_tabs(
        service,
        docs_service,
        title,
        tabs,
        docs_folder,
        existing_file_id=target_file_id or (mapping.drive_file_id if mapping and not force_new else None),
    )

    if mapping:
        mapping.drive_file_id = result["id"]
        mapping.drive_link = result.get("webViewLink", "")
        mapping.synced_at = datetime.now(timezone.utc)
        session.add(mapping)
    else:
        session.add(DriveFileMapping(
            project_id=UUID(project_id),
            item_type="doc",
            item_id=doc_id,
            drive_file_id=result["id"],
            drive_link=result.get("webViewLink", ""),
        ))
    session.commit()
    return {"direction": "push", "ok": True, "drive_link": result.get("webViewLink", "")}


def smart_sync_doc(
    session: Session,
    token: dict,
    user_id: str,
    project_id: str,
    doc_id: str,
) -> dict:
    mapping = _mapping_for_doc(session, project_id, doc_id)
    if not mapping:
        return push_doc_to_drive(session, token, user_id, project_id, doc_id)

    service = gd.get_service(token, user_id, session)
    drive_modified = _aware(gd.get_file_modified_time(service, mapping.drive_file_id))
    local_modified = _local_doc_modified(project_id, doc_id)
    synced_at = _aware(mapping.synced_at) or datetime.fromtimestamp(0, timezone.utc)

    local_changed = bool(local_modified and local_modified > synced_at + SYNC_SKEW)
    remote_changed = bool(drive_modified and drive_modified > synced_at + SYNC_SKEW)

    if remote_changed and (not local_changed or (drive_modified and local_modified and drive_modified > local_modified + SYNC_SKEW)):
        return pull_doc_from_drive(session, token, user_id, project_id, doc_id, mapping)
    if local_changed:
        return push_doc_to_drive(session, token, user_id, project_id, doc_id, mapping=mapping)

    return {
        "direction": "noop",
        "ok": True,
        "drive_link": mapping.drive_link,
        "local_modified": local_modified.isoformat() if local_modified else None,
        "drive_modified": drive_modified.isoformat() if drive_modified else None,
        "synced_at": synced_at.isoformat(),
    }


def auto_push_updated_docs_to_drive(project_id: str, user_id: str) -> dict:
    """Push mapped docs after git receive-pack when local commit time wins."""
    pushed = 0
    skipped = 0
    errors: list[dict[str, str]] = []

    with Session(engine) as session:
        token = gd.load_token(user_id, session)
        if not token:
            return {"pushed": 0, "skipped": 0, "errors": [], "reason": "drive_not_connected"}

        service = gd.get_service(token, user_id, session)
        mappings = session.exec(
            select(DriveFileMapping).where(
                DriveFileMapping.project_id == project_id,
                DriveFileMapping.item_type == "doc",
            )
        ).all()

        for mapping in mappings:
            try:
                local_modified = _local_doc_modified(project_id, mapping.item_id)
                if not local_modified:
                    skipped += 1
                    continue

                synced_at = _aware(mapping.synced_at) or datetime.fromtimestamp(0, timezone.utc)
                drive_modified = _aware(gd.get_file_modified_time(service, mapping.drive_file_id))
                local_changed = local_modified > synced_at + SYNC_SKEW
                remote_changed = bool(drive_modified and drive_modified > synced_at + SYNC_SKEW)

                if not local_changed:
                    skipped += 1
                    continue
                if remote_changed and drive_modified and drive_modified > local_modified + SYNC_SKEW:
                    logger.warning(
                        "Skipping automatic Drive push because remote doc is newer",
                        extra={
                            "project_id": project_id,
                            "doc_id": mapping.item_id,
                            "local_modified": local_modified.isoformat(),
                            "drive_modified": drive_modified.isoformat(),
                        },
                    )
                    skipped += 1
                    continue

                push_doc_to_drive(
                    session,
                    token,
                    user_id,
                    project_id,
                    mapping.item_id,
                    mapping=mapping,
                )
                pushed += 1
            except Exception as exc:
                logger.exception(
                    "Automatic Drive push after git receive-pack failed",
                    extra={"project_id": project_id, "doc_id": mapping.item_id},
                )
                errors.append({"doc_id": mapping.item_id, "error": str(exc)[:500]})

    return {"pushed": pushed, "skipped": skipped, "errors": errors}
