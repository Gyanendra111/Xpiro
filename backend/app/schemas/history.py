from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class HistoryEventRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    user_id: int
    event_type: str
    message: str
    created_at: datetime
