from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    first_name: str = Field("", max_length=64)
    last_name: str = Field("", max_length=64)
    email: EmailStr
    password: str = Field(..., min_length=8)


class UserUpdate(BaseModel):
    first_name: str | None = Field(None, max_length=64)
    last_name: str | None = Field(None, max_length=64)
    email: EmailStr | None = None
    default_reminder: str | None = None
    dark_mode: bool | None = None
    notifications: bool | None = None
    email_alerts: bool | None = None
    ai_auto_categorize: bool | None = None


class UserRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    first_name: str
    last_name: str
    email: str
    default_reminder: str
    dark_mode: bool
    notifications: bool
    email_alerts: bool
    ai_auto_categorize: bool
    is_admin: bool
    is_active: bool
    created_at: datetime
