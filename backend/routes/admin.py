"""Protected admin API. Every route requires a valid owner session (server-side)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

from core.db import admin_sessions, audit_logs, new_id, notification_log, now_iso, orders, payments, promo_codes, promo_usage, strip_id, transactions, users, utcnow, wallets
from core.security import DEV_USER, admin_login, audit, bearer, get_current_admin, issue_admin_token, revoke_admin_session, verify_telegram_init_data
from services import catalog, extras, health, notifications, orders as order_service, payments as payment_service, settings as settings_service

router = APIRouter(prefix="/api/admin", tags=["admin"])
Admin = Depends(get_current_admin)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class TelegramLoginRequest(BaseModel):
    init_data: str


class SettingsUpdate(BaseModel):
    values: Dict[str, Any]


class OverrideUpdate(BaseModel):
    values: Dict[str, Any]


class OrderStatusUpdate(BaseModel):
    status: str
    note: str = ""


class PaymentDecision(BaseModel):
    received_amount: Optional[float] = None
    note: str = ""


class PromoInput(BaseModel):
    code: str = Field(min_length=2, max_length=32)
    type: str = Field(pattern="^(percent|fixed)$")
    value: float = Field(gt=0)
    min_order: float = 0
    max_discount: float = 0
    usage_limit: int = 0
    per_user_limit: int = 1
    expires_at: Optional[str] = None
    enabled: bool = True


class WalletAdjust(BaseModel):
    amount: float
    note: str = Field(min_length=2, max_length=200)


# ----------------------------------------------------------------- auth
@router.post("/auth/login")
async def login(request: Request, payload: LoginRequest) -> Dict[str, Any]:
    return await admin_login(request, payload.username, payload.password)


@router.post("/auth/telegram")
async def telegram_login(request: Request, payload: TelegramLoginRequest) -> Dict[str, Any]:
    bot = await settings_service.get_section("bot")
    tg_user = verify_telegram_init_data(payload.init_data, bot.get("bot_token") or "")
    if not tg_user or not bot.get("owner_telegram_id") or str(tg_user.get("id")) != str(bot["owner_telegram_id"]):
        await audit("admin_login_failed", f"tg:{(tg_user or {}).get('id', '?')}", {"method": "telegram"})
        raise HTTPException(status_code=401, detail="Telegram identity is not the configured owner")
    return await issue_admin_token(request, "telegram", f"tg:{tg_user['id']}")


@router.post("/auth/logout")
async def logout(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> Dict[str, str]:
    await revoke_admin_session(credentials)
    return {"status": "logged_out"}


@router.get("/auth/me")
async def me(admin: Dict[str, Any] = Admin) -> Dict[str, Any]:
    last = await admin_sessions.find({"subject": admin["sub"]}, {"_id": 0, "created_at": 1, "method": 1, "ip": 1}).sort("created_at", -1).to_list(2)
    return {"username": admin["sub"], "role": admin["role"], "expires_at": admin["exp"], "last_login": last[1] if len(last) > 1 else last[0] if last else None}


# ------------------------------------------------------------- overview
@router.get("/overview")
async def overview(_: Dict[str, Any] = Admin) -> Dict[str, Any]:
    today = utcnow().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    statuses = ["pending", "processing", "awaiting_otp", "completed", "failed", "cancelled", "refunded"]
    order_counts = {s: await orders.count_documents({"status": s}) for s in statuses}
    revenue = await orders.aggregate([{"$match": {"status": "completed"}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}, "cost": {"$sum": "$cost"}}}]).to_list(1)
    recharges = await payments.aggregate([{"$match": {"credited": True}}, {"$group": {"_id": None, "total": {"$sum": "$received_amount"}, "count": {"$sum": 1}}}]).to_list(1)
    refunds = await transactions.aggregate([{"$match": {"type": "refund"}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}]).to_list(1)
    balances = await wallets.aggregate([{"$group": {"_id": None, "total": {"$sum": "$balance"}}}]).to_list(1)
    return {
        "users": {"total": await users.count_documents({}), "today": await users.count_documents({"created_at": {"$gte": today}})},
        "orders": {"total": sum(order_counts.values()), "today": await orders.count_documents({"created_at": {"$gte": today}}), "successful": order_counts["completed"], "failed": order_counts["failed"] + order_counts["cancelled"], "pending": order_counts["pending"] + order_counts["processing"] + order_counts["awaiting_otp"], "refunded": order_counts["refunded"], "by_status": order_counts},
        "revenue": {"total": round((revenue[0]["total"] if revenue else 0), 2), "cost": round((revenue[0]["cost"] if revenue else 0), 2), "profit": round((revenue[0]["total"] - revenue[0]["cost"]) if revenue else 0, 2)},
        "wallet": {"total_balance": round(balances[0]["total"] if balances else 0, 2), "recharges_total": round(recharges[0]["total"] if recharges else 0, 2), "recharges_count": recharges[0]["count"] if recharges else 0, "refunds_total": round(refunds[0]["total"] if refunds else 0, 2), "refunds_count": refunds[0]["count"] if refunds else 0},
        "payments": {"pending_review": await payments.count_documents({"status": "submitted"}), "awaiting": await payments.count_documents({"status": "awaiting_verification"})},
        "services": [s for s in await health.check_all() if s["id"] in ("database", "bot", "notifications")],
        "generated_at": now_iso(),
    }


# ------------------------------------------------------------- settings
@router.get("/settings")
async def get_settings(_: Dict[str, Any] = Admin) -> List[Dict[str, Any]]:
    return await settings_service.all_admin_views()


@router.get("/settings/{section_id}")
async def get_section(section_id: str, _: Dict[str, Any] = Admin) -> Dict[str, Any]:
    try:
        return await settings_service.admin_view(section_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown settings section")


@router.put("/settings/{section_id}")
async def update_section(section_id: str, payload: SettingsUpdate, admin: Dict[str, Any] = Admin) -> Dict[str, Any]:
    try:
        return await settings_service.update_section(section_id, payload.values, admin["sub"])
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown settings section")


@router.post("/settings/{section_id}/secrets/{key}/reveal")
async def reveal_secret(section_id: str, key: str, admin: Dict[str, Any] = Admin) -> Dict[str, str]:
    try:
        return {"value": await settings_service.reveal_secret(section_id, key, admin["sub"])}
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown secret")


@router.delete("/settings/{section_id}/secrets/{key}")
async def clear_secret(section_id: str, key: str, admin: Dict[str, Any] = Admin) -> Dict[str, Any]:
    try:
        return await settings_service.clear_secret(section_id, key, admin["sub"])
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown secret")


# --------------------------------------------------------------- health
@router.get("/health")
async def system_health(_: Dict[str, Any] = Admin) -> List[Dict[str, Any]]:
    return await health.check_all()


@router.post("/health/test/{target}")
async def test_connection(target: str, admin: Dict[str, Any] = Admin) -> Dict[str, Any]:
    try:
        result = await health.check_one(target)
    except KeyError:
        raise HTTPException(status_code=404, detail="Unknown target")
    await audit("connection_tested", admin["sub"], {"target": target, "status": result["status"]})
    return result


# -------------------------------------------------------------- catalog
@router.get("/catalog")
async def admin_catalog(_: Dict[str, Any] = Admin) -> Dict[str, Any]:
    categories = await catalog.list_categories(admin=True)
    result = []
    for category in categories:
        data = await catalog.list_products(category["id"], admin=True, force=False)
        result.append({**category, **data})
    return {"categories": result}


@router.put("/catalog/categories/{category_id}")
async def update_category(category_id: str, payload: OverrideUpdate, admin: Dict[str, Any] = Admin) -> Dict[str, Any]:
    if category_id not in catalog.CATEGORY_BY_ID:
        raise HTTPException(status_code=404, detail="Category not found")
    await audit("category_updated", admin["sub"], {"category": category_id, "fields": list(payload.values)})
    return await catalog.upsert_override("category", category_id, payload.values)


@router.put("/catalog/products/{product_id}")
async def update_product(product_id: str, payload: OverrideUpdate, admin: Dict[str, Any] = Admin) -> Dict[str, Any]:
    await audit("product_updated", admin["sub"], {"product": product_id, "fields": list(payload.values)})
    return await catalog.upsert_override("product", product_id, payload.values)


@router.put("/catalog/countries/{country_code}")
async def update_country(country_code: str, payload: OverrideUpdate, admin: Dict[str, Any] = Admin) -> Dict[str, Any]:
    await audit("country_updated", admin["sub"], {"country": country_code, "fields": list(payload.values)})
    return await catalog.upsert_override("country", country_code.upper(), payload.values)


# --------------------------------------------------------- orders/users
@router.get("/orders")
async def admin_orders(status: Optional[str] = None, limit: int = 100, _: Dict[str, Any] = Admin) -> List[Dict[str, Any]]:
    query = {"status": status} if status else {}
    docs = await orders.find(query, {"_id": 0, "delivery": 0}).sort("created_at", -1).to_list(min(limit, 500))
    return docs


@router.post("/orders/{order_id}/status")
async def admin_order_status(order_id: str, payload: OrderStatusUpdate, admin: Dict[str, Any] = Admin) -> Dict[str, Any]:
    result = await order_service.admin_set_status(order_id, payload.status, admin["sub"], payload.note)
    await audit("order_status_changed", admin["sub"], {"order": order_id, "status": payload.status})
    return result


@router.get("/users")
async def admin_users(limit: int = 200, _: Dict[str, Any] = Admin) -> List[Dict[str, Any]]:
    docs = await users.find({}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 1000))
    for doc in docs:
        wallet = await wallets.find_one({"user_id": doc["id"]})
        doc["balance"] = round(float(wallet["balance"]) if wallet else 0, 2)
        doc["orders"] = await orders.count_documents({"user_id": doc["id"]})
    return docs


@router.post("/users/{user_id}/wallet")
async def adjust_wallet(user_id: str, payload: WalletAdjust, admin: Dict[str, Any] = Admin) -> Dict[str, Any]:
    if await users.find_one({"id": user_id}) is None:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.amount < 0:
        if not await order_service.debit_wallet(user_id, abs(payload.amount), f"ADJ-{admin['sub']}"):
            raise HTTPException(status_code=400, detail="Insufficient balance for debit")
    else:
        await order_service.credit_wallet(user_id, payload.amount, "adjustment", new_id("ADJ"), payload.note)
    await audit("wallet_adjusted", admin["sub"], {"user": user_id, "amount": payload.amount, "note": payload.note})
    return await order_service.get_wallet(user_id)


# ------------------------------------------------------------- payments
@router.get("/payments")
async def admin_payments(status: Optional[str] = None, limit: int = 100, _: Dict[str, Any] = Admin) -> List[Dict[str, Any]]:
    query = {"status": status} if status else {}
    return await payments.find(query, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 500))


@router.post("/payments/{payment_id}/approve")
async def approve_payment(payment_id: str, payload: PaymentDecision, admin: Dict[str, Any] = Admin) -> Dict[str, Any]:
    doc = await payments.find_one({"id": payment_id})
    if doc is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    received = float(payload.received_amount) if payload.received_amount is not None else float(doc["amount"])
    result = await payment_service.credit_payment_once(payment_id, received, actor=admin["sub"], note=payload.note or "Manually verified by admin")
    await audit("payment_approved", admin["sub"], {"payment": payment_id, "received_amount": received, "duplicate": result.get("duplicate")})
    return result


@router.post("/payments/{payment_id}/reject")
async def reject_payment(payment_id: str, payload: PaymentDecision, admin: Dict[str, Any] = Admin) -> Dict[str, Any]:
    result = await payment_service.admin_reject(payment_id, admin["sub"], payload.note)
    await audit("payment_rejected", admin["sub"], {"payment": payment_id})
    return result


# ---------------------------------------------------------------- promo
@router.get("/promo")
async def list_promos(_: Dict[str, Any] = Admin) -> List[Dict[str, Any]]:
    docs = await promo_codes.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for doc in docs:
        doc["used"] = await promo_usage.count_documents({"code": doc["code"]})
    return docs


@router.post("/promo")
async def create_promo(payload: PromoInput, admin: Dict[str, Any] = Admin) -> Dict[str, Any]:
    doc = {**payload.model_dump(), "code": payload.code.strip().upper(), "created_at": now_iso(), "created_by": admin["sub"]}
    await promo_codes.update_one({"code": doc["code"]}, {"$set": doc}, upsert=True)
    await audit("promo_saved", admin["sub"], {"code": doc["code"]})
    return doc


@router.delete("/promo/{code}")
async def delete_promo(code: str, admin: Dict[str, Any] = Admin) -> Dict[str, str]:
    await promo_codes.delete_one({"code": code.upper()})
    await audit("promo_deleted", admin["sub"], {"code": code.upper()})
    return {"status": "deleted"}


# ----------------------------------------------------------------- logs
@router.get("/logs/audit")
async def get_audit_logs(limit: int = 100, _: Dict[str, Any] = Admin) -> List[Dict[str, Any]]:
    return await audit_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 500))


@router.get("/logs/notifications")
async def get_notification_logs(limit: int = 100, _: Dict[str, Any] = Admin) -> List[Dict[str, Any]]:
    return await notification_log.find({}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 500))


@router.post("/logs/test")
async def send_test_notification(admin: Dict[str, Any] = Admin) -> Dict[str, str]:
    await notifications.notify("system_error", {"status": f"Test notification from admin {admin['sub']}"})
    return {"status": "sent_or_logged"}


# ------------------------------------------------------- servers/operators
@router.get("/servers")
async def list_servers(_: Dict[str, Any] = Admin) -> List[Dict[str, Any]]:
    return await extras.admin_list_servers()


@router.post("/servers")
async def create_server(payload: OverrideUpdate, admin: Dict[str, Any] = Admin) -> Dict[str, Any]:
    doc = await extras.admin_save_server(payload.values)
    await audit("server_created", admin["sub"], {"server": doc["id"], "product": doc["product_id"], "name": doc["name"]})
    return doc


@router.put("/servers/{server_id}")
async def update_server(server_id: str, payload: OverrideUpdate, admin: Dict[str, Any] = Admin) -> Dict[str, Any]:
    doc = await extras.admin_save_server(payload.values, server_id)
    await audit("server_updated", admin["sub"], {"server": server_id, "fields": list(payload.values), "enabled": doc.get("enabled"), "customer_price": doc.get("customer_price")})
    return doc


@router.delete("/servers/{server_id}")
async def delete_server(server_id: str, admin: Dict[str, Any] = Admin) -> Dict[str, str]:
    await extras.admin_delete_server(server_id)
    await audit("server_deleted", admin["sub"], {"server": server_id})
    return {"status": "deleted"}


# ------------------------------------------------------------- broadcasts
@router.get("/broadcasts")
async def list_broadcasts(_: Dict[str, Any] = Admin) -> List[Dict[str, Any]]:
    return await extras.admin_list_broadcasts()


@router.post("/broadcasts")
async def create_broadcast(payload: OverrideUpdate, admin: Dict[str, Any] = Admin) -> Dict[str, Any]:
    doc = await extras.admin_save_broadcast(payload.values)
    await audit("broadcast_created", admin["sub"], {"broadcast": doc["id"], "title": doc["title"]})
    return doc


@router.post("/broadcasts/{broadcast_id}/send-telegram")
async def send_broadcast_telegram(broadcast_id: str, admin: Dict[str, Any] = Admin) -> Dict[str, Any]:
    result = await extras.admin_send_telegram_broadcast(broadcast_id)
    await audit("broadcast_telegram_send", admin["sub"], {"broadcast": broadcast_id, **result})
    return result


@router.delete("/broadcasts/{broadcast_id}")
async def delete_broadcast(broadcast_id: str, admin: Dict[str, Any] = Admin) -> Dict[str, str]:
    await extras.admin_delete_broadcast(broadcast_id)
    await audit("broadcast_deleted", admin["sub"], {"broadcast": broadcast_id})
    return {"status": "deleted"}
