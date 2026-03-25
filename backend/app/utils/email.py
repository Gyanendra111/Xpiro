from __future__ import annotations

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import get_settings

settings = get_settings()


def send_email(to: str, subject: str, body: str) -> bool:
    """Send a plain-text email via SMTP.  Returns True on success, False if SMTP is not configured."""
    if not settings.smtp_host or not settings.smtp_user or not settings.smtp_pass:
        return False

    from_addr = settings.email_from or settings.smtp_user

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to
    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_pass)
            server.sendmail(from_addr, to, msg.as_string())
        return True
    except Exception:
        return False
