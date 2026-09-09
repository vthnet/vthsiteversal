"""Shared Mongo client, index setup and small helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict
from uuid import uuid4

from motor.motor_asyncio import AsyncIOMotorClient

from core.config import DB_NAME, MONGO_URL

client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=4000)
db = client[DB_NAME]

users = db["users"]
wallets = db["wallets"]
transactions = db["transactions"]
orders = db["orders"]
payments = db["payments"]
settings_col = db["settings"]
catalog_overrides = db["catalog_overrides"]
promo_codes = db["promo_codes"]
promo_usage = db["promo_usage"]
audit_logs = db["audit_logs"]
admin_sessions = db["admin_sessions"]
notification_log = db["notification_log"]
recent_views = db["recent_views"]
broadcast_deliveries = db["broadcast_deliveries"]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return utcnow().isoformat()


def new_id(prefix: str, length: int = 6) -> str:
    return f"{prefix}-{uuid4().hex[:length].upper()}"


def strip_id(doc: Dict[str, Any] | None) -> Dict[str, Any] | None:
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


async def ensure_indexes() -> None:
    await users.create_index("id", unique=True)
    await users.create_index("telegram_id")
    await wallets.create_index("user_id", unique=True)
    await transactions.create_index([("user_id", 1), ("created_at", -1)])
    await orders.create_index("id", unique=True)
    await orders.create_index([("user_id", 1), ("created_at", -1)])
    await payments.create_index("id", unique=True)
    await payments.create_index([("user_id", 1), ("created_at", -1)])
    await settings_col.create_index("section", unique=True)
    await catalog_overrides.create_index([("kind", 1), ("target_id", 1)], unique=True)
    await promo_codes.create_index("code", unique=True)
    await promo_usage.create_index([("code", 1), ("user_id", 1)])
    await audit_logs.create_index([("created_at", -1)])
    await admin_sessions.create_index("jti", unique=True)
    await admin_sessions.create_index("expires_at", expireAfterSeconds=0)
    await notification_log.create_index([("created_at", -1)])
    await recent_views.create_index([("user_id", 1), ("viewed_at", -1)])
    await broadcast_deliveries.create_index([("broadcast_id", 1), ("telegram_id", 1)], unique=True)
