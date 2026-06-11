from html import escape
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..core.config import settings
from ..core.db import get_session
from ..core.security import get_current_user
from ..models import FeedbackPost, FeedbackVote, User, utcnow
from ..services.mail import send_email

router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackIn(BaseModel):
    title: str = ""
    body: str


def _post_payload(session: Session, post: FeedbackPost, current_user: User) -> dict:
    author = session.get(User, post.user_id)
    votes = session.exec(select(FeedbackVote).where(FeedbackVote.post_id == post.id)).all()
    return {
        "id": str(post.id),
        "title": post.title,
        "body": post.body,
        "created_at": post.created_at,
        "updated_at": post.updated_at,
        "author_name": author.name if author else "Unknown user",
        "author_email": author.email if author else "",
        "votes": len(votes),
        "voted_by_me": any(str(v.user_id) == str(current_user.id) for v in votes),
    }


@router.get("")
def list_feedback(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    posts = session.exec(select(FeedbackPost)).all()
    payload = [_post_payload(session, post, current_user) for post in posts]
    payload.sort(key=lambda item: (item["votes"], item["created_at"]), reverse=True)
    return payload


@router.post("", status_code=201)
def create_feedback(
    body: FeedbackIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    text = body.body.strip()
    title = body.title.strip()
    if not text:
        raise HTTPException(400, "Feedback cannot be empty")
    if len(title) > 120:
        raise HTTPException(400, "Title must be 120 characters or fewer")
    if len(text) > 4000:
        raise HTTPException(400, "Feedback must be 4000 characters or fewer")

    post = FeedbackPost(user_id=current_user.id, title=title, body=text)
    session.add(post)
    session.commit()
    session.refresh(post)

    notification_sent = False
    if settings.feedback_notification_email:
        title_line = title or text[:80]
        notification_sent = send_email(
            to=settings.feedback_notification_email,
            subject=f"New ResearchBuddy feedback: {title_line}",
            text=(
                f"{current_user.name} <{current_user.email}> posted new feedback.\n\n"
                f"Title: {title or '(none)'}\n\n{text}\n"
            ),
            html=(
                "<div style='font-family:Arial,sans-serif;color:#111;line-height:1.5'>"
                "<h2 style='margin:0 0 12px'>New ResearchBuddy feedback</h2>"
                f"<p><strong>From:</strong> {escape(current_user.name)} &lt;{escape(current_user.email)}&gt;</p>"
                f"<p><strong>Title:</strong> {escape(title or '(none)')}</p>"
                f"<pre style='white-space:pre-wrap;background:#f6f6f6;padding:12px;border-radius:8px'>{escape(text)}</pre>"
                "</div>"
            ),
        )

    payload = _post_payload(session, post, current_user)
    payload["notification_sent"] = notification_sent
    return payload


@router.post("/{post_id}/vote")
def toggle_feedback_vote(
    post_id: UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = session.get(FeedbackPost, post_id)
    if not post:
        raise HTTPException(404, "Feedback not found")
    vote = session.exec(
        select(FeedbackVote).where(
            FeedbackVote.post_id == post_id,
            FeedbackVote.user_id == current_user.id,
        )
    ).first()
    if vote:
        session.delete(vote)
    else:
        session.add(FeedbackVote(post_id=post_id, user_id=current_user.id))
    post.updated_at = utcnow()
    session.add(post)
    session.commit()
    session.refresh(post)
    return _post_payload(session, post, current_user)
