from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.history import HistoryEvent
from app.models.item import Item
from app.models.reminder import ReminderAlert
from app.models.user import User
from app.utils.auth import get_current_user
from app.utils.email import send_email

router = APIRouter(prefix="/api/reminders", tags=["reminders"])

WARN_DAYS = {
    "medicine": 7, "grocery": 2, "dairy": 1, "snacks": 3,
    "beverage": 3, "cosmetic": 14, "cleaning": 7, "other": 5,
}


def _item_status(item: Item) -> str:
    days = (item.expiry - date.today()).days
    warn = WARN_DAYS.get(item.category, 5)
    if days < 0:
        return "expired"
    if days <= warn:
        return "soon"
    return "ok"


def process_reminders_for_user(user: User, db: Session) -> int:
    """Send pending email reminders for *user*. Returns the count of emails sent."""
    if not user.email_alerts or not user.email:
        return 0

    today = date.today()
    sent_count = 0

    items = (
        db.query(Item)
        .filter(Item.user_id == user.id, Item.reminder.in_(["email", "both"]))
        .all()
    )

    for item in items:
        item_status = _item_status(item)
        if item_status not in ("expired", "soon"):
            continue

        already_sent = (
            db.query(ReminderAlert)
            .filter(
                ReminderAlert.item_id == item.id,
                ReminderAlert.status == item_status,
                ReminderAlert.alert_date == today,
            )
            .first()
        )
        if already_sent:
            continue

        days = (item.expiry - today).days
        if item_status == "expired":
            subject = f"Xpiro Alert: {item.name} expired"
            body_line = f"{item.name} has expired."
        else:
            subject = f"Xpiro Alert: {item.name} expiring soon"
            body_line = f"{item.name} expires in {days} day(s)."

        body = "\n".join([
            "Xpiro Reminder",
            "",
            body_line,
            f"Item: {item.name}",
            f"Category: {item.category}",
            f"Expiry: {item.expiry.strftime('%d %b %Y')}",
            "",
            "Open Xpiro to review your inventory.",
        ])

        sent = send_email(user.email, subject, body)
        if not sent:
            break

        db.add(ReminderAlert(item_id=item.id, status=item_status, alert_date=today))
        db.add(HistoryEvent(
            user_id=user.id,
            event_type="remind",
            message=f'Email reminder sent for "{item.name}" ({item_status})',
        ))
        sent_count += 1

    if sent_count:
        db.commit()

    return sent_count


@router.post("/check")
def check_reminders(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    sent = process_reminders_for_user(current_user, db)
    return {"ok": True, "sent": sent}
