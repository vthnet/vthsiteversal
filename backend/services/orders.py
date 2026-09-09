"""Wallet ledger, promo validation and order lifecycle (server-authoritative)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any, Dict, List, Optional
import json

from fastapi import HTTPException

from core.db import new_id, now_iso, orders, promo_codes, promo_usage, strip_id, transactions, utcnow, wallets
from services import catalog, extras, providers, settings as settings_service
from services.notifications import notify
from core.security import decrypt_secret, encrypt_secret

PUBLIC_ORDER_FIELDS = ("id", "product_id", "product", "country", "flag", "platform", "product_type", "amount", "discount", "promo_code", "status", "payment_status", "fulfillment_status", "created_at", "updated_at", "expires_at", "failure_reason", "delivery_masked")


# ------------------------------------------------------------------ wallet
async def get_wallet(user_id: str) -> Dict[str, Any]:
    doc = await wallets.find_one({"user_id": user_id})
    store = await settings_service.get_section("store")
    return {"user_id": user_id, "balance": round(float(doc["balance"]) if doc else 0.0, 2), "currency": store.get("currency", "INR")}


async def add_transaction(user_id: str, type_: str, amount: float, status: str, reference: str, note: str = "") -> Dict[str, Any]:
    doc = {"id": new_id("TXN", 8), "user_id": user_id, "type": type_, "amount": round(amount, 2), "status": status, "reference": reference, "note": note, "created_at": now_iso()}
    await transactions.insert_one(dict(doc))
    return doc


async def list_transactions(user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    docs = await transactions.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return docs


async def credit_wallet(user_id: str, amount: float, type_: str, reference: str, note: str = "") -> Dict[str, Any]:
    await wallets.update_one({"user_id": user_id}, {"$inc": {"balance": round(amount, 2)}, "$set": {"updated_at": now_iso()}}, upsert=True)
    return await add_transaction(user_id, type_, amount, "completed", reference, note)


async def debit_wallet(user_id: str, amount: float, reference: str) -> bool:
    """Atomic conditional debit: only succeeds if balance covers the amount."""
    result = await wallets.find_one_and_update({"user_id": user_id, "balance": {"$gte": round(amount, 2)}}, {"$inc": {"balance": -round(amount, 2)}, "$set": {"updated_at": now_iso()}})
    if result is None:
        return False
    await add_transaction(user_id, "purchase", -amount, "completed", reference)
    return True


# ------------------------------------------------------------------- promo
async def validate_promo(code: str, user_id: str, amount: float) -> Dict[str, Any]:
    store = await settings_service.get_section("store")
    if not store.get("feature_promo"):
        raise HTTPException(status_code=400, detail="Promo codes are currently disabled")
    promo = await promo_codes.find_one({"code": code.strip().upper()})
    if promo is None or not promo.get("enabled", True):
        raise HTTPException(status_code=404, detail="Promo code not found")
    if promo.get("expires_at") and promo["expires_at"] < now_iso():
        raise HTTPException(status_code=400, detail="Promo code expired")
    if promo.get("min_order") and amount < float(promo["min_order"]):
        raise HTTPException(status_code=400, detail=f"Minimum order ₹{promo['min_order']} required")
    total_uses = await promo_usage.count_documents({"code": promo["code"]})
    if promo.get("usage_limit") and total_uses >= int(promo["usage_limit"]):
        raise HTTPException(status_code=400, detail="Promo code usage limit reached")
    user_uses = await promo_usage.count_documents({"code": promo["code"], "user_id": user_id})
    if promo.get("per_user_limit") and user_uses >= int(promo["per_user_limit"]):
        raise HTTPException(status_code=400, detail="You have already used this promo code")
    discount = amount * float(promo["value"]) / 100 if promo["type"] == "percent" else float(promo["value"])
    if promo.get("max_discount"):
        discount = min(discount, float(promo["max_discount"]))
    discount = round(min(discount, amount), 2)
    return {"code": promo["code"], "discount": discount, "final_amount": round(amount - discount, 2), "type": promo["type"], "value": promo["value"]}


# ------------------------------------------------------------------ orders
def public_order(doc: Dict[str, Any]) -> Dict[str, Any]:
    result = {k: doc.get(k) for k in PUBLIC_ORDER_FIELDS}
    if doc.get("delivery_encrypted") and doc.get("status") in {"awaiting_otp", "completed"}:
        raw = decrypt_secret(str(doc["delivery_encrypted"]))
        if raw:
            try: result["delivery"] = json.loads(raw)
            except json.JSONDecodeError: result["delivery"] = raw
    return result


async def list_orders(user_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    docs = await orders.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [public_order(d) for d in docs]


async def get_order(order_id: str, user_id: Optional[str] = None, admin: bool = False) -> Dict[str, Any]:
    query: Dict[str, Any] = {"id": order_id}
    if user_id:
        query["user_id"] = user_id
    doc = strip_id(await orders.find_one(query))
    if doc is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return doc if admin else public_order(doc)


async def purchase_preview(product_id: str, user_id: str, promo_code: Optional[str], server_id: Optional[str] = None) -> Dict[str, Any]:
    product = await catalog.get_product_internal(product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    wallet = await get_wallet(user_id)
    price = float(product["price"])
    server = None
    if server_id:
        server = await extras.require_enabled_server(server_id, product_id)
        price = float(server["customer_price"])
    elif product["product_type"] == "number" and await extras.list_public_servers(product_id):
        raise HTTPException(status_code=400, detail="Please choose an operator/server")
    discount = 0.0
    if promo_code:
        discount = (await validate_promo(promo_code, user_id, price))["discount"]
    final = round(price - discount, 2)
    status = "out_of_stock" if not product["available"] and not product["maintenance"] else "maintenance" if product["maintenance"] else "insufficient_balance" if wallet["balance"] < final else "ready"
    return {"product": {k: v for k, v in product.items() if k not in ("pricing", "provider_key", "provider_name", "override", "visible")}, "server": {"id": server["id"], "name": server["name"]} if server else None, "price": price, "discount": discount, "final_amount": final, "wallet_balance": wallet["balance"], "balance_after": round(wallet["balance"] - final, 2), "can_purchase": status == "ready", "status": status}


async def create_purchase(product_id: str, user: Dict[str, Any], promo_code: Optional[str], server_id: Optional[str] = None) -> Dict[str, Any]:
    store = await settings_service.get_section("store")
    if store.get("maintenance_mode"):
        return {"status": "maintenance", "message": store.get("maintenance_message")}
    if not store.get("feature_orders", True):
        return {"status": "maintenance", "message": "Purchases are temporarily paused."}
    preview = await purchase_preview(product_id, user["id"], promo_code, server_id)
    if preview["status"] != "ready":
        return {"status": preview["status"], "message": {"out_of_stock": "This product is currently unavailable.", "maintenance": store.get("maintenance_message"), "insufficient_balance": "Recharge your wallet to continue. No purchase was made."}[preview["status"]], "preview": preview}
    product = await catalog.get_product_internal(product_id)
    order_id = new_id("VTH")
    if not await debit_wallet(user["id"], preview["final_amount"], order_id):
        return {"status": "insufficient_balance", "message": "Recharge your wallet to continue. No purchase was made."}
    timer_minutes = int(store.get("otp_timer_minutes") or 5)
    doc = {
        "id": order_id, "user_id": user["id"], "user_label": f"@{user.get('username') or user.get('first_name', 'user')}", "product_id": product_id, "product": product["product_name"], "country": product["country_name"], "flag": product["flag"],
        "platform": product["platform"], "product_type": product["product_type"], "amount": preview["final_amount"], "list_price": preview["price"], "discount": preview["discount"], "promo_code": promo_code.upper() if promo_code else None,
        "cost": (await extras.get_server(server_id) or {}).get("provider_cost", product["pricing"]["cost"]) if server_id else product["pricing"]["cost"], "server_id": server_id, "server_name": preview["server"]["name"] if preview.get("server") else None, "provider_key": product["provider_key"], "provider_reference": None, "status": "processing", "payment_status": "paid", "fulfillment_status": "pending",
        "created_at": now_iso(), "updated_at": now_iso(), "expires_at": (utcnow() + timedelta(minutes=timer_minutes)).isoformat() if product["product_type"] == "number" else None, "failure_reason": None, "delivery": None, "delivery_masked": None,
    }
    await orders.insert_one(dict(doc))
    if promo_code:
        await promo_usage.insert_one({"code": promo_code.upper(), "user_id": user["id"], "order_id": order_id, "created_at": now_iso()})
    await notify("order_created", {"order_id": order_id, "product": doc["product"], "country": doc["country"], "amount": doc["amount"], "user": doc["user_label"]})
    adapter, _ = await providers.get_adapter(product["provider_key"])
    result = await adapter.create_purchase(product, order_id)
    if result["status"] == "provider_not_configured":
        # Honest failure: supplier not connected -> refund immediately, exactly once.
        await refund_order(order_id, "Supplier connection not configured", actor="system")
        return {"status": "failed_refunded", "order_id": order_id, "message": "Supplier is not connected yet. Your wallet has been refunded."}
    if result.get("status") == "failed":
        await refund_order(order_id, result.get("message") or "Supplier rejected the order", actor="system")
        return {"status":"failed_refunded","order_id":order_id,"message":"Supplier could not fulfil the order. Your wallet has been refunded."}
    delivery = result.get("delivery")
    if delivery is None and isinstance(result.get("data"), dict):
        data=result["data"]
        delivery=data.get("delivery") or data.get("account") or data.get("credentials") or data.get("number")
    update={"provider_reference":result.get("reference"),"status":"awaiting_otp" if product["product_type"] == "number" else ("completed" if delivery else "processing"),"updated_at":now_iso()}
    if delivery is not None:
        update["delivery_encrypted"]=encrypt_secret(json.dumps(delivery, ensure_ascii=False))
        update["delivery_masked"] = (str(delivery)[:4] + "••••••") if product["product_type"] == "number" else "••••••••••••"
        if product["product_type"] != "number": update["fulfillment_status"]="delivered"
    await orders.update_one({"id": order_id}, {"$set": update})
    if update["status"] == "completed": await notify("order_completed", {"order_id":order_id,"product":doc["product"],"country":doc["country"],"amount":doc["amount"]})
    return {"status": "created", "order_id": order_id, "order": await get_order(order_id, user["id"])}


async def refund_order(order_id: str, reason: str, actor: str) -> Dict[str, Any]:
    """Idempotent refund: only the first transition from a refundable state pays out."""
    doc = await orders.find_one_and_update({"id": order_id, "status": {"$in": ["processing", "awaiting_otp", "failed", "pending"]}, "refunded": {"$ne": True}}, {"$set": {"status": "refunded", "payment_status": "refunded", "fulfillment_status": "cancelled", "refunded": True, "failure_reason": reason, "updated_at": now_iso(), "refunded_by": actor}})
    if doc is None:
        current = await orders.find_one({"id": order_id})
        if current is None:
            raise HTTPException(status_code=404, detail="Order not found")
        return {"status": current["status"], "refunded": bool(current.get("refunded")), "message": "Order is not refundable in its current state."}
    await credit_wallet(doc["user_id"], float(doc["amount"]), "refund", order_id, reason)
    await notify("refund_issued", {"order_id": order_id, "amount": doc["amount"], "product": doc["product"], "country": doc["country"], "status": reason})
    return {"status": "refunded", "refunded": True, "message": "Refund credited to wallet."}


async def cancel_order(order_id: str, user_id: str) -> Dict[str, Any]:
    doc = await orders.find_one({"id": order_id, "user_id": user_id})
    if doc is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if doc["status"] != "awaiting_otp":
        raise HTTPException(status_code=400, detail="Only orders waiting for OTP can be cancelled")
    adapter, _ = await providers.get_adapter(doc["provider_key"])
    if doc.get("provider_reference"):
        await adapter.cancel_order(doc["provider_reference"])
    return await refund_order(order_id, "Cancelled by customer", actor=user_id)


async def admin_set_status(order_id: str, status: str, actor: str, note: str = "") -> Dict[str, Any]:
    if status == "refunded":
        return await refund_order(order_id, note or "Refunded by admin", actor)
    if status not in ("completed", "failed", "cancelled", "processing"):
        raise HTTPException(status_code=400, detail="Unsupported status")
    update = {"status": status, "updated_at": now_iso(), "fulfillment_status": "delivered" if status == "completed" else "failed" if status == "failed" else "cancelled" if status == "cancelled" else "pending", "admin_note": note}
    if status == "completed":
        update["delivery_masked"] = "••••••••••••"
    if status == "failed":
        update["failure_reason"] = note or "Marked failed by admin"
    doc = await orders.find_one_and_update({"id": order_id}, {"$set": update})
    if doc is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if status == "completed":
        await notify("order_completed", {"order_id": order_id, "product": doc["product"], "country": doc["country"], "amount": doc["amount"]})
    if status == "failed":
        await notify("order_failed", {"order_id": order_id, "product": doc["product"], "country": doc["country"]})
    return await get_order(order_id, admin=True)



async def sync_provider_orders(limit: int = 100) -> int:
    """Poll active supplier orders without blocking customer requests."""
    active = orders.find({"provider_reference": {"$nin": [None, ""]}, "status": {"$in": ["processing", "awaiting_otp"]}}).sort("updated_at", 1).limit(limit)
    changed = 0
    async for doc in active:
        try:
            adapter, _ = await providers.get_adapter(doc["provider_key"])
            result = await adapter.get_order_status(str(doc["provider_reference"]))
            status = str(result.get("status") or "unknown").lower()
            if status in {"completed", "success", "paid", "delivered", "status_ok"}:
                update = {"status": "completed", "fulfillment_status": "delivered", "updated_at": now_iso(), "failure_reason": None, "delivery_masked": "••••••••••••"}
                delivery = result.get("delivery") or result.get("number") or result.get("otp")
                if delivery:
                    update["delivery_masked"] = str(delivery)[:4] + "••••••"
                    update["delivery_encrypted"] = encrypt_secret(json.dumps(delivery, ensure_ascii=False))
                await orders.update_one({"id": doc["id"], "status": {"$in": ["processing", "awaiting_otp"]}}, {"$set": update})
                await notify("order_completed", {"order_id": doc["id"], "product": doc["product"], "country": doc["country"], "amount": doc["amount"]})
                changed += 1
            elif status in {"failed", "cancelled", "canceled", "expired", "rejected"}:
                await refund_order(doc["id"], f"Supplier order {status}", actor="system")
                changed += 1
            elif status in {"awaiting_otp", "waiting", "pending", "processing", "unknown"}:
                await orders.update_one({"id": doc["id"]}, {"$set": {"status": "awaiting_otp" if doc["product_type"] == "number" else "processing", "updated_at": now_iso()}})
        except Exception:
            # Supplier outages must not break the sweeper or customer requests.
            continue
    return changed

async def expire_stale_otp_orders() -> int:
    """Background sweep: auto-refund number reservations that ran out of time."""
    now = now_iso()
    count = 0
    async for doc in orders.find({"status": "awaiting_otp", "expires_at": {"$lt": now}}, {"id": 1}):
        await refund_order(doc["id"], "Reservation expired — automatically refunded", actor="system")
        count += 1
    return count


