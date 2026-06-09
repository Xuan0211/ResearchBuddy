"""Google Drive OAuth2 and file operations."""
import base64
import html
import json
import logging
import re
from datetime import datetime, timezone
from urllib.parse import parse_qs, quote, urlencode, urlparse

import requests as _requests
from cryptography.fernet import Fernet
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaInMemoryUpload
from sqlmodel import Session, select

from ..core.config import settings
from ..models import GoogleDriveToken
from .project_fs import project_worktree, read_project_file

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
]
DRIVE_SETTINGS_PATH = ".researchbuddy/drive-settings.json"
FOLDER_MIME = "application/vnd.google-apps.folder"
_AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
_TOKEN_URI = "https://oauth2.googleapis.com/token"


class GoogleDocsApiError(Exception):
    """Small HttpError-like wrapper for raw Docs REST calls."""

    def __init__(self, status: int, reason: str, content: bytes):
        super().__init__(content.decode("utf-8", errors="replace") or reason)
        self.resp = type("Response", (), {"status": status, "reason": reason})()
        self.content = content


def _fernet() -> Fernet:
    raw = settings.secret_key.encode()[:32].ljust(32, b"=")
    return Fernet(base64.urlsafe_b64encode(raw))


def get_auth_url(state: str) -> str:
    """Build auth URL manually — no PKCE, no library surprises."""
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"{_AUTH_URI}?{urlencode(params)}"


def exchange_code(code: str) -> dict:
    """Exchange auth code for tokens via direct POST (no PKCE)."""
    resp = _requests.post(
        _TOKEN_URI,
        data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": settings.google_redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    resp.raise_for_status()
    data = resp.json()
    return {
        "token": data["access_token"],
        "refresh_token": data.get("refresh_token"),
        "token_uri": _TOKEN_URI,
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "scopes": SCOPES,
    }


def _creds_to_dict(creds: Credentials) -> dict:
    return {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes) if creds.scopes else SCOPES,
    }


def _ensure_required_scopes(token_dict: dict) -> None:
    granted = set(token_dict.get("scopes") or [])
    missing = [scope for scope in SCOPES if scope not in granted]
    if missing:
        raise ValueError("Google Drive permissions changed; reconnect Drive in Settings.")


def save_token(user_id: str, token_dict: dict, session: Session) -> None:
    encrypted = _fernet().encrypt(json.dumps(token_dict).encode()).decode()
    existing = session.exec(
        select(GoogleDriveToken).where(GoogleDriveToken.user_id == user_id)
    ).first()
    if existing:
        existing.token_encrypted = encrypted
        existing.updated_at = datetime.now(timezone.utc)
        session.add(existing)
    else:
        from uuid import UUID
        session.add(GoogleDriveToken(user_id=UUID(user_id), token_encrypted=encrypted))
    session.commit()


def load_token(user_id: str, session: Session) -> dict | None:
    row = session.exec(
        select(GoogleDriveToken).where(GoogleDriveToken.user_id == user_id)
    ).first()
    if not row:
        return None
    return json.loads(_fernet().decrypt(row.token_encrypted.encode()))


