from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.utils.ocr import run_ocr

router = APIRouter(tags=["scan"])


class ScanRequest(BaseModel):
    image: str  # base64-encoded image (may include data-URL prefix)


class ScanResponse(BaseModel):
    text: str


@router.post("/scan", response_model=ScanResponse)
def scan_image(payload: ScanRequest):
    if not payload.image:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image is required")

    text = run_ocr(payload.image)
    return ScanResponse(text=text)
