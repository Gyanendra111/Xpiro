from __future__ import annotations

from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import Base, SessionLocal, engine
from app.routes import auth, items, history, state, scan, reminders, admin, contact

settings = get_settings()

# Create all tables on startup (Alembic handles migrations in production)
Base.metadata.create_all(bind=engine)


def _run_scheduled_reminders():
    """Background job: send email reminders for all users who have email_alerts enabled."""
    from app.models.user import User
    from app.routes.reminders import process_reminders_for_user

    db = SessionLocal()
    try:
        users = db.query(User).filter(User.is_active == True, User.email_alerts == True).all()  # noqa: E712
        for user in users:
            try:
                process_reminders_for_user(user, db)
            except Exception:
                pass
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    scheduler = BackgroundScheduler()
    scheduler.add_job(_run_scheduled_reminders, "interval", minutes=15, id="reminders")
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="Xpiro API",
    description="Expiry-tracking backend with authentication, CRUD, OCR, and reminders.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(items.router)
app.include_router(history.router)
app.include_router(state.router)
app.include_router(scan.router)
app.include_router(reminders.router)
app.include_router(admin.router)
app.include_router(contact.router)


@app.get("/api/health", tags=["health"])
def health():
    return {"ok": True, "service": "xpiro-backend"}
