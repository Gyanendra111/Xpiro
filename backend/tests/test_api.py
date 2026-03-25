"""Basic smoke-tests for the Xpiro FastAPI backend."""
from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Use an in-memory SQLite database for tests
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_xpiro.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest")

from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402

TEST_DB_URL = "sqlite:///./test_xpiro.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True


# ---------------------------------------------------------------------------
# Auth – register / login / me
# ---------------------------------------------------------------------------

REGISTER_PAYLOAD = {
    "first_name": "Test",
    "last_name": "User",
    "email": "test@example.com",
    "password": "securepassword",
}


def _register_and_login() -> str:
    """Helper: register (idempotent) + login, return bearer token."""
    client.post("/api/auth/register", json=REGISTER_PAYLOAD)
    r = client.post(
        "/api/auth/login",
        data={"username": REGISTER_PAYLOAD["email"], "password": REGISTER_PAYLOAD["password"]},
    )
    assert r.status_code == 200
    return r.json()["access_token"]


def test_register():
    r = client.post("/api/auth/register", json={
        "email": "new@example.com",
        "password": "password123",
    })
    assert r.status_code in (201, 409)


def test_login_and_me():
    token = _register_and_login()
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == REGISTER_PAYLOAD["email"]


def test_login_wrong_password():
    _register_and_login()
    r = client.post(
        "/api/auth/login",
        data={"username": REGISTER_PAYLOAD["email"], "password": "wrongpassword"},
    )
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Items – CRUD
# ---------------------------------------------------------------------------

def _auth_headers() -> dict:
    return {"Authorization": f"Bearer {_register_and_login()}"}


def test_create_and_list_items():
    headers = _auth_headers()
    payload = {"name": "Milk", "category": "dairy", "expiry": "2030-12-31", "brand": "Amul", "reminder": "app"}
    r = client.post("/api/items", json=payload, headers=headers)
    assert r.status_code == 201
    item_id = r.json()["id"]

    r = client.get("/api/items", headers=headers)
    assert r.status_code == 200
    names = [i["name"] for i in r.json()]
    assert "Milk" in names

    # Get single
    r = client.get(f"/api/items/{item_id}", headers=headers)
    assert r.status_code == 200
    assert r.json()["name"] == "Milk"

    # Update
    r = client.put(f"/api/items/{item_id}", json={"brand": "Mother Dairy"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["brand"] == "Mother Dairy"

    # Delete
    r = client.delete(f"/api/items/{item_id}", headers=headers)
    assert r.status_code == 204


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

def test_history():
    headers = _auth_headers()
    # Create an item to generate a history event
    client.post("/api/items", json={"name": "Bread", "category": "grocery", "expiry": "2030-01-01"}, headers=headers)
    r = client.get("/api/history", headers=headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------------------------------------------------------------------------
# Legacy /api/state
# ---------------------------------------------------------------------------

def test_state_get_put():
    headers = _auth_headers()
    r = client.get("/api/state", headers=headers)
    assert r.status_code == 200
    assert "state" in r.json()

    r = client.put("/api/state", json={"state": {"profile": {"firstName": "Updated"}}}, headers=headers)
    assert r.status_code == 200
    assert r.json()["ok"] is True


# ---------------------------------------------------------------------------
# Scan (no Tesseract binary in CI – just verify endpoint exists)
# ---------------------------------------------------------------------------

def test_scan_missing_image():
    r = client.post("/scan", json={})
    assert r.status_code == 422  # Pydantic validation error


def test_scan_with_image():
    import base64
    import io
    from PIL import Image
    img = Image.new("RGB", (50, 50), color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    r = client.post("/scan", json={"image": b64})
    # Either 200 (OCR succeeded) or 200 with empty text (no tesseract binary)
    assert r.status_code == 200
    assert "text" in r.json()


# ---------------------------------------------------------------------------
# Reminders (no SMTP configured – should return sent=0)
# ---------------------------------------------------------------------------

def test_reminders_check():
    headers = _auth_headers()
    r = client.post("/api/reminders/check", headers=headers)
    assert r.status_code == 200
    assert r.json()["ok"] is True


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

def teardown_module(_module):
    import os
    try:
        os.remove("test_xpiro.db")
    except FileNotFoundError:
        pass
