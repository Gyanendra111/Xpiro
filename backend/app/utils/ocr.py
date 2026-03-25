from __future__ import annotations

import base64
import io

from PIL import Image


def run_ocr(image_data: bytes | str) -> str:
    """Run pytesseract OCR on raw bytes or a base64-encoded string.

    Returns the extracted text, or an empty string if pytesseract is not
    available or the tesseract binary is not installed.
    """
    try:
        import pytesseract
    except ImportError:
        return ""

    if isinstance(image_data, str):
        # Strip optional data-URL prefix
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]
        image_data = base64.b64decode(image_data)

    img = Image.open(io.BytesIO(image_data))
    try:
        return pytesseract.image_to_string(img)
    except pytesseract.TesseractNotFoundError:
        return ""
