"""Codebook API — qualitative research coding module."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import Session

from ..core.db import get_session
from ..core.security import get_current_user
from ..models import User
from .projects import check_member
from ..services import codebook_service as cs

router = APIRouter(prefix="/projects/{project_id}/codebooks", tags=["codebooks"])


# ── Input models ──────────────────────────────────────────────────────────────

class CodebookIn(BaseModel):
    title: str
    description: str = ""


class CodebookPatch(BaseModel):
    title: str | None = None
    description: str | None = None


class PapersIn(BaseModel):
    paper_ids: list[str]


class CriteriaIn(BaseModel):
    criteria: list[dict]


class ScreeningIn(BaseModel):
    decisions: dict  # {criterion_id: "pass"|"fail"|"pending"}


class AssignmentIn(BaseModel):
    assignee: str


class CodeIn(BaseModel):
    label: str
    parent_id: str | None = None
    description: str = ""
    color: str = "#6366f1"
    fields: dict = {}


class CodePatch(BaseModel):
    label: str | None = None
    parent_id: str | None = None
    description: str | None = None
    color: str | None = None
    fields: dict | None = None
    order: int | None = None


class ExcerptIn(BaseModel):
    paper_id: str
    code_id: str
    text: str = ""
    note: str = ""
    coder: str = ""
    image: str = ""
    images: list[str] = []   # base64 data-URLs or server URLs


class ExcerptPatch(BaseModel):
    text: str | None = None
    note: str | None = None
    coder: str | None = None
    image: str | None = None
    images: list[str] | None = None
    code_id: str | None = None


# ── Codebook CRUD ─────────────────────────────────────────────────────────────

@router.get("")
def list_codebooks(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    return cs.list_codebooks(project_id)


@router.post("", status_code=201)
def create_codebook(
    project_id: str,
    body: CodebookIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    return cs.create_codebook(project_id, body.title, body.description)


@router.get("/{cb_id}")
def get_codebook(
    project_id: str,
    cb_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    cb = cs.get_codebook(project_id, cb_id)
    if not cb:
        raise HTTPException(404)
    return cb


@router.patch("/{cb_id}")
def update_codebook(
    project_id: str,
    cb_id: str,
    body: CodebookPatch,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return cs.update_codebook_meta(project_id, cb_id, body.model_dump(exclude_none=True))
    except FileNotFoundError:
        raise HTTPException(404)


@router.delete("/{cb_id}", status_code=204)
def delete_codebook(
    project_id: str,
    cb_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    cs.delete_codebook(project_id, cb_id)


# ── Papers ────────────────────────────────────────────────────────────────────

@router.post("/{cb_id}/papers")
def add_papers(
    project_id: str,
    cb_id: str,
    body: PapersIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return cs.add_papers(project_id, cb_id, body.paper_ids)
    except FileNotFoundError:
        raise HTTPException(404)


@router.delete("/{cb_id}/papers/{paper_id}", status_code=204)
def remove_paper(
    project_id: str,
    cb_id: str,
    paper_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        cs.remove_paper(project_id, cb_id, paper_id)
    except FileNotFoundError:
        raise HTTPException(404)


# ── Criteria & Screening ──────────────────────────────────────────────────────

@router.put("/{cb_id}/criteria")
def set_criteria(
    project_id: str,
    cb_id: str,
    body: CriteriaIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return cs.set_criteria(project_id, cb_id, body.criteria)
    except FileNotFoundError:
        raise HTTPException(404)


@router.patch("/{cb_id}/screening/{paper_id}")
def update_screening(
    project_id: str,
    cb_id: str,
    paper_id: str,
    body: ScreeningIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return cs.update_screening(project_id, cb_id, paper_id, body.decisions)
    except FileNotFoundError:
        raise HTTPException(404)


@router.patch("/{cb_id}/assignments/{paper_id}")
def update_assignment(
    project_id: str,
    cb_id: str,
    paper_id: str,
    body: AssignmentIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        cs.update_assignment(project_id, cb_id, paper_id, body.assignee)
        return {"ok": True}
    except FileNotFoundError:
        raise HTTPException(404)


# ── Codes ─────────────────────────────────────────────────────────────────────

@router.post("/{cb_id}/codes", status_code=201)
def create_code(
    project_id: str,
    cb_id: str,
    body: CodeIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    return cs.create_code(project_id, cb_id, body.label,
                           parent_id=body.parent_id,
                           description=body.description,
                           color=body.color,
                           fields=body.fields)


@router.patch("/{cb_id}/codes/{code_id}")
def update_code(
    project_id: str,
    cb_id: str,
    code_id: str,
    body: CodePatch,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    return cs.update_code(project_id, cb_id, code_id, body.model_dump(exclude_none=True))


@router.delete("/{cb_id}/codes/{code_id}", status_code=204)
def delete_code(
    project_id: str,
    cb_id: str,
    code_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    cs.delete_code(project_id, cb_id, code_id)


# ── Excerpts ──────────────────────────────────────────────────────────────────

@router.post("/{cb_id}/excerpts", status_code=201)
def add_excerpt(
    project_id: str,
    cb_id: str,
    body: ExcerptIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    exc = cs.add_excerpt(project_id, cb_id, body.paper_id, body.code_id,
                          body.text, body.note, body.coder, body.image)
    if body.images:
        exc = cs.update_excerpt(project_id, cb_id, exc["id"], {"images": body.images})
    return exc


@router.patch("/{cb_id}/excerpts/{exc_id}")
def update_excerpt(
    project_id: str,
    cb_id: str,
    exc_id: str,
    body: ExcerptPatch,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    return cs.update_excerpt(project_id, cb_id, exc_id, body.model_dump(exclude_none=True))


@router.delete("/{cb_id}/excerpts/{exc_id}", status_code=204)
def delete_excerpt(
    project_id: str,
    cb_id: str,
    exc_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    cs.delete_excerpt(project_id, cb_id, exc_id)


# ── Export ────────────────────────────────────────────────────────────────────

@router.get("/{cb_id}/export/csv")
def export_csv(
    project_id: str,
    cb_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    csv_content = cs.export_csv(project_id, cb_id)
    cb = cs.get_codebook(project_id, cb_id)
    filename = f"{cb.get('title', cb_id)}.csv" if cb else f"{cb_id}.csv"
    return Response(
        content=csv_content.encode("utf-8"),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── AI-readable snapshot ──────────────────────────────────────────────────────

@router.get("/{cb_id}/snapshot")
def get_snapshot(
    project_id: str,
    cb_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Full codebook data as structured JSON — for AI agent context."""
    check_member(project_id, current_user, session)
    cb = cs.get_codebook(project_id, cb_id)
    if not cb:
        raise HTTPException(404)
    return cb


