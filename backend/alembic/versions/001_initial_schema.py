"""Initial schema

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("first_name", sa.String(64), nullable=False, server_default=""),
        sa.Column("last_name", sa.String(64), nullable=False, server_default=""),
        sa.Column("email", sa.String(256), unique=True, nullable=False),
        sa.Column("hashed_password", sa.String(256), nullable=False),
        sa.Column("default_reminder", sa.String(16), nullable=False, server_default="app"),
        sa.Column("dark_mode", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("notifications", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("email_alerts", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("ai_auto_categorize", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("is_admin", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_id", "users", ["id"])

    op.create_table(
        "items",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("category", sa.String(64), nullable=False, server_default="other"),
        sa.Column("expiry", sa.Date, nullable=False),
        sa.Column("brand", sa.String(256), nullable=False, server_default=""),
        sa.Column("notes", sa.Text, nullable=False, server_default=""),
        sa.Column("reminder", sa.String(16), nullable=False, server_default="app"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_items_id", "items", ["id"])
    op.create_index("ix_items_user_id", "items", ["user_id"])

    op.create_table(
        "history",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("event_type", sa.String(32), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_history_id", "history", ["id"])
    op.create_index("ix_history_user_id", "history", ["user_id"])

    op.create_table(
        "reminder_alerts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("item_id", sa.Integer, sa.ForeignKey("items.id"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("alert_date", sa.Date, nullable=False),
        sa.Column("sent_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_reminder_alerts_id", "reminder_alerts", ["id"])
    op.create_index("ix_reminder_alerts_item_id", "reminder_alerts", ["item_id"])


def downgrade() -> None:
    op.drop_table("reminder_alerts")
    op.drop_table("history")
    op.drop_table("items")
    op.drop_table("users")
