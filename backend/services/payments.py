"""Payment orders and server-side verification (Auto UPI, Auto Crypto, Manual UPI, Manual Crypto).

Rules enforced here:
- Payment orders are created server-side with an internal ID and the amount the
  server accepted (never the amount the browser claims later).
- Wallets are credited only through `credit_payment_once`, which is idempotent:
  a payment document flips `credited` exactly once via an atomic update.
- Automatic adapters report `awaiting_verification` until a real gateway is
  connected through admin settings; nothing pretends to be live.
"""

from __future__ import annotations

from datetime import timedelta, datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import httpx
from fastapi import HTTPException

from core.db import new_id, now_iso, payments, strip_id, utcnow
from services import orders as order_service, settings as settings_service
from services.notifications import notify

PAYMENT_METHODS = [
    {"id": "auto-upi", "title": "Auto UPI", "subtitle": "Instant UPI QR payment", "icon": "qr-code", "tone": "ruby", "kind": "auto"},
    {"id": "auto-crypto", "title": "Auto Crypto", "subtitle": "Automatic cryptocurrency payment", "icon": "bitcoin", "tone": "amber", "kind": "auto"},
    {"id": "manual-upi", "title": "Manual UPI", "subtitle": "Pay & submit UTR for verification", "icon": "upload-cloud", "tone": "blue", "kind": "manual"},
    {"id": "manual-crypto", "title": "Manual Crypto", "subtitle": "Send & submit transaction hash", "icon": "wallet-cards", "tone": "violet", "kind": "manual"},
]
METHOD_BY_ID = {m["id"]: m for m in PAYMENT_METHODS}
PUBLIC_PAYMENT_FIELDS = ("id", "method", "amount", "currency", "status", "created_at", "updated_at", "expires_at", "instructions", "reference", "credited", "message")


class PaymentAdapter:
    def __init__(self, method_id: str, config: Dict[str, Any]):
        self.method_id, self.config = method_id, config

    @property
    def gateway_configured(self) -> bool:
        return bool(self.config.get("api_base_url") and self.config.get("api_key"))

    async def build_instructions(self, amount: float, payment_id: str = "") -> Dict[str, Any]:
        raise NotImplementedError

    async def check_status(self, payment: Dict[str, Any]) -> Dict[str, Any]:
        """Return {"status": "paid"|"awaiting_verification"|"failed", "received_amount": float|None}."""
        return {"status": "awaiting_verification", "received_amount": None, "detail": "Gateway not configured"}

    async def test_connection(self) -> Dict[str, Any]:
        if not self.gateway_configured:
            return {"status": "not_configured", "detail": "API base URL and key required"}
        try:
            async with httpx.AsyncClient(timeout=6) as client:
                response = await client.get(self.config["api_base_url"], headers={"Authorization": f"Bearer {self.config['api_key']}"})
            return {"status": "online" if response.status_code < 500 else "error", "detail": f"HTTP {response.status_code}"}
        except httpx.HTTPError as exc:
            return {"status": "error", "detail": exc.__class__.__name__}


