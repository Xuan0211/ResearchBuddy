"""Dev team roadmap board — bug tracker + feature requests with priority and status."""
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..core.db import get_session
from ..core.security import get_current_user
from ..models import RoadmapItem, User, utcnow

router = APIRouter(prefix="/roadmap", tags=["roadmap"])

ItemType = Literal["bug", "feature"]
ItemPriority = Literal["P0", "P1", "P2"]
ItemStatus = Literal["todo", "in-progress", "scheduled", "rejected", "long-term", "done"]


def _item_payload(item: RoadmapItem) -> dict:
    return {
        "id": str(item.id),
        "type": item.type,
        "priority": item.priority,
        "status": item.status,
        "title": item.title,
        "description": item.description,
        "order": item.order,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


class RoadmapItemIn(BaseModel):
    type: ItemType = "feature"
    priority: ItemPriority = "P1"
    status: ItemStatus = "todo"
    title: str
    description: str = ""
    order: int = 0


class RoadmapItemPatch(BaseModel):
    type: ItemType | None = None
    priority: ItemPriority | None = None
    status: ItemStatus | None = None
    title: str | None = None
    description: str | None = None
    order: int | None = None


@router.get("")
def list_roadmap(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    items = session.exec(select(RoadmapItem)).all()
    items = sorted(items, key=lambda i: (
        {"P0": 0, "P1": 1, "P2": 2}.get(i.priority, 9),
        i.order,
        i.created_at,
    ))
    return [_item_payload(i) for i in items]


@router.post("", status_code=201)
def create_roadmap_item(
    body: RoadmapItemIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "Title cannot be empty")
    item = RoadmapItem(
        type=body.type,
        priority=body.priority,
        status=body.status,
        title=title,
        description=body.description.strip(),
        order=body.order,
        created_by=current_user.id,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return _item_payload(item)


@router.patch("/{item_id}")
def update_roadmap_item(
    item_id: UUID,
    body: RoadmapItemPatch,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    item = session.get(RoadmapItem, item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    if body.type is not None:
        item.type = body.type
    if body.priority is not None:
        item.priority = body.priority
    if body.status is not None:
        item.status = body.status
    if body.title is not None:
        item.title = body.title.strip()
    if body.description is not None:
        item.description = body.description.strip()
    if body.order is not None:
        item.order = body.order
    item.updated_at = utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)
    return _item_payload(item)


@router.delete("/{item_id}", status_code=204)
def delete_roadmap_item(
    item_id: UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    item = session.get(RoadmapItem, item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    session.delete(item)
    session.commit()
