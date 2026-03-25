from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    first_name: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    last_name: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    email: Mapped[str] = mapped_column(String(256), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(256), nullable=False)

    # Preferences
    default_reminder: Mapped[str] = mapped_column(String(16), nullable=False, default="app")
    dark_mode: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notifications: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    email_alerts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ai_auto_categorize: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    items: Mapped[list["Item"]] = relationship("Item", back_populates="owner", cascade="all, delete-orphan")
    history: Mapped[list["HistoryEvent"]] = relationship("HistoryEvent", back_populates="owner", cascade="all, delete-orphan")