class AutoUpiAdapter(PaymentAdapter):
    async def build_instructions(self, amount: float, payment_id: str = "") -> Dict[str, Any]:
        upi_id = str(self.config.get("upi_id") or "").strip()
        base = str(self.config.get("api_base_url") or "https://fampay.anujbots.xyz").rstrip("/")
        if not upi_id or not self.config.get("api_key"):
            raise HTTPException(status_code=503, detail="Auto UPI is not fully configured")
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
                r = await client.get(f"{base}/qr.php", params={"upi": upi_id, "amount": f"{amount:.2f}"})
                r.raise_for_status()
                payload = r.json()
            data = payload.get("data") if isinstance(payload, dict) else None
            if not isinstance(data, dict) or str(payload.get("status", "")).lower() != "success" or not data.get("order_id"):
                raise RuntimeError(str(payload.get("message") or "FamPay QR creation failed")[:200])
            expires_at = None
            raw_expiry = data.get("expires_at_ist")
            if raw_expiry:
                try:
                    expires_at = datetime.strptime(str(raw_expiry), "%d-%m-%Y %H:%M:%S").replace(tzinfo=timezone(timedelta(hours=5, minutes=30))).astimezone(timezone.utc).isoformat()
                except ValueError:
                    expires_at = None
            return {
                "type": "upi_qr",
                "upi_id": data.get("upi_id") or upi_id,
                "qr_payload": f"upi://pay?pa={data.get('upi_id') or upi_id}&am={float(data.get('amount', amount)):.2f}&cu=INR",
                "qr_url": data.get("qr_url") or "",
                "gateway_order_id": str(data["order_id"]),
                "gateway_amount": float(data.get("amount", amount)),
                "created_at_ist": data.get("created_at_ist"),
                "expires_at_ist": data.get("expires_at_ist"),
                "gateway_expires_at": expires_at,
                "payment_id": payment_id,
                "mode": "live",
                "note": "Scan the QR and pay the exact amount. Verification is automatic."
            }
        except (httpx.HTTPError, ValueError, TypeError, RuntimeError) as exc:
            raise HTTPException(status_code=502, detail=f"Could not create Auto UPI QR: {exc}")

    async def check_status(self, payment: Dict[str, Any]) -> Dict[str, Any]:
        gateway_order_id = payment.get("gateway_order_id") or (payment.get("instructions") or {}).get("gateway_order_id")
        if not self.gateway_configured or not gateway_order_id:
            return {"status":"awaiting_verification","received_amount":None,"detail":"FamPay order ID is missing"}
        base = str(self.config.get("api_base_url") or "https://fampay.anujbots.xyz").rstrip("/")
        try:
            async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
                r = await client.get(f"{base}/verify.php", params={"order_id": gateway_order_id, "api_key": self.config["api_key"]})
                r.raise_for_status()
                payload = r.json()
            if not isinstance(payload, dict):
                return {"status":"awaiting_verification","received_amount":None,"detail":"Invalid FamPay response"}
            if str(payload.get("status", "")).lower() != "success":
                return {"status":"awaiting_verification","received_amount":None,"detail":str(payload.get("message") or "Payment not received")[:200]}
            data = payload.get("data") or {}
            received = data.get("amount")
            try: received = float(received) if received is not None else None
            except (TypeError, ValueError): received = None
            return {
                "status":"paid" if received is not None else "awaiting_verification",
                "received_amount":received,
                "reference":data.get("utr"),
                "transaction_id":data.get("transaction_id"),
                "utr":data.get("utr"),
                "sender_name":data.get("sender_name"),
                "payment_time_ist":data.get("payment_time_ist"),
                "gateway_order_id":data.get("order_id") or gateway_order_id,
                "detail":"FamPay payment verified" if received is not None else "FamPay success response did not contain amount"
            }
        except (httpx.HTTPError, ValueError) as exc:
            return {"status":"awaiting_verification","received_amount":None,"detail":exc.__class__.__name__}


class AutoCryptoAdapter(PaymentAdapter):
    async def build_instructions(self, amount: float, payment_id: str = "") -> Dict[str, Any]:
        if not self.gateway_configured:
            return {"type":"crypto_invoice","coins":self.config.get("coins", ""),"address":"","mode":"unavailable","confirmations":self.config.get("confirmations",1),"note":"Automatic crypto payments are not configured."}
        path=str(self.config.get("create_path") or "/invoice")
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
                response=await client.post(f"{str(self.config['api_base_url']).rstrip('/')}/{path.lstrip('/')}", headers={"Authorization":f"Bearer {self.config['api_key']}","Content-Type":"application/json"}, json={"amount":amount,"currency":"INR","order_id":payment_id,"coins":self.config.get("coins","")})
                response.raise_for_status(); data=response.json()
            return {"type":"crypto_invoice","coins":data.get("coins",self.config.get("coins","")),"address":data.get("address") or data.get("pay_address") or "","invoice_url":data.get("invoice_url") or data.get("url") or "","mode":"live","confirmations":self.config.get("confirmations",1),"note":data.get("message") or "Send the exact amount to the generated address."}
        except (httpx.HTTPError, ValueError) as exc:
            return {"type":"crypto_invoice","coins":self.config.get("coins",""),"address":"","mode":"error","confirmations":self.config.get("confirmations",1),"note":f"Payment invoice could not be created: {exc.__class__.__name__}"}

    async def check_status(self, payment: Dict[str, Any]) -> Dict[str, Any]:
        if not self.gateway_configured: return {"status":"awaiting_verification","received_amount":None,"detail":"Crypto gateway is not configured"}
        path=str(self.config.get("verify_path") or "/invoice/{payment_id}").replace("{payment_id}",str(payment.get("id") or ""))
        try:
            async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
                response=await client.get(f"{str(self.config['api_base_url']).rstrip('/')}/{path.lstrip('/')}", headers={"Authorization":f"Bearer {self.config['api_key']}"})
                response.raise_for_status(); data=response.json()
            status=str(data.get("status") or data.get("state") or "pending").lower()
            paid=status in {"paid","completed","confirmed","success"} or data.get("paid") is True
            received=data.get("amount") or data.get("received_amount") or data.get("paid_amount")
            try: received=float(received) if received is not None else None
            except (TypeError,ValueError): received=None
            return {"status":"paid" if paid else "awaiting_verification","received_amount":received,"detail":str(data.get("message") or status)[:200]}
        except (httpx.HTTPError, ValueError) as exc:
            return {"status":"awaiting_verification","received_amount":None,"detail":exc.__class__.__name__}


