"""System health monitor. Results never include secrets."""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List

from core.db import db
from services import notifications, payments as payment_service, providers, settings as settings_service


async def check_database() -> Dict[str, Any]:
    try:
        await asyncio.wait_for(db.command("ping"), timeout=3)
        return {"id": "database", "label": "Database", "status": "online", "detail": "MongoDB reachable"}
    except Exception as exc:  # noqa: BLE001
        return {"id": "database", "label": "Database", "status": "error", "detail": exc.__class__.__name__}


async def check_bot() -> Dict[str, Any]:
    bot = await settings_service.get_section("bot")
    if not bot.get("bot_token"):
        return {"id": "bot", "label": "Telegram Bot", "status": "not_configured", "detail": "Bot token not set"}
    if not bot.get("enabled"):
        return {"id": "bot", "label": "Telegram Bot", "status": "offline", "detail": "Disabled by admin"}
    result = await notifications.test_bot(bot["bot_token"])
    return {"id": "bot", "label": "Telegram Bot", **result}


async def check_provider(key: str) -> Dict[str, Any]:
    config = await settings_service.get_section(key)
    label = settings_service.SCHEMA_BY_ID[key]["title"]
    if not config.get("enabled"):
        return {"id": key, "label": label, "status": "offline", "detail": "Disabled — provider is not enabled"}
    adapter, _ = await providers.get_adapter(key)
    result = await adapter.test_connection(config)
    return {"id": key, "label": label, **result}


async def check_payment(method_id: str) -> Dict[str, Any]:
    adapter = await payment_service.get_adapter(method_id)
    label = payment_service.METHOD_BY_ID[method_id]["title"]
    config = adapter.config
    if not config.get("enabled"):
        return {"id": method_id, "label": label, "status": "offline", "detail": "Disabled by admin"}
    if payment_service.METHOD_BY_ID[method_id]["kind"] == "manual":
        ready = bool(config.get("upi_id") or config.get("wallet_addresses"))
        return {"id": method_id, "label": label, "status": "online" if ready else "not_configured", "detail": "Manual review" if ready else "Payment details not set"}
    result = await adapter.test_connection()
    return {"id": method_id, "label": label, **result}


async def check_notifications() -> Dict[str, Any]:
    logging_cfg, bot = await settings_service.get_section("logging"), await settings_service.get_section("bot")
    channels = [logging_cfg.get("owner_telegram_id") or bot.get("owner_telegram_id"), logging_cfg.get("admin_channel_id") or bot.get("admin_log_channel_id"), logging_cfg.get("public_channel_id") or bot.get("public_log_channel_id")]
    if not bot.get("bot_token") or not any(channels):
        return {"id": "notifications", "label": "Notification Services", "status": "not_configured", "detail": "Bot token and at least one destination required"}
    return {"id": "notifications", "label": "Notification Services", "status": "online" if bot.get("enabled") else "offline", "detail": f"{sum(1 for c in channels if c)} destination(s) configured"}


async def check_all() -> List[Dict[str, Any]]:
    tasks = [check_database(), check_bot(), check_notifications(), *[check_provider(k) for k in settings_service.PROVIDER_SECTIONS], *[check_payment(m["id"]) for m in payment_service.PAYMENT_METHODS]]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r if isinstance(r, dict) else {"id": "unknown", "label": "Unknown", "status": "error", "detail": r.__class__.__name__} for r in results]


async def check_one(target: str) -> Dict[str, Any]:
    if target == "database":
        return await check_database()
    if target == "bot":
        return await check_bot()
    if target == "notifications":
        return await check_notifications()
    if target in settings_service.PROVIDER_SECTIONS:
        return await check_provider(target)
    if target in payment_service.METHOD_BY_ID:
        return await check_payment(target)
    raise KeyError(target)
