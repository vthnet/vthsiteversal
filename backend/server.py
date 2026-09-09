"""VTH Network API entrypoint.

Frontend -> VTH NETWORK Backend -> Unified Product/Order/Payment services ->
Provider / Payment adapters. All secrets stay server-side.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from starlette.middleware.cors import CORSMiddleware

from core.db import client, ensure_indexes
from core import config
from routes.admin import router as admin_router
from routes.public import router as public_router
from routes.telegram import router as telegram_router
from services import orders as order_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("vth-network")


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        await ensure_indexes()
    except Exception:  # noqa: BLE001
        logger.exception("index creation failed; continuing")
    yield
    client.close()


app = FastAPI(title="VTH Network API", version="0.2.0", lifespan=lifespan)


@app.get("/api/cron/maintenance")
async def cron_maintenance(request: Request):
    """Serverless-safe maintenance endpoint for Vercel Cron/external schedulers."""
    secret = config.CRON_SECRET
    auth = request.headers.get("authorization", "")
    if not secret or auth != f"Bearer {secret}":
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Unauthorized")
    synced = await order_service.sync_provider_orders()
    expired = await order_service.expire_stale_otp_orders()
    return {"ok": True, "synced": synced, "expired": expired}
app.include_router(public_router)
app.include_router(admin_router)
app.include_router(telegram_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=bool(config.ALLOWED_ORIGINS),
    allow_origins=config.ALLOWED_ORIGINS or ["*"],
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