def get_service(token_dict: dict, user_id: str, session: Session):
    """Build an authenticated Drive service, refreshing token if needed."""
    _ensure_required_scopes(token_dict)
    creds = Credentials(
        token=token_dict.get("token"),
        refresh_token=token_dict.get("refresh_token"),
        token_uri=token_dict.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=token_dict.get("client_id", settings.google_client_id),
        client_secret=token_dict.get("client_secret", settings.google_client_secret),
        scopes=token_dict.get("scopes", SCOPES),
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        save_token(user_id, _creds_to_dict(creds), session)

    return build("drive", "v3", credentials=creds, cache_discovery=False)


def get_docs_service(token_dict: dict, user_id: str, session: Session):
    _ensure_required_scopes(token_dict)
    creds = Credentials(
        token=token_dict.get("token"),
        refresh_token=token_dict.get("refresh_token"),
        token_uri=token_dict.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=token_dict.get("client_id", settings.google_client_id),
        client_secret=token_dict.get("client_secret", settings.google_client_secret),
        scopes=token_dict.get("scopes", SCOPES),
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        save_token(user_id, _creds_to_dict(creds), session)
    return build("docs", "v1", credentials=creds, cache_discovery=False)


def _drive_query_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def get_or_create_folder(service, name: str, parent_id: str | None = None) -> str:
    q = f"name='{_drive_query_value(name)}' and mimeType='{FOLDER_MIME}' and trashed=false"
    if parent_id:
        q += f" and '{parent_id}' in parents"
    results = service.files().list(
        q=q,
        fields="files(id)",
        spaces="drive",
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
    ).execute()
    files = results.get("files", [])
    if files:
        return files[0]["id"]
    meta: dict = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
    if parent_id:
        meta["parents"] = [parent_id]
    folder = service.files().create(body=meta, fields="id", supportsAllDrives=True).execute()
    return folder["id"]


def create_folder(service, name: str, parent_id: str | None = None) -> dict:
    meta: dict = {"name": name, "mimeType": FOLDER_MIME}
    if parent_id:
        meta["parents"] = [parent_id]
    return service.files().create(body=meta, fields="id,name,webViewLink", supportsAllDrives=True).execute()


def get_file(service, file_id: str) -> dict:
    return service.files().get(fileId=file_id, fields="id,name,mimeType,webViewLink", supportsAllDrives=True).execute()


def get_file_modified_time(service, file_id: str) -> datetime | None:
    """Return the Drive file's modifiedTime as a UTC-aware datetime, or None on error."""
    try:
        result = service.files().get(fileId=file_id, fields="modifiedTime").execute()
        ts = result.get("modifiedTime")
        if ts:
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        pass
    return None


def load_project_drive_settings(project_id: str) -> dict:
    try:
        return json.loads(read_project_file(project_id, DRIVE_SETTINGS_PATH))
    except Exception:
        return {}


def save_project_drive_settings(project_id: str, payload: dict) -> dict:
    data = {
        "schema": "researchbuddy.drive-settings",
        "version": "0.1",
        **payload,
    }
    with project_worktree(project_id) as wt:
        wt.commit_message = "Update Drive sync settings"
        path = wt / DRIVE_SETTINGS_PATH
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return data


def _folder_payload(folder: dict, source: str) -> dict:
    return {
        "root_folder_id": folder.get("id", ""),
        "root_folder_name": folder.get("name", ""),
        "root_folder_link": folder.get("webViewLink", ""),
        "source": source,
    }


def validate_folder(service, folder_id: str) -> dict:
    folder = get_file(service, folder_id)
    if folder.get("mimeType") != FOLDER_MIME:
        raise ValueError("Selected Drive item is not a folder")
    return folder


def set_project_drive_root_existing(service, project_id: str, folder_id: str) -> dict:
    folder = validate_folder(service, folder_id)
    return save_project_drive_settings(project_id, _folder_payload(folder, "existing"))


def create_project_drive_root(service, project_id: str, folder_name: str, parent_id: str | None = None) -> dict:
    folder = create_folder(service, folder_name, parent_id)
    return save_project_drive_settings(project_id, _folder_payload(folder, "created"))


def ensure_project_drive_root(service, project_id: str, project_name: str) -> dict:
    saved = load_project_drive_settings(project_id)
    root_id = saved.get("root_folder_id")
    if root_id:
        folder = validate_folder(service, root_id)
        return {**saved, **_folder_payload(folder, saved.get("source", "existing"))}

    rb_folder = get_or_create_folder(service, "ResearchBuddy")
    project_folder_id = get_or_create_folder(service, project_name, rb_folder)
    folder = get_file(service, project_folder_id)
    return save_project_drive_settings(project_id, _folder_payload(folder, "default"))


def ensure_project_drive_child_folder(
    service,
    project_id: str,
    project_name: str,
    child_name: str,
) -> str:
    root = ensure_project_drive_root(service, project_id, project_name)
    return get_or_create_folder(service, child_name, root["root_folder_id"])


def upsert_file(
    service,
    content: str,
    filename: str,
    folder_id: str,
    existing_file_id: str | None = None,
) -> dict:
    """Create or update a markdown file in Drive. Returns {id, webViewLink}."""
    media = MediaInMemoryUpload(
        content.encode("utf-8"),
        mimetype="text/plain",
        resumable=False,
    )
    if existing_file_id:
        file = service.files().update(
            fileId=existing_file_id,
            media_body=media,
            fields="id,webViewLink",
        ).execute()
    else:
        meta = {"name": filename, "parents": [folder_id]}
        file = service.files().create(
            body=meta,
            media_body=media,
            fields="id,webViewLink",
        ).execute()
    return file


def extract_file_id(value: str) -> str:
    """Accept a Drive/Docs URL or raw file id."""
    value = (value or "").strip()
    if not value:
        return ""
    if "/" not in value and "?" not in value:
        return value
    parsed = urlparse(value)
    patterns = [
        r"/document/d/([^/]+)",
        r"/file/d/([^/]+)",
        r"/folders/([^/?]+)",
        r"/spreadsheets/d/([^/]+)",
        r"/presentation/d/([^/]+)",
    ]
    for pattern in patterns:
        m = re.search(pattern, parsed.path)
        if m:
            return m.group(1)
    return parse_qs(parsed.query).get("id", [""])[0]


SYNC_FOOTER = "\n\n---\n_Synced by ResearchBuddy_"
_SYNC_FOOTER_STRIP = "---\n_Synced by ResearchBuddy_"
_IMG_MD_RE = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")
_IMG_PLACEHOLDER_RE = re.compile(r"\[image:\s*([^\]|]*)\s*\|\s*([^\]]+)\]")
_GOOGLE_HEADING_TO_MD = {
    "HEADING_1": "#",
    "HEADING_2": "##",
    "HEADING_3": "###",
    "HEADING_4": "####",
    "HEADING_5": "#####",
    "HEADING_6": "######",
}


def strip_sync_footer(text: str) -> str:
    """Remove the ResearchBuddy sync footer if present at the end."""
    stripped = text.rstrip()
    if stripped.endswith("_Synced by ResearchBuddy_"):
        stripped = stripped[: -len("_Synced by ResearchBuddy_")].rstrip()
        if stripped.endswith("---"):
            stripped = stripped[:-3].rstrip()
    return stripped


def image_placeholder_to_markdown(text: str) -> str:
    """Restore ResearchBuddy image placeholders that preserve their original src."""
    def repl(match: re.Match[str]) -> str:
        alt = (match.group(1) or "image").strip()
        src = (match.group(2) or "").strip()
        return f"![{alt}]({src})" if src else f"[image: {alt}]"

    return _IMG_PLACEHOLDER_RE.sub(repl, text or "")


def markdown_image_placeholder(match: re.Match[str]) -> str:
    """Represent markdown images as text while keeping enough data to restore locally."""
    alt = (match.group(1) or "image").strip()
    src = (match.group(2) or "").strip()
    return f"[image: {alt} | {src}]" if src else f"[image: {alt}]"


def markdown_to_google_doc_html(title: str, markdown: str, add_footer: bool = True) -> str:
    """Small, predictable Markdown-to-HTML converter for Google Docs import."""
    body_lines = []
    in_ul = False
    for raw in markdown.splitlines():
        line = raw.rstrip()
        if not line:
            if in_ul:
                body_lines.append("</ul>")
                in_ul = False
            continue
        # Image
        img = _IMG_MD_RE.fullmatch(line.strip())
        if img:
            if in_ul:
                body_lines.append("</ul>")
                in_ul = False
            alt = html.escape(img.group(1))
            src = img.group(2)
            body_lines.append(f"<p><img src='{html.escape(src)}' alt='{alt}' style='max-width:100%;height:auto'></p>")
            continue
        heading = re.match(r"^(#{1,6})\s+(.+)$", line)
        if heading:
            if in_ul:
                body_lines.append("</ul>")
                in_ul = False
            level = min(len(heading.group(1)), 6)
            body_lines.append(f"<h{level}>{html.escape(heading.group(2))}</h{level}>")
            continue
        bullet = re.match(r"^[-*]\s+(.+)$", line)
        if bullet:
            if not in_ul:
                body_lines.append("<ul>")
                in_ul = True
            body_lines.append(f"<li>{html.escape(bullet.group(1))}</li>")
            continue
        if in_ul:
            body_lines.append("</ul>")
            in_ul = False
        # Inline images within a paragraph line
        if _IMG_MD_RE.search(line):
            parts = _IMG_MD_RE.split(line)
            out = ""
            for i, part in enumerate(parts):
                if i % 3 == 0:
                    out += html.escape(part)
                elif i % 3 == 1:
                    pass  # alt text — consumed below
                else:
                    alt = html.escape(parts[i - 1])
                    out += f"<img src='{html.escape(part)}' alt='{alt}' style='max-height:200px;vertical-align:middle'>"
            body_lines.append(f"<p>{out}</p>")
            continue
        escaped = html.escape(line)
        escaped = re.sub(r"\[\[([^\]]+)\]\]", r"<code>[[\1]]</code>", escaped)
        escaped = re.sub(r"(?<![\w@])@([a-zA-Z0-9_.-]+)", r"<strong>@\1</strong>", escaped)
        body_lines.append(f"<p>{escaped}</p>")
    if in_ul:
        body_lines.append("</ul>")

    footer = "<hr><p style='color:#2563eb'><em>Synced by ResearchBuddy</em></p>" if add_footer else ""
    return (
        "<!doctype html><html><head><meta charset='utf-8'>"
        f"<title>{html.escape(title)}</title></head><body>"
        f"{''.join(body_lines)}{footer}</body></html>"
    )


def upsert_google_doc(
    service,
    title: str,
    markdown: str,
    folder_id: str,
    existing_file_id: str | None = None,
    add_footer: bool = True,
) -> dict:
    """Create or replace content in a Google Docs document using HTML import."""
    media = MediaInMemoryUpload(
        markdown_to_google_doc_html(title, markdown, add_footer=add_footer).encode("utf-8"),
        mimetype="text/html",
        resumable=False,
    )
    if existing_file_id:
        return service.files().update(
            fileId=existing_file_id,
            body={"name": title, "mimeType": "application/vnd.google-apps.document"},
            media_body=media,
            fields="id,webViewLink,mimeType,name",
        ).execute()
    return service.files().create(
        body={
            "name": title,
            "parents": [folder_id],
            "mimeType": "application/vnd.google-apps.document",
        },
        media_body=media,
        fields="id,webViewLink,mimeType,name",
    ).execute()


def _flatten_doc_tabs(tabs: list[dict]) -> list[dict]:
    result: list[dict] = []
    for tab in tabs or []:
        result.append(tab)
        result.extend(_flatten_doc_tabs(tab.get("childTabs", []) or []))
    return result


def _tab_id(tab: dict) -> str:
    return tab.get("tabProperties", {}).get("tabId", "")


def _tab_end_index(tab: dict) -> int:
    body = tab.get("documentTab", {}).get("body", {})
    content = body.get("content", []) or []
    if not content:
        return 1
    return int(content[-1].get("endIndex") or 1)


def _docs_rest_json(
    docs_service,
    path: str,
    method: str = "GET",
    query: dict[str, str] | None = None,
    body: dict | None = None,
) -> dict:
    """Call Docs REST directly when google-api-python-client discovery is stale."""
    http = getattr(docs_service, "_http", None)
    if http is None:
        raise RuntimeError("Google Docs service does not expose an authorized HTTP client")

    url = f"https://docs.googleapis.com/v1/{path.lstrip('/')}"
    if query:
        url = f"{url}?{urlencode(query)}"

    payload = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    resp, content = http.request(url, method=method, body=payload, headers=headers)
    resp_get = resp.get if hasattr(resp, "get") else lambda _key, default=None: default
    status = int(getattr(resp, "status", 0) or resp_get("status", 0) or 0)
    reason = str(getattr(resp, "reason", "") or resp_get("reason", ""))
    content_bytes = content if isinstance(content, bytes) else str(content or "").encode("utf-8")
    if status >= 400:
        raise GoogleDocsApiError(status, reason, content_bytes)
    if not content_bytes:
        return {}
    return json.loads(content_bytes.decode("utf-8"))


def _get_google_doc(docs_service, document_id: str, include_tabs: bool = True) -> dict:
    """Fetch a Google Doc with real tab content, bypassing stale discovery docs."""
    if include_tabs:
        try:
            return docs_service.documents().get(
                documentId=document_id,
                includeTabsContent=True,
            ).execute()
        except TypeError as exc:
            if "includeTabsContent" not in str(exc):
                raise
            logger.info(
                "Google Docs discovery lacks includeTabsContent; using raw REST tabs fetch",
                extra={"document_id": document_id},
            )
            return _docs_rest_json(
                docs_service,
                f"documents/{quote(document_id, safe='')}",
                query={"includeTabsContent": "true"},
            )
    return docs_service.documents().get(documentId=document_id).execute()


def _batch_update_google_doc(docs_service, document_id: str, requests: list[dict]) -> dict:
    """Apply Docs batchUpdate through raw REST so tab requests are supported."""
    return _docs_rest_json(
        docs_service,
        f"documents/{quote(document_id, safe='')}:batchUpdate",
        method="POST",
        body={"requests": requests},
    )


def _rgb(hex_color: str) -> dict:
    value = hex_color.lstrip("#")
    return {
        "red": int(value[0:2], 16) / 255,
        "green": int(value[2:4], 16) / 255,
        "blue": int(value[4:6], 16) / 255,
    }


def _append_text_style_request(
    requests: list[dict],
    *,
    start: int,
    end: int,
    tab_id: str | None = None,
    color: str = "#2563eb",
    bold: bool = False,
) -> None:
    if end <= start:
        return
    range_payload: dict = {"startIndex": start, "endIndex": end}
    if tab_id:
        range_payload["tabId"] = tab_id
    requests.append({
        "updateTextStyle": {
            "range": range_payload,
            "textStyle": {
                "foregroundColor": {"color": {"rgbColor": _rgb(color)}},
                "bold": bold,
            },
            "fields": "foregroundColor,bold",
        }
    })


def _special_sync_style_requests(text: str, *, tab_id: str | None = None, base_index: int = 1) -> list[dict]:
    """Style ResearchBuddy sync markers without changing exported plain text."""
    requests: list[dict] = []
    blue = "#2563eb"
    for marker in ("Synced by ResearchBuddy",):
        start = text.find(marker)
        while start >= 0:
            _append_text_style_request(
                requests,
                start=base_index + start,
                end=base_index + start + len(marker),
                tab_id=tab_id,
                color=blue,
                bold=False,
            )
            start = text.find(marker, start + len(marker))

    for match in re.finditer(r"\[image:[^\]]+\]|\[\[[^\]]+\]\]", text):
        _append_text_style_request(
            requests,
            start=base_index + match.start(),
            end=base_index + match.end(),
            tab_id=tab_id,
            color=blue,
            bold=True,
        )
    return requests


def _heading_style_requests(
    headings: list[tuple[int, int, str]],
    *,
    tab_id: str | None = None,
    base_index: int = 1,
) -> list[dict]:
    requests: list[dict] = []
    for start, end, style in headings:
        range_payload: dict = {"startIndex": base_index + start, "endIndex": base_index + max(end, start + 1)}
        if tab_id:
            range_payload["tabId"] = tab_id
        requests.append({
            "updateParagraphStyle": {
                "range": range_payload,
                "paragraphStyle": {"namedStyleType": style},
                "fields": "namedStyleType",
            }
        })
    return requests


def _google_plain_text_payload(markdown: str, add_footer: bool = False) -> tuple[str, list[tuple[int, int, str]]]:
    text = strip_sync_footer((markdown or "").strip())
    # Replace markdown images with a restorable placeholder — insertText can't embed images.
    text = _IMG_MD_RE.sub(markdown_image_placeholder, text)
    headings: list[tuple[int, int, str]] = []
    rendered_lines: list[str] = []
    cursor = 0
    for raw in text.splitlines():
        line = raw.rstrip()
        heading = re.match(r"^(#{1,6})\s+(.+)$", line)
        if heading:
            line = heading.group(2)
            headings.append((cursor, cursor + len(line), f"HEADING_{len(heading.group(1))}"))
        rendered_lines.append(line)
        cursor += len(line) + 1
    text = "\n".join(rendered_lines).strip()
    if add_footer:
        return (f"{text}{SYNC_FOOTER}\n" if text else f"{SYNC_FOOTER}\n"), headings
    return (f"{text}\n" if text else "\n"), headings


def _plain_tab_text(markdown: str, add_footer: bool = False) -> str:
    return _google_plain_text_payload(markdown, add_footer)[0]


def _tabs_as_sync_markdown(tabs: list[dict]) -> str:
    """Flatten tabs into ResearchBuddy tab markers for reliable round-trips."""
    from .document_tabs import serialize_tabs

    prepared: list[dict] = []
    last_idx = len(tabs) - 1
    for idx, tab in enumerate(tabs):
        content = strip_sync_footer((tab.get("content") or "").strip())
        content = _IMG_MD_RE.sub(markdown_image_placeholder, content)
        if idx == last_idx:
            content = f"{content}{SYNC_FOOTER}" if content else SYNC_FOOTER
        prepared.append({**tab, "content": content})
    return serialize_tabs(prepared, "Main")


def _fallback_upsert_google_doc_tabs(
    drive_service,
    title: str,
    normalized_tabs: list[dict],
    folder_id: str,
    existing_file_id: str | None,
) -> dict:
    return upsert_google_doc(
        drive_service,
        title,
        _tabs_as_sync_markdown(normalized_tabs),
        folder_id,
        existing_file_id=existing_file_id,
        add_footer=False,
    )


def upsert_google_doc_tabs(
    drive_service,
    docs_service,
    title: str,
    tabs: list[dict],
    folder_id: str,
    existing_file_id: str | None = None,
) -> dict:
    """Create/update a Google Doc whose content is split across document tabs."""
    from .document_tabs import normalize_tabs

    normalized = normalize_tabs(tabs, "Main")
    if existing_file_id:
        document_id = existing_file_id
        drive_service.files().update(
            fileId=document_id,
            body={"name": title},
            fields="id",
        ).execute()
    else:
        created = docs_service.documents().create(body={"title": title}).execute()
        document_id = created["documentId"]
        drive_service.files().update(
            fileId=document_id,
            addParents=folder_id,
            fields="id",
        ).execute()

    doc = _get_google_doc(docs_service, document_id, include_tabs=True)
    existing_tabs = _flatten_doc_tabs(doc.get("tabs") or [])
    has_tabs_feature = bool(existing_tabs)

    if has_tabs_feature:
        # ── Tabs-aware path ──────────────────────────────────────────────────
        try:
            setup_requests: list[dict] = []
            first_id = _tab_id(existing_tabs[0])
            setup_requests.append({
                "updateDocumentTabProperties": {
                    "tabProperties": {
                        "tabId": first_id,
                        "title": normalized[0]["title"],
                        "index": 0,
                    },
                    "fields": "title,index",
                }
            })
            for idx, tab in enumerate(normalized[1:], start=1):
                if idx < len(existing_tabs):
                    setup_requests.append({
                        "updateDocumentTabProperties": {
                            "tabProperties": {
                                "tabId": _tab_id(existing_tabs[idx]),
                                "title": tab["title"],
                                "index": idx,
                            },
                            "fields": "title,index",
                        }
                    })
                else:
                    setup_requests.append({
                        "addDocumentTab": {
                            "tabProperties": {
                                "title": tab["title"],
                                "index": idx,
                            }
                        }
            })
            if setup_requests:
                _batch_update_google_doc(docs_service, document_id, setup_requests)

            doc = _get_google_doc(docs_service, document_id, include_tabs=True)
            target_tabs = _flatten_doc_tabs(doc.get("tabs") or [])[:len(normalized)]

            content_requests: list[dict] = []
            last_idx = len(normalized) - 1
            for i, (tab_def, tab) in enumerate(zip(normalized, target_tabs)):
                tab_id = _tab_id(tab)
                end_index = _tab_end_index(tab)
                tab_text, heading_ranges = _google_plain_text_payload(tab_def["content"], add_footer=(i == last_idx))
                if end_index > 2:
                    content_requests.append({
                        "deleteContentRange": {
                            "range": {
                                "startIndex": 1,
                                "endIndex": end_index - 1,
                                "tabId": tab_id,
                            }
                        }
                    })
                content_requests.append({
                    "insertText": {
                        "text": tab_text,
                        "endOfSegmentLocation": {"tabId": tab_id},
                    }
                })
                content_requests.extend(_special_sync_style_requests(tab_text, tab_id=tab_id))
                content_requests.extend(_heading_style_requests(heading_ranges, tab_id=tab_id))
            if content_requests:
                _batch_update_google_doc(docs_service, document_id, content_requests)
        except Exception:
            logger.exception(
                "Google Docs tabs API sync failed; falling back to single-body tab markers",
                extra={"document_id": document_id},
            )
            return _fallback_upsert_google_doc_tabs(
                drive_service,
                title,
                normalized,
                folder_id,
                document_id,
            )

    else:
        # ── Fallback: no Tabs feature — write all content to main body ───────
        body_content = doc.get("body", {}).get("content", [])
        end_index = int(body_content[-1].get("endIndex", 1)) if body_content else 1
        body_requests: list[dict] = []
        if end_index > 2:
            body_requests.append({
                "deleteContentRange": {
                    "range": {"startIndex": 1, "endIndex": end_index - 1}
                }
            })
        body_text = _tabs_as_sync_markdown(normalized)
        body_requests.append({
            "insertText": {
                "text": body_text,
                "endOfSegmentLocation": {"segmentId": ""},
            }
        })
        body_requests.extend(_special_sync_style_requests(body_text))
        if body_requests:
            _batch_update_google_doc(docs_service, document_id, body_requests)

    file = drive_service.files().get(
        fileId=document_id,
        fields="id,webViewLink,mimeType,name",
    ).execute()
    return file


def export_google_doc_text(service, file_id: str) -> str:
    data = service.files().export(
        fileId=file_id,
        mimeType="text/plain",
    ).execute()
    if isinstance(data, bytes):
        return data.decode("utf-8")
    return str(data)


def _structural_elements_to_text(elements: list[dict]) -> str:
    chunks: list[str] = []
    for element in elements or []:
        paragraph = element.get("paragraph")
        if not paragraph:
            continue
        text = ""
        for run in paragraph.get("elements", []):
            text += run.get("textRun", {}).get("content", "")
        text = text.rstrip("\n")
        if text:
            named_style = paragraph.get("paragraphStyle", {}).get("namedStyleType", "")
            if named_style in _GOOGLE_HEADING_TO_MD:
                text = f"{_GOOGLE_HEADING_TO_MD[named_style]} {text}"
            chunks.append(text)
    return image_placeholder_to_markdown("\n\n".join(chunks).strip())


def export_google_doc_tabs_markdown(docs_service, file_id: str) -> tuple[str, list[str]]:
    from .document_tabs import serialize_tabs

    doc = _get_google_doc(docs_service, file_id, include_tabs=True)
    tabs = doc.get("tabs") or []
    if not tabs:
        body = doc.get("body", {})
        return _structural_elements_to_text(body.get("content", [])), []

    warnings: list[str] = []
    parsed_tabs: list[dict] = []

    def visit(tab: dict) -> None:
        props = tab.get("tabProperties", {})
        title = props.get("title") or "Untitled tab"
        body = tab.get("documentTab", {}).get("body", {})
        text = _structural_elements_to_text(body.get("content", []))
        parsed_tabs.append({
            "id": props.get("tabId") or "",
            "title": title,
            "content": text,
        })
        for child in tab.get("childTabs", []) or []:
            visit(child)

    for tab in tabs:
        visit(tab)
    warnings.append("Pulled Google Docs tabs into ResearchBuddy tab markers.")
    return serialize_tabs(parsed_tabs), warnings


def trash_file(service, file_id: str) -> None:
    if file_id:
        service.files().update(fileId=file_id, body={"trashed": True}).execute()
