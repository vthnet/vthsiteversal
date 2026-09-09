"""
VTH NETWORK Telegram Bot Runner.

Starts the Telegram bot using the bot configuration saved from
the VTH admin panel.

The bot token is loaded server-side from MongoDB through
services.settings and is never hard-coded here.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from aiogram import Bot, Dispatcher, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)

from services import settings as settings_service

logger = logging.getLogger("vth-bot")

router = Router()


@router.message(CommandStart())
async def start_handler(message: Message) -> None:
    """Handle /start."""

    try:
        bot_settings = await settings_service.get_section("bot")

        start_message = (
            bot_settings.get("start_message")
            or "Welcome to VTH NETWORK 👋\n\n"
            "Tap the button below to open the store."
        )

        button_label = (
            bot_settings.get("start_button_label")
            or "Open VTH Store"
        )

        webapp_url = str(bot_settings.get("webapp_url") or "").strip()

        keyboard = None

        if webapp_url:
            keyboard = InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text=button_label,
                            web_app=WebAppInfo(url=webapp_url),
                        )
                    ]
                ]
            )

        await message.answer(
            start_message,
            reply_markup=keyboard,
        )

        logger.info(
            "[VTH BOT] /start received from user=%s username=%s",
            message.from_user.id if message.from_user else "unknown",
            message.from_user.username if message.from_user else "unknown",
        )

    except Exception:
        logger.exception("[VTH BOT] Error while processing /start")



async def create_bot() -> tuple[Bot, Dispatcher]:
    """
    Load bot configuration and create the aiogram Bot + Dispatcher.
    """

    logger.info("[VTH BOT] Loading bot configuration...")

    bot_settings = await settings_service.get_section("bot")

    enabled = bool(bot_settings.get("enabled"))
    token = str(bot_settings.get("bot_token") or "").strip()

    if not enabled:
        raise RuntimeError(
            "Telegram bot is disabled in Admin Panel. "
            "Open Admin Panel -> Telegram Bot -> enable the bot."
        )

    if not token:
        raise RuntimeError(
            "Telegram bot token is not configured. "
            "Open Admin Panel -> Telegram Bot and save the bot token."
        )

    bot = Bot(
        token=token,
        default=DefaultBotProperties(
            parse_mode=ParseMode.HTML,
        ),
    )

    dispatcher = Dispatcher()
    dispatcher.include_router(router)

    return bot, dispatcher


async def run_bot() -> None:
    """
    Start Telegram long polling.

    This function intentionally runs forever until cancelled.
    """

    bot: Bot | None = None

    try:
        bot, dispatcher = await create_bot()

        logger.info("[VTH BOT] Verifying Telegram bot token...")

        me = await bot.get_me()

        logger.info(
            "[VTH BOT] Telegram authentication successful."
        )
        logger.info(
            "[VTH BOT] Bot: @%s (id=%s)",
            me.username,
            me.id,
        )

        # Remove an old webhook before polling.
        # This prevents Telegram from refusing getUpdates when a
        # webhook was previously configured.
        logger.info("[VTH BOT] Removing any existing Telegram webhook...")

        await bot.delete_webhook(drop_pending_updates=False)

        logger.info("[VTH BOT] Starting Telegram long polling...")

        await dispatcher.start_polling(
            bot,
            allowed_updates=dispatcher.resolve_used_update_types(),
        )

    except asyncio.CancelledError:
        logger.info("[VTH BOT] Bot task cancelled.")
        raise

    except Exception:
        logger.exception("[VTH BOT] Telegram bot stopped because of an error.")

    finally:
        if bot:
            try:
                await bot.session.close()
            except Exception:
                logger.exception("[VTH BOT] Failed to close Telegram session.")

        logger.info("[VTH BOT] Telegram bot shutdown complete.")


async def _bot_supervisor() -> None:
    """Keep Telegram polling aligned with Admin Panel bot settings."""
    child: asyncio.Task[Any] | None = None
    active_token = ""
    try:
        while True:
            settings = await settings_service.get_section("bot")
            enabled = bool(settings.get("enabled"))
            token = str(settings.get("bot_token") or "").strip()
            if not enabled or not token:
                if child and not child.done():
                    child.cancel()
                    try:
                        await child
                    except asyncio.CancelledError:
                        pass
                child = None
                active_token = ""
            elif child is None or child.done() or token != active_token:
                if child and not child.done():
                    child.cancel()
                    try:
                        await child
                    except asyncio.CancelledError:
                        pass
                active_token = token
                child = asyncio.create_task(run_bot(), name="vth-telegram-polling")
                logger.info("[VTH BOT] Polling task started/restarted from Admin Panel configuration.")
            await asyncio.sleep(10)
    except asyncio.CancelledError:
        if child and not child.done():
            child.cancel()
            try:
                await child
            except asyncio.CancelledError:
                pass
        raise


async def start_bot_background() -> asyncio.Task[Any] | None:
    """Start a lightweight supervisor; bot enable/disable changes apply without a backend restart."""
    try:
        task = asyncio.create_task(_bot_supervisor(), name="vth-telegram-supervisor")
        logger.info("[VTH BOT] Background bot supervisor task created.")
        return task
    except Exception:
        logger.exception("[VTH BOT] Failed to create bot supervisor task.")
        return None
