from __future__ import annotations

from datetime import date
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import asc, desc
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.history import HistoryEvent
from app.models.item import Item
from app.models.user import User
from app.schemas.item import ItemCreate, ItemRead, ItemUpdate
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/items", tags=["items"])

SORT_MAP = {
    "expiry": Item.expiry,
    "name": Item.name,
    "created_at": Item.created_at,
}


def _log(db: Session, user_id: int, event_type: str, message: str):
    db.add(HistoryEvent(user_id=user_id, event_type=event_type, message=message))


@router.get("", response_model=List[ItemRead])
def list_items(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    search: Optional[str] = Query(None, description="Search by name or brand"),
    category: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    sort_by: str = Query("expiry", enum=["expiry", "name", "created_at"]),
    order: str = Query("asc", enum=["asc", "desc"]),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    q = db.query(Item).filter(Item.user_id == current_user.id)

    if search:
        term = f"%{search}%"
        q = q.filter((Item.name.ilike(term)) | (Item.brand.ilike(term)))
    if category:
        q = q.filter(Item.category == category)

    col = SORT_MAP.get(sort_by, Item.expiry)
    q = q.order_by(asc(col) if order == "asc" else desc(col))
    items = q.offset(skip).limit(limit).all()

    if status_filter:
        today = date.today()
        WARN_DAYS = {"medicine": 7, "grocery": 2, "dairy": 1, "snacks": 3,
                     "beverage": 3, "cosmetic": 14, "cleaning": 7, "other": 5}
        def _status(item: Item) -> str:
            days = (item.expiry - today).days
            if days < 0:
                return "expired"
            warn = WARN_DAYS.get(item.category, 5)
            return "soon" if days <= warn else "ok"

        items = [i for i in items if _status(i) == status_filter]

    return items


@router.post("", response_model=ItemRead, status_code=status.HTTP_201_CREATED)
def create_item(
    payload: ItemCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    item = Item(**payload.model_dump(), user_id=current_user.id)
    db.add(item)
    db.flush()
    _log(db, current_user.id, "add", f'Added item "{item.name}"')
    db.commit()
    db.refresh(item)
    return item


@router.get("/{item_id}", response_model=ItemRead)
def get_item(
    item_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    item = db.query(Item).filter(Item.id == item_id, Item.user_id == current_user.id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return item


@router.put("/{item_id}", response_model=ItemRead)
def update_item(
    item_id: int,
    payload: ItemUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    item = db.query(Item).filter(Item.id == item_id, Item.user_id == current_user.id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(item, field, value)

    _log(db, current_user.id, "edit", f'Updated item "{item.name}"')
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    item = db.query(Item).filter(Item.id == item_id, Item.user_id == current_user.id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    name = item.name
    db.delete(item)
    _log(db, current_user.id, "delete", f'Deleted item "{name}"')
    db.commit()
