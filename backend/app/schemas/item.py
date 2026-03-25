from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class ItemCreate(BaseModel):
    name: str = Field(..., max_length=256)
    category: str = Field("other", max_length=64)
    expiry: date
    brand: str = Field("", max_length=256)
    notes: str = Field("")
    reminder: str = Field("app", max_length=16)


class ItemUpdate(BaseModel):
    name: str | None = Field(None, max_length=256)
    category: str | None = Field(None, max_length=64)
    expiry: date | None = None
    brand: str | None = Field(None, max_length=256)
    notes: str | None = None
    reminder: str | None = Field(None, max_length=16)


class ItemRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    user_id: int
    name: str
    category: str
    expiry: date
    brand: str
    notes: str
    reminder: str
    created_at: datetime
    updated_at: datetime