class ManualUpiAdapter(PaymentAdapter):
    async def build_instructions(self, amount: float, payment_id: str = "") -> Dict[str, Any]:
        return {"type": "manual_upi", "upi_id": self.config.get("upi_id", ""), "qr_image_url": self.config.get("qr_image_url", ""), "instructions": self.config.get("instructions", ""), "mode": "manual", "requires": "utr"}


class ManualCryptoAdapter(PaymentAdapter):
    async def build_instructions(self, amount: float, payment_id: str = "") -> Dict[str, Any]:
        addresses = [line.strip() for line in str(self.config.get("wallet_addresses") or "").splitlines() if line.strip()]
        return {"type": "manual_crypto", "wallet_addresses": addresses, "network": self.config.get("network", ""), "coins": self.config.get("coins", ""), "instructions": self.config.get("instructions", ""), "mode": "manual", "requires": "tx_hash"}


ADAPTERS = {"auto-upi": AutoUpiAdapter, "auto-crypto": AutoCryptoAdapter, "manual-upi": ManualUpiAdapter, "manual-crypto": ManualCryptoAdapter}


async def get_adapter(method_id: str) -> PaymentAdapter:
    section = settings_service.PAYMENT_SECTIONS[method_id]
    return ADAPTERS[method_id](method_id, await settings_service.get_section(section))


async def list_methods() -> List[Dict[str, Any]]:
    result = []
    for method in PAYMENT_METHODS:
        config = await settings_service.get_section(settings_service.PAYMENT_SECTIONS[method["id"]])
        result.append({**method, "enabled": bool(config.get("enabled")), "maintenance": bool(config.get("maintenance")), "min_amount": config.get("min_amount", 0), "max_amount": config.get("max_amount", 0), "mode": "manual" if method["kind"] == "manual" else ("live" if config.get("api_base_url") and config.get("api_key") else "unavailable")})
    return result


