from __future__ import annotations

import hmac
import logging
import os
from typing import Any

import httpx
from fastapi import APIRouter, Header, HTTPException

from services import settings as settings_service

logger = logging.getLogger("vth.telegram")

router = APIRouter(prefix="/api/telegram", tags=["telegram"])


def get_webhook_secret() -> str:
    return os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip()


async def telegram_api(
    token: str,
    method: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    url = f"https://api.telegram.org/bot{token}/{method}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(url, json=payload)

    try:
        data = response.json()
    except Exception:
        data = {}

    if response.status_code != 200 or not data.get("ok"):
        raise RuntimeError(
            str(data.get("description") or f"Telegram HTTP {response.status_code}")
        )

    return data


@router.post("/webhook")
async def telegram_webhook(
    update: dict[str, Any],
    x_telegram_bot_api_secret_token: str | None = Header(
        default=None,
        alias="X-Telegram-Bot-Api-Secret-Token",
    ),
) -> dict[str, bool]:

    secret = get_webhook_secret()

    if not secret:
        raise HTTPException(
            status_code=503,
            detail="Telegram webhook is not configured",
        )

    received = x_telegram_bot_api_secret_token or ""

    if not hmac.compare_digest(received, secret):
        raise HTTPException(
            status_code=401,
            detail="Invalid webhook secret",
        )

    bot_settings = await settings_service.get_section("bot")

    if not bot_settings.get("enabled"):
        return {"ok": True}

    token = str(bot_settings.get("bot_token") or "").strip()

    if not token:
        logger.error("Telegram bot token is missing")
        return {"ok": True}

    message = update.get("message") or {}
    text = str(message.get("text") or "").strip()

    if not text or not text.startswith("/start"):
        return {"ok": True}

    chat = message.get("chat") or {}
    chat_id = chat.get("id")

    if chat_id is None:
        return {"ok": True}

    start_message = str(
        bot_settings.get("start_message")
        or "Welcome to VTH NETWORK 👋\n\nTap the button below to open the store."
    )

    button_label = str(
        bot_settings.get("start_button_label")
        or "Open VTH Store"
    )

    webapp_url = str(
        bot_settings.get("webapp_url") or ""
    ).strip()

    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "text": start_message,
        "disable_web_page_preview": True,
    }

    if webapp_url:
        payload["reply_markup"] = {
            "inline_keyboard": [
                [
                    {
                        "text": button_label,
                        "web_app": {
                            "url": webapp_url,
                        },
                    }
                ]
            ]
        }

    try:
        await telegram_api(token, "sendMessage", payload)

        user = message.get("from") or {}

        logger.info(
            "Telegram /start handled user=%s username=%s",
            user.get("id", "unknown"),
            user.get("username", "unknown"),
        )

    except Exception:
        logger.exception("Telegram /start failed")

    return {"ok": True}