# ── Stages ────────────────────────────────────────────────────────────────────

class StagesIn(BaseModel):
    stages: list[dict]


class StageDecisionIn(BaseModel):
    decisions: dict  # {criterion_id: value}


class StageOverrideIn(BaseModel):
    stage: str  # "stage1_id" | "coding" | "excluded"


@router.put("/{cb_id}/stages")
def set_stages(
    project_id: str, cb_id: str, body: StagesIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return cs.set_stages(project_id, cb_id, body.stages)
    except FileNotFoundError:
        raise HTTPException(404)


@router.patch("/{cb_id}/stage-screening/{paper_id}/{stage_id}")
def update_stage_screening(
    project_id: str, cb_id: str, paper_id: str, stage_id: str, body: StageDecisionIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return cs.update_stage_screening(project_id, cb_id, paper_id, stage_id, body.decisions)
    except FileNotFoundError:
        raise HTTPException(404)


@router.patch("/{cb_id}/stage-override/{paper_id}")
def stage_override(
    project_id: str, cb_id: str, paper_id: str, body: StageOverrideIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return cs.set_paper_stage_override(project_id, cb_id, paper_id, body.stage)
    except FileNotFoundError:
        raise HTTPException(404)


# ── Transcripts ────────────────────────────────────────────────────────────────

class TranscriptIn(BaseModel):
    title: str
    content: str
    source: str = "interview"


class TranscriptPatch(BaseModel):
    title: str | None = None
    content: str | None = None
    source: str | None = None


class SegmentIn(BaseModel):
    code_id: str
    start: int
    end: int
    text: str
    note: str = ""
    coder: str = ""


class SegmentPatch(BaseModel):
    code_id: str | None = None
    note: str | None = None
    coder: str | None = None


@router.get("/{cb_id}/transcripts")
def list_transcripts(
    project_id: str, cb_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    return cs.list_transcripts(project_id, cb_id)


@router.post("/{cb_id}/transcripts", status_code=201)
def create_transcript(
    project_id: str, cb_id: str, body: TranscriptIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    return cs.create_transcript(project_id, cb_id, body.title, body.content, body.source)


@router.get("/{cb_id}/transcripts/{t_id}")
def get_transcript(
    project_id: str, cb_id: str, t_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session)
    t = cs.get_transcript(project_id, cb_id, t_id)
    if not t:
        raise HTTPException(404)
    return t


@router.patch("/{cb_id}/transcripts/{t_id}")
def update_transcript(
    project_id: str, cb_id: str, t_id: str, body: TranscriptPatch,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return cs.update_transcript(project_id, cb_id, t_id, body.model_dump(exclude_none=True))
    except FileNotFoundError:
        raise HTTPException(404)


@router.delete("/{cb_id}/transcripts/{t_id}", status_code=204)
def delete_transcript(
    project_id: str, cb_id: str, t_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    cs.delete_transcript(project_id, cb_id, t_id)


@router.post("/{cb_id}/transcripts/{t_id}/segments", status_code=201)
def add_segment(
    project_id: str, cb_id: str, t_id: str, body: SegmentIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return cs.add_segment(project_id, cb_id, t_id, body.code_id, body.start, body.end,
                               body.text, body.note, body.coder)
    except FileNotFoundError:
        raise HTTPException(404)


@router.patch("/{cb_id}/transcripts/{t_id}/segments/{seg_id}")
def update_segment(
    project_id: str, cb_id: str, t_id: str, seg_id: str, body: SegmentPatch,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        return cs.update_segment(project_id, cb_id, t_id, seg_id, body.model_dump(exclude_none=True))
    except FileNotFoundError:
        raise HTTPException(404)


@router.delete("/{cb_id}/transcripts/{t_id}/segments/{seg_id}", status_code=204)
def delete_segment(
    project_id: str, cb_id: str, t_id: str, seg_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    check_member(project_id, current_user, session, min_role="member")
    try:
        cs.delete_segment(project_id, cb_id, t_id, seg_id)
    except FileNotFoundError:
        raise HTTPException(404)
