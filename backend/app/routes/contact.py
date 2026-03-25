from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.config import get_settings
from app.utils.email import send_email

router = APIRouter(prefix="/api/contact", tags=["contact"])
settings = get_settings()


class ContactRequest(BaseModel):
    name: str
    email: EmailStr
    subject: str = "Message from Xpiro contact form"
    message: str


@router.post("", status_code=status.HTTP_200_OK)
def contact(payload: ContactRequest):
    # Send to the configured support/admin address; fall back to SMTP sender
    recipient = settings.contact_email or settings.smtp_user
    if not recipient:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email service is not configured",
        )

    body = "\n".join([
        f"From: {payload.name} <{payload.email}>",
        "",
        payload.message,
    ])
    sent = send_email(
        to=recipient,
        subject=payload.subject,
        body=body,
    )
    if not sent:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to send email",
        )
    return {"ok": True}
