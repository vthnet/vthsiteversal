"""Centralized Telegram notification / logging dispatcher.

Three destinations: owner payment logs, public success logs (sanitized) and
admin operational logs. Messages are rendered from admin-editable templates,
sanitized, and delivered in the background. When the bot is not configured the
message is recorded locally with status `skipped_not_configured` — nothing
pretends to be live.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Dict, Optional
from uuid import uuid4

import httpx

from core.db import notification_log, utcnow
from services import settings as settings_service

logger = logging.getLogger("vth-notify")

SENSITIVE_KEYS = {"phone", "otp", "token", "api_key", "secret", "password", "provider_reference", "provider_ref", "delivery", "credentials", "telegram_id", "user_id"}
PUBLIC_ALLOWED_KEYS = {"store", "product", "country", "amount", "status"}

EVENT_ROUTES: Dict[str, Dict[str, Any]] = {
    "new_user": {"toggle": "notify_new_user", "owner": False, "admin": True, "public": False},
    "recharge_initiated": {"toggle": "notify_recharge", "owner": True, "admin": True, "public": False},
    "recharge_success": {"toggle": "notify_recharge", "owner": True, "admin": True, "public": False},
    "recharge_failed": {"toggle": "notify_recharge", "owner": True, "admin": True, "public": False},
    "order_created": {"toggle": "notify_orders", "owner": True, "admin": True, "public": False},
    "order_completed": {"toggle": "notify_orders", "owner": True, "admin": True, "public": True},
    "order_failed": {"toggle": "notify_orders", "owner": True, "admin": True, "public": False},
    "refund_issued": {"toggle": "notify_refunds", "owner": True, "admin": True, "public": False},
    "system_error": {"toggle": "notify_errors", "owner": True, "admin": True, "public": False},
}


def sanitize(payload: Dict[str, Any], public: bool = False) -> Dict[str, Any]:
    clean: Dict[str, Any] = {}
    for key, value in payload.items():
        lowered = key.lower()
        if any(s in lowered for s in SENSITIVE_KEYS):
            continue
        if public and key not in PUBLIC_ALLOWED_KEYS:
            continue
        text = str(value)
        text = re.sub(r"\+?\d[\d\s-]{8,}\d", "[redacted]", text)  # phone-number shapes
        clean[key] = text
    return clean


def render(template: str, payload: Dict[str, Any]) -> str:
    class Safe(dict):
        def __missing__(self, key: str) -> str:
            return "-"
    return template.format_map(Safe(payload))


async def _send_telegram(client: httpx.AsyncClient, bot_token: str, chat_id: str, text: str) -> Dict[str, Any]:
    try:
        response = await client.post(f"https://api.telegram.org/bot{bot_token}/sendMessage", json={"chat_id": chat_id, "text": text, "disable_web_page_preview": True})
        return {"ok": response.status_code == 200, "detail": f"HTTP {response.status_code}"}
    except httpx.HTTPError as exc:
        return {"ok": False, "detail": exc.__class__.__name__}


async def _deliver(event: str, payload: Dict[str, Any]) -> None:
    route = EVENT_ROUTES.get(event)
    if route is None:
        return
    bot, logging_cfg, templates, branding = (await settings_service.get_section("bot"), await settings_service.get_section("logging"), await settings_service.get_section("templates"), await settings_service.get_section("branding"))
    if not logging_cfg.get(route["toggle"], True):
        return
    base_payload = {**payload, "store": branding.get("store_name", "VTH NETWORK")}
    destinations = []
    if route["owner"] and logging_cfg.get("owner_logs_enabled"):
        destinations.append(("owner", logging_cfg.get("owner_telegram_id") or bot.get("owner_telegram_id"), render(templates.get(event, event), sanitize(base_payload))))
    if route["admin"] and logging_cfg.get("admin_logs_enabled"):
        destinations.append(("admin", logging_cfg.get("admin_channel_id") or bot.get("admin_log_channel_id"), render(templates.get(event, event), sanitize(base_payload))))
    if route["public"] and logging_cfg.get("public_logs_enabled"):
        destinations.append(("public", logging_cfg.get("public_channel_id") or bot.get("public_log_channel_id"), render(templates.get("public_success", ""), sanitize(base_payload, public=True))))
    bot_ready = bool(bot.get("enabled") and bot.get("bot_token"))
    async with httpx.AsyncClient(timeout=6) as client:
        async def deliver_one(destination: str, chat_id: Any, text: str) -> None:
            if bot_ready and chat_id:
                result = await _send_telegram(client, bot["bot_token"], str(chat_id), text)
                status, detail = ("sent" if result["ok"] else "failed"), result["detail"]
            else:
                status, detail = "skipped_not_configured", "Bot token or channel not configured"
            await notification_log.insert_one({"id": str(uuid4()), "event": event, "destination": destination, "chat_id": str(chat_id or ""), "text": text, "status": status, "detail": detail, "created_at": utcnow().isoformat()})
        await asyncio.gather(*(deliver_one(destination, chat_id, text) for destination, chat_id, text in destinations))


async def notify(event: str, payload: Optional[Dict[str, Any]] = None) -> None:
    """Deliver critical Telegram notifications before the serverless response ends.

    This is intentionally awaited instead of using fire-and-forget background tasks,
    because Vercel may freeze/terminate a function immediately after the response.
    """
    try:
        await _deliver(event, payload or {})
    except Exception:  # noqa: BLE001
        logger.exception("notification delivery failed for %s", event)


async def test_bot(bot_token: str) -> Dict[str, Any]:
    if not bot_token:
        return {"status": "not_configured", "detail": "Bot token not set"}
    try:
        async with httpx.AsyncClient(timeout=6) as client:
            response = await client.get(f"https://api.telegram.org/bot{bot_token}/getMe")
        data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
        if response.status_code == 200 and data.get("ok"):
            return {"status": "online", "detail": f"@{data['result'].get('username', '')}"}
        return {"status": "error", "detail": data.get("description", f"HTTP {response.status_code}")}
    except (httpx.HTTPError, ValueError) as exc:
        return {"status": "error", "detail": exc.__class__.__name__}
