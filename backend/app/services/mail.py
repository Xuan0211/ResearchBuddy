import imaplib
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from html import escape
from typing import Iterable

from ..core.config import settings


def _configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_username and settings.smtp_password)


def send_email(
    *,
    to: str | Iterable[str],
    subject: str,
    text: str,
    html: str | None = None,
) -> bool:
    """Send one email. Returns False when mail is not configured or SMTP fails."""
    if not _configured():
        print("[mail] SMTP is not configured; skipping email")
        return False

    recipients = [to] if isinstance(to, str) else list(to)
    if not recipients:
        return False

    sender_email = settings.smtp_from_email or settings.smtp_username
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((settings.smtp_from_name, sender_email))
    msg["To"] = ", ".join(recipients)
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")

    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
                smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
                smtp.starttls()
                smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(msg)
        return True
    except Exception as exc:
        print(f"[mail] send failed: {exc}")
        return False


def fetch_recent_inbox(limit: int = 10) -> list[dict]:
    """Basic IMAP receive helper for future inbox features."""
    if not (settings.imap_host and settings.smtp_username and settings.smtp_password):
        return []

    messages: list[dict] = []
    try:
        with imaplib.IMAP4_SSL(settings.imap_host, settings.imap_port) as imap:
            imap.login(settings.smtp_username, settings.smtp_password)
            imap.select("INBOX", readonly=True)
            status, data = imap.search(None, "ALL")
            if status != "OK" or not data or not data[0]:
                return []
            ids = data[0].split()[-limit:]
            for msg_id in reversed(ids):
                status, payload = imap.fetch(msg_id, "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])")
                if status == "OK" and payload and isinstance(payload[0], tuple):
                    raw = payload[0][1].decode("utf-8", errors="replace")
                    messages.append({"id": msg_id.decode(), "headers": raw})
    except Exception as exc:
        print(f"[mail] imap fetch failed: {exc}")
    return messages


def invite_email_html(project_name: str, inviter: str, role: str, action_url: str, registered: bool) -> str:
    action = "Open project" if registered else "Create account"
    hint = (
        "Sign in with this email address to open the project."
        if registered
        else "Create an account with this email address; ResearchBuddy will add the project automatically."
    )
    return f"""
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
      <h2 style="margin:0 0 12px">ResearchBuddy project invitation</h2>
      <p>{escape(inviter)} invited you to <strong>{escape(project_name)}</strong> as <strong>{escape(role)}</strong>.</p>
      <p>{escape(hint)}</p>
      <p><a href="{escape(action_url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px">{action}</a></p>
      <p style="color:#666;font-size:13px">If the button does not work, paste this link into your browser:<br>{escape(action_url)}</p>
    </div>
    """