def public_payment(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {k: doc.get(k) for k in PUBLIC_PAYMENT_FIELDS}


async def create_payment(method_id: str, amount: float, user: Dict[str, Any]) -> Dict[str, Any]:
    if method_id not in METHOD_BY_ID:
        raise HTTPException(status_code=400, detail="Unsupported payment method")
    store = await settings_service.get_section("store")
    if store.get("maintenance_mode") or not store.get("feature_wallet", True):
        raise HTTPException(status_code=503, detail=store.get("maintenance_message") or "Recharges are temporarily unavailable")
    adapter = await get_adapter(method_id)
    config = adapter.config
    if not config.get("enabled") or config.get("maintenance"):
        raise HTTPException(status_code=503, detail="This payment method is temporarily unavailable")
    if METHOD_BY_ID[method_id]["kind"] == "auto" and not adapter.gateway_configured:
        raise HTTPException(status_code=503, detail="Automatic payment gateway is not fully configured")
    min_amount = max(float(store.get("min_recharge") or 0), float(config.get("min_amount") or 0))
    max_amount = min(float(store.get("max_recharge") or 10**9), float(config.get("max_amount") or 10**9))
    if amount < min_amount or amount > max_amount:
        raise HTTPException(status_code=400, detail=f"Amount must be between ₹{min_amount:.0f} and ₹{max_amount:.0f}")
    payment_id = new_id("VTH-PAY", 8)
    instructions = await adapter.build_instructions(amount, payment_id)
    expiry = int(config.get("qr_expiry_minutes") or 30)
    gateway_expiry = instructions.get("gateway_expires_at") if isinstance(instructions, dict) else None
    expires_at = gateway_expiry or (utcnow() + timedelta(minutes=expiry)).isoformat()
    doc = {"id": payment_id, "user_id": user["id"], "user_label": f"@{user.get('username') or user.get('first_name', 'user')}", "method": method_id, "amount": round(amount, 2), "currency": store.get("currency", "INR"), "status": "awaiting_verification", "credited": False, "received_amount": None, "reference": None, "gateway_order_id": instructions.get("gateway_order_id") if isinstance(instructions, dict) else None, "instructions": instructions, "message": "Wallet balance stays unchanged until server-side verification completes.", "created_at": now_iso(), "updated_at": now_iso(), "expires_at": expires_at, "checks": 0}
    await payments.insert_one(dict(doc))
    await notify("recharge_initiated", {"payment_id": doc["id"], "amount": doc["amount"], "method": METHOD_BY_ID[method_id]["title"], "user": doc["user_label"]})
    return public_payment(doc)


async def submit_reference(payment_id: str, user_id: str, reference: str) -> Dict[str, Any]:
    doc = await payments.find_one_and_update({"id": payment_id, "user_id": user_id, "status": {"$in": ["awaiting_verification", "submitted"]}}, {"$set": {"reference": reference.strip()[:120], "status": "submitted", "message": "Reference received. An administrator will verify your payment shortly.", "updated_at": now_iso()}})
    if doc is None:
        raise HTTPException(status_code=404, detail="Payment not found or already processed")
    return public_payment(strip_id(await payments.find_one({"id": payment_id})) or {})


async def credit_payment_once(payment_id: str, received_amount: float, actor: str, note: str = "") -> Dict[str, Any]:
    """Idempotent credit. Repeated calls (or concurrent checks) credit exactly once."""
    doc = await payments.find_one_and_update({"id": payment_id, "credited": False}, {"$set": {"credited": True, "status": "credited", "received_amount": round(received_amount, 2), "verified_by": actor, "verification_note": note, "updated_at": now_iso(), "message": "Payment verified and wallet credited."}})
    if doc is None:
        existing = await payments.find_one({"id": payment_id})
        if existing is None:
            raise HTTPException(status_code=404, detail="Payment not found")
        return {"credited": False, "duplicate": True, "status": existing["status"], "message": "Payment already processed."}
    credit_amount = round(min(received_amount, float(doc["amount"])), 2) if received_amount < float(doc["amount"]) else float(doc["amount"])
    try:
        await order_service.credit_wallet(doc["user_id"], credit_amount, "recharge", payment_id, note or f"Verified via {doc['method']}")
    except Exception:
        await payments.update_one({"id": payment_id, "credited": True}, {"$set": {"credited": False, "status": "awaiting_verification", "message": "Payment verified but wallet credit failed; retrying.", "updated_at": now_iso()}})
        raise
    await notify("recharge_success", {"payment_id": payment_id, "amount": credit_amount, "method": METHOD_BY_ID[doc["method"]]["title"], "user": doc.get("user_label", "")})
    return {"credited": True, "duplicate": False, "status": "credited", "amount": credit_amount, "message": "Wallet credited."}


async def verify_payment(payment_id: str, user_id: str) -> Dict[str, Any]:
    doc = await payments.find_one({"id": payment_id, "user_id": user_id})
    if doc is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    if doc.get("credited"):
        return public_payment(strip_id(doc) or {})
    if doc["status"] in ("failed", "rejected", "expired"):
        return public_payment(strip_id(doc) or {})
    if doc.get("expires_at") and doc["expires_at"] < now_iso() and METHOD_BY_ID[doc["method"]]["kind"] == "auto":
        await payments.update_one({"id": payment_id}, {"$set": {"status": "expired", "message": "Payment window expired. Create a new payment.", "updated_at": now_iso()}})
        await notify("recharge_failed", {"payment_id": payment_id, "amount": doc["amount"], "method": doc["method"], "status": "expired"})
        return public_payment(strip_id(await payments.find_one({"id": payment_id})) or {})
    adapter = await get_adapter(doc["method"])
    result = await adapter.check_status(doc)
    check_set = {"last_check": now_iso(), "last_check_detail": result.get("detail")}
    for field in ("reference", "transaction_id", "utr", "sender_name", "payment_time_ist", "gateway_order_id"):
        if result.get(field) is not None:
            check_set[field] = result[field]
    await payments.update_one({"id": payment_id}, {"$inc": {"checks": 1}, "$set": check_set})
    if result["status"] == "paid" and result.get("received_amount") is not None:
        if float(result["received_amount"]) + 0.01 >= float(doc["amount"]):
            await credit_payment_once(payment_id, float(result["received_amount"]), actor="gateway")
        else:
            await payments.update_one({"id": payment_id}, {"$set": {"status": "amount_mismatch", "received_amount": result["received_amount"], "message": "Received amount does not match. Contact support.", "updated_at": now_iso()}})
    elif result["status"] == "failed":
        await payments.update_one({"id": payment_id}, {"$set": {"status": "failed", "message": "Payment failed.", "updated_at": now_iso()}})
    return public_payment(strip_id(await payments.find_one({"id": payment_id})) or {})


async def list_user_payments(user_id: str, limit: int = 30) -> List[Dict[str, Any]]:
    docs = await payments.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [public_payment(d) for d in docs]


async def admin_reject(payment_id: str, actor: str, note: str) -> Dict[str, Any]:
    doc = await payments.find_one_and_update({"id": payment_id, "credited": False}, {"$set": {"status": "rejected", "verification_note": note, "verified_by": actor, "message": "Payment could not be verified. Contact support if you were charged.", "updated_at": now_iso()}})
    if doc is None:
        raise HTTPException(status_code=400, detail="Payment already credited or not found")
    await notify("recharge_failed", {"payment_id": payment_id, "amount": doc["amount"], "method": doc["method"], "status": "rejected"})
    return strip_id(await payments.find_one({"id": payment_id})) or {}
