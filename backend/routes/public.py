"""Customer-facing API. Never exposes provider identity, costs or secrets."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from core import config
from core.db import now_iso, recent_views, strip_id, users, utcnow
from core.security import DEV_USER, get_current_user, issue_customer_token, verify_telegram_init_data
from services import catalog, extras, health, orders as order_service, payments as payment_service, settings as settings_service
from services.notifications import notify

router = APIRouter(prefix="/api", tags=["customer"])


class TelegramAuthRequest(BaseModel):
    init_data: Optional[str] = None


class PurchaseRequest(BaseModel):
    product_id: str
    promo_code: Optional[str] = None
    server_id: Optional[str] = None


class ReadRequest(BaseModel):
    ids: List[str]


class PaymentRequest(BaseModel):
    method: str
    amount: float = Field(gt=0, le=1_000_000)


class ReferenceRequest(BaseModel):
    reference: str = Field(min_length=4, max_length=120)


class PromoRequest(BaseModel):
    code: str
    amount: float = Field(ge=0)


@router.get("/", tags=["system"])
async def root() -> Dict[str, str]:
    return {"message": "VTH Network API", "stage": "2-admin-architecture"}


@router.get("/health", tags=["system"])
async def api_health() -> Dict[str, Any]:
    database = await health.check_database()
    return {"status": "ok" if database["status"] == "online" else "degraded", "service": "vth-network"}


@router.get("/settings/public")
async def get_public_settings() -> Dict[str, Any]:
    return await settings_service.public_settings()


# ---------------------------------------------------------------- auth
async def _upsert_user(profile: Dict[str, Any]) -> Dict[str, Any]:
    existing = await users.find_one({"id": profile["id"]})
    if existing is None:
        doc = {**profile, "role": "customer", "created_at": now_iso(), "last_seen": now_iso()}
        await users.insert_one(dict(doc))
        await notify("new_user", {"user": f"@{profile.get('username') or profile.get('first_name')}"})
        return doc
    await users.update_one({"id": profile["id"]}, {"$set": {k: profile[k] for k in ("first_name", "last_name", "username", "language", "avatar_url") if k in profile} | {"last_seen": now_iso()}})
    return strip_id(await users.find_one({"id": profile["id"]})) or {}


@router.post("/auth/telegram")
async def telegram_auth(payload: TelegramAuthRequest) -> Dict[str, Any]:
    bot = await settings_service.get_section("bot")
    tg_user = verify_telegram_init_data(payload.init_data or "", bot.get("bot_token") or "")
    if tg_user:
        profile = {"id": f"tg-{tg_user['id']}", "telegram_id": str(tg_user["id"]), "first_name": tg_user.get("first_name", "Telegram"), "last_name": tg_user.get("last_name"), "username": tg_user.get("username") or f"user{tg_user['id']}", "language": tg_user.get("language_code", "en"), "avatar_url": tg_user.get("photo_url"), "source": "telegram"}
    elif payload.init_data and bot.get("bot_token"):
        raise HTTPException(status_code=401, detail="Telegram identity could not be verified")
    elif config.DEV_FALLBACK_USER_ENABLED:
        profile = dict(DEV_USER)
    else:
        raise HTTPException(status_code=401, detail="Open this app inside Telegram")
    user = await _upsert_user(profile)
    return {"token": issue_customer_token(user["id"]), "user": {k: user.get(k) for k in ("id", "telegram_id", "first_name", "last_name", "username", "language", "avatar_url", "source")}, "verified": bool(tg_user)}


@router.get("/profile")
async def get_profile(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return {k: user.get(k) for k in ("id", "telegram_id", "first_name", "last_name", "username", "language", "avatar_url", "source", "created_at")}


# -------------------------------------------------------------- catalog
@router.get("/catalog/categories")
async def get_categories() -> List[Dict[str, Any]]:
    return await catalog.list_categories()


@router.get("/catalog/categories/{category_id}")
async def get_category_products(category_id: str, refresh: bool = False) -> Dict[str, Any]:
    categories = {c["id"]: c for c in await catalog.list_categories()}
    if category_id not in categories:
        raise HTTPException(status_code=404, detail="Category not found")
    data = await catalog.list_products(category_id, force=refresh)
    return {"category": categories[category_id], **data}


@router.get("/catalog/products/{product_id}")
async def get_product(product_id: str) -> Dict[str, Any]:
    product = await catalog.get_product(product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.get("/catalog/products/{product_id}/servers")
async def get_product_servers(product_id: str) -> List[Dict[str, Any]]:
    return await extras.list_public_servers(product_id)


@router.get("/notifications")
async def get_notifications(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return await extras.user_notifications(user["id"])


@router.post("/notifications/read")
async def read_notifications(payload: ReadRequest, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    await extras.mark_read(user["id"], payload.ids)
    return {"status": "ok"}


@router.get("/live-updates")
async def get_live_updates() -> List[Dict[str, Any]]:
    return await extras.live_updates()


@router.post("/catalog/products/{product_id}/viewed")
async def mark_viewed(product_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, str]:
    await recent_views.update_one({"user_id": user["id"], "product_id": product_id}, {"$set": {"viewed_at": now_iso()}}, upsert=True)
    return {"status": "ok"}


@router.get("/catalog/recent")
async def recent_products(user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    views = await recent_views.find({"user_id": user["id"]}).sort("viewed_at", -1).to_list(6)
    result = []
    for view in views:
        product = await catalog.get_product(view["product_id"])
        if product:
            result.append(product)
    return result


# --------------------------------------------------------------- wallet
@router.get("/wallet")
async def get_wallet(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return await order_service.get_wallet(user["id"])


@router.get("/wallet/transactions")
async def get_transactions(user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    return await order_service.list_transactions(user["id"])


@router.get("/payments/methods")
async def get_payment_methods() -> List[Dict[str, Any]]:
    return await payment_service.list_methods()


@router.get("/payments")
async def get_payments(user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    return await payment_service.list_user_payments(user["id"])


@router.post("/payments")
async def create_payment(payload: PaymentRequest, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return await payment_service.create_payment(payload.method, payload.amount, user)


@router.post("/payments/{payment_id}/verify")
async def verify_payment(payment_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return await payment_service.verify_payment(payment_id, user["id"])


@router.post("/payments/{payment_id}/submit")
async def submit_payment_reference(payment_id: str, payload: ReferenceRequest, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return await payment_service.submit_reference(payment_id, user["id"], payload.reference)


# ---------------------------------------------------------------- promo
@router.post("/promo/validate")
async def validate_promo(payload: PromoRequest, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return await order_service.validate_promo(payload.code, user["id"], payload.amount)


# --------------------------------------------------------------- orders
@router.get("/orders")
async def get_orders(user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    return await order_service.list_orders(user["id"])


@router.get("/orders/{order_id}")
async def get_order(order_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return await order_service.get_order(order_id, user["id"])


@router.post("/orders/{order_id}/cancel")
async def cancel_order(order_id: str, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return await order_service.cancel_order(order_id, user["id"])


@router.post("/purchases/preview")
async def purchase_preview(payload: PurchaseRequest, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return await order_service.purchase_preview(payload.product_id, user["id"], payload.promo_code, payload.server_id)


@router.post("/purchases")
async def create_purchase(payload: PurchaseRequest, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return await order_service.create_purchase(payload.product_id, user, payload.promo_code, payload.server_id)
