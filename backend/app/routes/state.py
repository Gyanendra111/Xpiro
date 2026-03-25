"""Legacy /api/state compatibility endpoint.

The original Node.js backend stored all data in a single JSON blob. This endpoint
re-constructs the same structure from the normalized database tables so that the
existing frontend continues to work without changes.
"""
from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.history import HistoryEvent
from app.models.item import Item
from app.models.user import User
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/state", tags=["state"])

WARN_DAYS = {
    "medicine": 7, "grocery": 2, "dairy": 1, "snacks": 3,
    "beverage": 3, "cosmetic": 14, "cleaning": 7, "other": 5,
}


def _item_to_dict(item: Item) -> dict:
    today = date.today()
    days = (item.expiry - today).days
    warn = WARN_DAYS.get(item.category, 5)
    status = "expired" if days < 0 else ("soon" if days <= warn else "ok")
    return {
        "id": str(item.id),
        "name": item.name,
        "category": item.category,
        "expiry": item.expiry.isoformat(),
        "brand": item.brand,
        "notes": item.notes,
        "reminder": item.reminder,
        "addedAt": item.created_at.isoformat(),
        "status": status,
    }


@router.get("")
def get_state(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    items = db.query(Item).filter(Item.user_id == current_user.id).all()
    history = (
        db.query(HistoryEvent)
        .filter(HistoryEvent.user_id == current_user.id)
        .order_by(HistoryEvent.created_at.desc())
        .limit(100)
        .all()
    )

    state = {
        "items": [_item_to_dict(i) for i in items],
        "history": [
            {"type": h.event_type, "message": h.message, "ts": int(h.created_at.timestamp() * 1000)}
            for h in history
        ],
        "alertedIds": [],
        "emailedAlerts": [],
        "profile": {
            "firstName": current_user.first_name,
            "lastName": current_user.last_name,
            "email": current_user.email,
            "reminder": current_user.default_reminder,
        },
        "settings": {
            "dark": current_user.dark_mode,
            "notifications": current_user.notifications,
            "email": current_user.email_alerts,
            "ai": current_user.ai_auto_categorize,
        },
        "nextId": (max((i.id for i in items), default=0) + 1),
    }
    return {"state": state, "updatedAt": None}


@router.put("")
def put_state(
    payload: dict,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Accept the full state blob from the legacy frontend and persist relevant fields."""
    incoming = payload.get("state", payload)

    # Update profile / settings
    profile = incoming.get("profile", {})
    settings = incoming.get("settings", {})

    for attr, val in [
        ("first_name", profile.get("firstName")),
        ("last_name", profile.get("lastName")),
        ("default_reminder", profile.get("reminder")),
        ("dark_mode", settings.get("dark")),
        ("notifications", settings.get("notifications")),
        ("email_alerts", settings.get("email")),
        ("ai_auto_categorize", settings.get("ai")),
    ]:
        if val is not None:
            setattr(current_user, attr, val)

    db.commit()
    return {"ok": True}
