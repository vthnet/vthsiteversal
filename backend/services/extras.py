"""Servers/operators per country (number services) and customer notifications/broadcasts."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
import asyncio
import httpx

from fastapi import HTTPException

from core.db import broadcast_deliveries, db, new_id, now_iso, orders, payments, strip_id, utcnow, users

servers = db["servers"]
broadcasts = db["broadcasts"]
notification_reads = db["notification_reads"]



def _public(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {"id": doc["id"], "name": doc["name"], "price": float(doc["customer_price"]), "enabled": bool(doc.get("enabled")), "status": "available" if doc.get("enabled") else "unavailable", "message": doc.get("maintenance_message") or ("" if doc.get("enabled") else "Currently unavailable. Please try again later.")}


async def list_public_servers(product_id: str) -> List[Dict[str, Any]]:
    docs = await servers.find({"product_id": product_id}).sort("priority", 1).to_list(50)
    return [_public(d) for d in docs]


async def get_server(server_id: str) -> Optional[Dict[str, Any]]:
    return strip_id(await servers.find_one({"id": server_id}))


async def require_enabled_server(server_id: str, product_id: str) -> Dict[str, Any]:
    doc = await get_server(server_id)
    if doc is None or doc["product_id"] != product_id:
        raise HTTPException(status_code=404, detail="Server not found")
    if not doc.get("enabled"):
        raise HTTPException(status_code=409, detail=doc.get("maintenance_message") or "Currently unavailable. Please try again later.")
    return doc


async def admin_list_servers() -> List[Dict[str, Any]]:
    return await servers.find({}, {"_id": 0}).sort([("product_id", 1), ("priority", 1)]).to_list(500)


async def admin_save_server(values: Dict[str, Any], server_id: Optional[str] = None) -> Dict[str, Any]:
    allowed = {"product_id", "name", "provider_key", "provider_cost", "customer_price", "enabled", "priority", "maintenance_message"}
    clean = {k: v for k, v in values.items() if k in allowed}
    for numeric in ("provider_cost", "customer_price", "priority"):
        if numeric in clean:
            clean[numeric] = float(clean[numeric] or 0)
    if server_id is None:
        if not clean.get("product_id") or not clean.get("name"):
            raise HTTPException(status_code=400, detail="product_id and name are required")
        doc = {"id": new_id("SRV"), "enabled": True, "priority": 1, "maintenance_message": "", "provider_key": "provider_numbers", **clean, "created_at": now_iso()}
        await servers.insert_one(dict(doc))
        return doc
    result = await servers.find_one_and_update({"id": server_id}, {"$set": {**clean, "updated_at": now_iso()}}, return_document=True)
    if result is None:
        raise HTTPException(status_code=404, detail="Server not found")
    return strip_id(result) or {}


async def admin_delete_server(server_id: str) -> None:
    await servers.delete_one({"id": server_id})


# ------------------------------------------------------------- broadcasts
def _active(doc: Dict[str, Any]) -> bool:
    now = now_iso()
    return bool(doc.get("enabled", True)) and (not doc.get("start_at") or doc["start_at"] <= now) and (not doc.get("end_at") or doc["end_at"] >= now)


async def admin_save_broadcast(values: Dict[str, Any]) -> Dict[str, Any]:
    allowed = {"title", "message", "type", "button_label", "button_link", "start_at", "end_at", "show_home", "show_notifications", "enabled"}
    doc = {"id": new_id("BRD"), "type": "info", "show_home": True, "show_notifications": True, "enabled": True, **{k: v for k, v in values.items() if k in allowed}, "created_at": now_iso()}
    if not doc.get("title") or not doc.get("message"):
        raise HTTPException(status_code=400, detail="title and message are required")
    await broadcasts.insert_one(dict(doc))
    return doc


async def admin_list_broadcasts() -> List[Dict[str, Any]]:
    docs = await broadcasts.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [{**d, "active": _active(d)} for d in docs]


async def admin_delete_broadcast(broadcast_id: str) -> None:
    await broadcasts.delete_one({"id": broadcast_id})


async def admin_send_telegram_broadcast(broadcast_id: str, batch_size: int = 500) -> Dict[str, Any]:
    """Send the next batch of a broadcast to verified Telegram users.

    Delivery is idempotent through broadcast_deliveries. This keeps the admin
    request bounded and allows repeated sends to finish large audiences without
    a persistent worker.
    """
    doc = await broadcasts.find_one({"id": broadcast_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    from services import settings as settings_service
    bot = await settings_service.get_section("bot")
    if not bot.get("enabled") or not bot.get("bot_token"):
        raise HTTPException(status_code=503, detail="Telegram bot is not configured")
    sent_ids = [d["telegram_id"] async for d in broadcast_deliveries.find({"broadcast_id": broadcast_id}, {"telegram_id": 1})]
    query = {"telegram_id": {"$exists": True, "$nin": sent_ids}} if sent_ids else {"telegram_id": {"$exists": True, "$ne": ""}}
    targets = await users.find(query, {"telegram_id": 1}).limit(batch_size).to_list(batch_size)
    if not targets:
        await broadcasts.update_one({"id": broadcast_id}, {"$set": {"telegram_status": "completed", "telegram_updated_at": now_iso()}})
        return {"status": "completed", "sent": 0, "remaining": 0}
    text = f"{doc['title']}\n\n{doc['message']}"
    semaphore = asyncio.Semaphore(20)
    async with httpx.AsyncClient(timeout=8) as client:
        async def send_one(t: Dict[str, Any]) -> bool:
            async with semaphore:
                try:
                    r = await client.post(f"https://api.telegram.org/bot{bot['bot_token']}/sendMessage", json={"chat_id": str(t['telegram_id']), "text": text, "disable_web_page_preview": True})
                    return r.status_code == 200 and bool((r.json() if r.headers.get('content-type','').startswith('application/json') else {}).get('ok'))
                except (httpx.HTTPError, ValueError):
                    return False
        results = await asyncio.gather(*(send_one(t) for t in targets))
    now = now_iso()
    for target, ok in zip(targets, results):
        if ok:
            try:
                await broadcast_deliveries.insert_one({"broadcast_id": broadcast_id, "telegram_id": str(target["telegram_id"]), "status": "sent", "created_at": now})
            except Exception:
                pass
    sent = sum(1 for ok in results if ok)
    total = await users.count_documents(query)
    remaining = max(0, total - sent)
    status = "completed" if remaining == 0 else "partial"
    await broadcasts.update_one({"id": broadcast_id}, {"$set": {"telegram_status": status, "telegram_updated_at": now}, "$inc": {"telegram_sent": sent}})
    return {"status": status, "sent": sent, "attempted": len(targets), "remaining": remaining}


async def live_updates() -> List[Dict[str, Any]]:
    docs = await broadcasts.find({}, {"_id": 0}).sort("created_at", -1).to_list(20)
    return [d for d in docs if _active(d) and d.get("show_home")][:3]


async def user_notifications(user_id: str) -> Dict[str, Any]:
    items: List[Dict[str, Any]] = []
    for d in await broadcasts.find({}, {"_id": 0}).sort("created_at", -1).to_list(30):
        if _active(d) and d.get("show_notifications", True):
            items.append({"id": d["id"], "kind": "broadcast", "type": d.get("type", "info"), "title": d["title"], "message": d["message"], "button_label": d.get("button_label"), "button_link": d.get("button_link"), "created_at": d["created_at"]})
    for o in await orders.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(10):
        label = {"completed": "Order completed", "refunded": "Refund issued", "failed": "Order failed", "awaiting_otp": "Waiting for OTP", "processing": "Order processing"}.get(o["status"], "Order update")
        items.append({"id": f"order:{o['id']}:{o['status']}", "kind": "order", "type": "success" if o["status"] == "completed" else "warning" if o["status"] in ("failed", "refunded") else "info", "title": label, "message": f"{o['product']} · {o['country']} · {o['id']}", "created_at": o.get("updated_at") or o["created_at"]})
    for p in await payments.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(10):
        items.append({"id": f"payment:{p['id']}:{p['status']}", "kind": "wallet", "type": "success" if p.get("credited") else "info", "title": "Wallet credited" if p.get("credited") else "Recharge " + p["status"].replace("_", " "), "message": f"₹{p['amount']:.2f} · {p['id']}", "created_at": p.get("updated_at") or p["created_at"]})
    read_ids = {r["item_id"] for r in await notification_reads.find({"user_id": user_id}, {"item_id": 1}).to_list(500)}
    items.sort(key=lambda i: i["created_at"], reverse=True)
    for item in items:
        item["read"] = item["id"] in read_ids
    return {"items": items[:40], "unread": sum(1 for i in items[:40] if not i["read"])}


async def mark_read(user_id: str, ids: List[str]) -> None:
    for item_id in ids[:100]:
        await notification_reads.update_one({"user_id": user_id, "item_id": item_id}, {"$set": {"read_at": now_iso()}}, upsert=True)
