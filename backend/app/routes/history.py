from __future__ import annotations

from typing import Annotated, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.history import HistoryEvent
from app.models.user import User
from app.schemas.history import HistoryEventRead
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("", response_model=List[HistoryEventRead])
def list_history(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    return (
        db.query(HistoryEvent)
        .filter(HistoryEvent.user_id == current_user.id)
        .order_by(HistoryEvent.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
