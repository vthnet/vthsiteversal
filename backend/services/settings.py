"""Admin-configurable settings store (schema-driven).

Every operational value the owner can change lives here: branding, support,
announcements, Telegram bot, logging destinations, provider connections,
payment methods, store limits, feature toggles and notification templates.

Secrets (type "secret") are encrypted at rest and only ever returned masked.
Customers receive a narrow public projection via `public_settings()`.
"""

from __future__ import annotations

from typing import Any, Dict, List

from core.db import settings_col, strip_id, utcnow
from core.security import audit, decrypt_secret, encrypt_secret, mask_secret


def F(key: str, label: str, type: str = "text", default: Any = "", help: str = "", options: List[str] | None = None) -> Dict[str, Any]:
    field: Dict[str, Any] = {"key": key, "label": label, "type": type, "default": default, "help": help}
    if options:
        field["options"] = options
    return field


MARKUP_FIELDS = [
    F("markup_type", "Markup type", "select", "percent", "Applied on top of provider cost", ["percent", "fixed"]),
    F("markup_value", "Markup value", "number", 0, "Percent (e.g. 20) or fixed amount in ₹"),
    F("min_price", "Minimum customer price", "number", 0),
    F("max_price", "Maximum customer price", "number", 0, "0 = no cap"),
]


def provider_section(key: str, title: str, internal_name: str, note: str) -> Dict[str, Any]:
    return {
        "id": key,
        "group": "providers",
        "title": title,
        "icon": "server",
        "description": f"Internal integration: {internal_name}. Never shown to customers.",
        "fields": [
            F("enabled", "Provider enabled", "boolean", False),
            F("internal_name", "Internal reference name", "text", internal_name, "Admin-only label"),
            F("api_base_url", "API base URL", "url", ""),
            F("api_key", "API key / token", "secret", ""),
            F("provider_id", "Provider YourID (TG-Lion)", "text", "", "TG-Lion requires YourID alongside the API key."),
            F("auth_style", "API authentication style", "select", "bearer", "How the provider expects the API key.", ["bearer", "x-api-key", "query"]),
            F("products_path", "Products endpoint", "text", "/products"),
            F("purchase_path", "Purchase endpoint", "text", "/orders"),
            F("status_path", "Order status endpoint", "text", "/orders/{reference}"),
            F("cancel_path", "Cancel endpoint", "text", "/orders/{reference}/cancel"),
            F("timeout_seconds", "Request timeout (seconds)", "number", 6),
            F("retries", "Retry attempts", "number", 1),
            F("priority", "Priority (lower = preferred)", "number", 1),
            F("show_stock", "Show stock counts to customers", "boolean", True),
            F("maintenance", "Maintenance mode", "boolean", False),
            *MARKUP_FIELDS,
            F("notes", "Internal notes", "textarea", note),
        ],
    }


SCHEMA: List[Dict[str, Any]] = [
    {
        "id": "branding", "group": "store", "title": "Store & Branding", "icon": "storefront",
        "description": "Customer-facing identity of the store.",
        "fields": [
            F("store_name", "Store name", "text", "VTH NETWORK"),
            F("tagline", "Tagline", "text", "All-in-One Account Store"),
            F("logo_url", "Logo URL", "url", "", "Leave empty to use the VTH monogram"),
            F("owner_name", "Owner display name", "text", "VTH Owner"),
            F("owner_photo_url", "Owner profile photo URL", "url", ""),
            F("owner_telegram_username", "Owner Telegram username", "text", "vthnetwork"),
            F("support_username", "Support Telegram username", "text", "vthsupport"),
            F("support_link", "Support link", "url", "https://t.me/vthsupport"),
            F("support_channel", "Support channel / group link", "url", "https://t.me/vthnetwork"),
            F("community_link", "Community link", "url", ""),
            F("about_text", "About text", "textarea", "Premium digital services platform. Quality Telegram and WhatsApp products with secure wallet payments."),
            F("footer_text", "Footer text", "text", "Powered by VTH NETWORK"),
        ],
    },
    {
        "id": "announcement", "group": "store", "title": "Announcement", "icon": "bullhorn",
        "description": "Banner shown at the top of the customer Home.",
        "fields": [
            F("enabled", "Enabled", "boolean", False),
            F("message", "Message", "textarea", "Welcome to VTH NETWORK — new countries added this week."),
            F("start_at", "Start (ISO datetime)", "text", "", "Optional, e.g. 2026-06-01T00:00:00Z"),
            F("end_at", "End (ISO datetime)", "text", ""),
            F("button_label", "Button label", "text", ""),
            F("button_link", "Button link", "url", ""),
        ],
    },
    {
        "id": "store", "group": "store", "title": "Operations & Limits", "icon": "tune",
        "description": "Maintenance, limits, timers and feature toggles.",
        "fields": [
            F("maintenance_mode", "Global maintenance mode", "boolean", False),
            F("maintenance_message", "Maintenance message", "textarea", "We're updating this service. Please try again shortly."),
            F("currency", "Currency", "select", "INR", "", ["INR", "USD", "USDT"]),
            F("min_recharge", "Minimum recharge", "number", 50),
            F("max_recharge", "Maximum recharge", "number", 50000),
            F("otp_timer_minutes", "OTP / number reservation timer (minutes)", "number", 5),
            F("refund_window_minutes", "Auto-refund window for failed orders (minutes)", "number", 30),
            F("order_cooldown_seconds", "Cooldown between orders (seconds)", "number", 5),
            F("global_markup_type", "Global markup type", "select", "percent", "", ["percent", "fixed"]),
            F("global_markup_value", "Global markup value", "number", 0),
            F("feature_promo", "Promo codes enabled", "boolean", True),
            F("feature_wallet", "Wallet recharges enabled", "boolean", True),
            F("feature_orders", "Purchases enabled", "boolean", True),
            F("feature_recent_countries", "Recently viewed countries", "boolean", True),
        ],
    },
    {
        "id": "currency", "group": "store", "title": "Currency", "icon": "tune",
        "description": "Customer display currency. Backend amounts stay in INR.",
        "fields": [
            F("default_currency", "Default currency", "select", "INR", "", ["INR", "USD"]),
            F("supported", "Supported currencies (comma separated)", "text", "INR,USD"),
            F("usd_rate", "INR per 1 USD", "number", 84),
            F("show_selector", "Show currency selector to customers", "boolean", True),
        ],
    },
    {
        "id": "content", "group": "store", "title": "Menu, Guide & Policies", "icon": "text-box-multiple",
        "description": "Profile menu content. One item per line where noted.",
        "fields": [
            F("updates_channel", "Updates channel link", "url", "https://t.me/vthnetwork"),
            F("support_message", "Support message", "text", "Our team replies within a few hours."),
            F("support_availability", "Support availability text", "text", "Available 10:00 – 22:00 IST"),
            F("other_services", "Other VTH services (Name | URL | Description per line)", "textarea", "VTH Updates | https://t.me/vthnetwork | Official announcements"),
            F("quick_guide", "Quick guide (Title :: Text per line)", "textarea", "How to buy :: Choose a category, pick a country, read the rules and confirm with your wallet balance.\nHow the wallet works :: Add funds via UPI or crypto. Balance is credited only after server-side verification.\nOrders :: Track every order in the Orders tab with live status and timeline.\nCancellations :: Number reservations can be cancelled while waiting for OTP; refunds return to your wallet."),
            F("faq", "FAQ (Question :: Answer per line)", "textarea", "Is my payment safe? :: Yes. Every payment is verified server-side before your wallet is credited.\nWhat if an order fails? :: Failed orders are refunded to your wallet automatically."),
            F("policy_terms", "Terms of service", "textarea", "Use VTH NETWORK responsibly and in line with platform terms and applicable laws."),
            F("policy_purchase", "Purchase policy", "textarea", "Check product and country before purchase. Availability and pricing can change in real time."),
            F("policy_refund", "Refund policy", "textarea", "Refunds are issued to your wallet when an order fails or a reservation expires unused."),
            F("policy_privacy", "Privacy policy", "textarea", "We store only the Telegram identity needed to operate your account and orders."),
            F("policy_acceptable_use", "Acceptable use", "textarea", "No spam, fraud, abuse, impersonation or any activity that violates platform rules."),
            F("menu_items", "Menu items visible (comma separated)", "text", "support,updates,services,guide,policies,faq,about,currency"),
        ],
    },
    {
        "id": "bot", "group": "telegram", "title": "Telegram Bot", "icon": "robot",
        "description": "Bot and Mini App act as one connected VTH NETWORK system.",
        "fields": [
            F("enabled", "Bot enabled", "boolean", False),
            F("bot_token", "Bot token", "secret", "", "Handled server-side only"),
            F("bot_username", "Bot username", "text", ""),
            F("owner_telegram_id", "Owner / Admin Telegram ID", "text", ""),
            F("public_log_channel_id", "Public success-log channel ID", "text", ""),
            F("admin_log_channel_id", "Private admin-log channel ID", "text", ""),
            F("support_username", "Support username", "text", "vthsupport"),
            F("webapp_url", "Web App / Mini App URL", "url", ""),
            F("start_message", "Start message", "textarea", "Welcome to VTH NETWORK 👋\nTap the button below to open the store."),
            F("start_button_label", "Start button label", "text", "Open VTH Store"),
            F("notify_owner_on_orders", "Notify owner on orders", "boolean", True),
            F("notify_owner_on_payments", "Notify owner on payments", "boolean", True),
            F("notify_owner_on_errors", "Notify owner on system errors", "boolean", True),
        ],
    },
    {
        "id": "logging", "group": "telegram", "title": "Logging & Notifications", "icon": "text-box-multiple",
        "description": "Three separate destinations. Secrets are never included in any log.",
        "fields": [
            F("owner_logs_enabled", "Owner payment logs", "boolean", True),
            F("owner_telegram_id", "Owner Telegram ID (payment logs)", "text", ""),
            F("public_logs_enabled", "Public success logs (sanitized)", "boolean", False),
            F("public_channel_id", "Public log channel ID", "text", ""),
            F("admin_logs_enabled", "Admin operational logs", "boolean", True),
            F("admin_channel_id", "Admin log channel ID", "text", ""),
            F("notify_new_user", "New user", "boolean", True),
            F("notify_recharge", "Recharge initiated / success / failed", "boolean", True),
            F("notify_orders", "Order created / completed / failed", "boolean", True),
            F("notify_refunds", "Refund issued", "boolean", True),
            F("notify_errors", "Important system errors", "boolean", True),
        ],
    },
    {
        "id": "templates", "group": "telegram", "title": "Notification Templates", "icon": "message-text",
        "description": "Placeholders: {store} {user} {amount} {order_id} {product} {country} {method} {status}",
        "fields": [
            F("new_user", "New user", "textarea", "👤 New user joined {store}: {user}"),
            F("recharge_initiated", "Recharge initiated", "textarea", "💳 Recharge started · ₹{amount} via {method} · {payment_id}"),
            F("recharge_success", "Recharge successful", "textarea", "✅ Recharge credited · ₹{amount} · {payment_id}"),
            F("recharge_failed", "Recharge failed", "textarea", "❌ Recharge failed · ₹{amount} · {payment_id}"),
            F("order_created", "Order created", "textarea", "🛒 Order {order_id} · {product} · {country} · ₹{amount}"),
            F("order_completed", "Order completed", "textarea", "🎉 Order {order_id} completed · {product} · {country}"),
            F("order_failed", "Order failed", "textarea", "⚠️ Order {order_id} failed · {product} · {country}"),
            F("refund_issued", "Refund issued", "textarea", "↩️ Refund ₹{amount} · {order_id}"),
            F("public_success", "Public success post (sanitized)", "textarea", "✅ {product} · {country} purchased successfully on {store}"),
            F("system_error", "System error", "textarea", "🚨 System error: {status}"),
        ],
    },
    provider_section("provider_telegram_1", "Telegram Provider 1", "TG-Lion", "Good quality Telegram accounts."),
    provider_section("provider_telegram_2", "Telegram Provider 2", "LZT Market", "Affordable Telegram accounts."),
    provider_section("provider_numbers", "Number / OTP Provider", "TemporaSMS", "Telegram number change and WhatsApp numbers."),
    {
        "id": "pay_auto_upi", "group": "payments", "title": "Auto UPI", "icon": "qrcode",
        "description": "Automatic UPI QR payments with server-side verification.",
        "fields": [
            F("enabled", "Enabled", "boolean", False),
            F("upi_id", "UPI ID", "text", ""),
            F("api_base_url", "Auto-UPI service API base URL", "url", "https://fampay.anujbots.xyz"),
            F("api_key", "API key", "secret", ""),
            F("api_secret", "API secret", "secret", ""),
            F("qr_expiry_minutes", "QR expiry (minutes)", "number", 10),
            F("verify_interval_seconds", "Verification interval (seconds)", "number", 10),
            F("min_amount", "Minimum recharge", "number", 50),
            F("max_amount", "Maximum recharge", "number", 25000),
            F("maintenance", "Maintenance mode", "boolean", False),
        ],
    },
    {
        "id": "pay_auto_crypto", "group": "payments", "title": "Auto Crypto", "icon": "bitcoin",
        "description": "Automatic crypto payments through a payment provider.",
        "fields": [
            F("enabled", "Enabled", "boolean", False),
            F("coins", "Supported coins / networks", "text", "USDT-TRC20, USDT-BEP20, BTC"),
            F("api_base_url", "Provider API base URL", "url", ""),
            F("api_key", "Provider API key", "secret", ""),
            F("create_path", "Create invoice endpoint", "text", "/invoice"),
            F("verify_path", "Verify invoice endpoint", "text", "/invoice/{payment_id}"),
            F("min_amount", "Minimum amount", "number", 100),
            F("confirmations", "Required confirmations", "number", 1),
            F("maintenance", "Maintenance mode", "boolean", False),
        ],
    },
    {
        "id": "pay_manual_upi", "group": "payments", "title": "Manual UPI", "icon": "cloud-upload",
        "description": "Customer pays and submits a reference for admin review.",
        "fields": [
            F("enabled", "Enabled", "boolean", False),
            F("upi_id", "UPI ID", "text", ""),
            F("qr_image_url", "QR image URL", "url", ""),
            F("instructions", "Payment instructions", "textarea", "Pay the exact amount and submit your UPI reference (UTR). Verification usually takes a few minutes."),
            F("min_amount", "Minimum amount", "number", 50),
            F("max_amount", "Maximum amount", "number", 50000),
            F("maintenance", "Maintenance mode", "boolean", False),
        ],
    },
    {
        "id": "pay_manual_crypto", "group": "payments", "title": "Manual Crypto", "icon": "wallet",
        "description": "Customer sends crypto and submits the transaction hash.",
        "fields": [
            F("enabled", "Enabled", "boolean", False),
            F("wallet_addresses", "Wallet addresses (one per line: COIN NETWORK ADDRESS)", "textarea", ""),
            F("network", "Default network", "text", "TRC20"),
            F("coins", "Supported coins", "text", "USDT"),
            F("instructions", "Payment instructions", "textarea", "Send the exact amount and submit the transaction hash for verification."),
            F("min_amount", "Minimum amount", "number", 100),
            F("maintenance", "Maintenance mode", "boolean", False),
        ],
    },
]


# Known provider defaults. Credentials remain empty and providers remain disabled until the owner enables them.
for _id, _url in {
    "provider_telegram_1": "https://www.tg-lion.net",
    "provider_telegram_2": "https://prod-api.lzt.market",
    "provider_numbers": "https://api.temporasms.com/stubs/handler_api.php",
}.items():
    for _field in SCHEMA: 
        if _field["id"] == _id:
            for _f in _field["fields"]:
                if _f["key"] == "api_base_url": _f["default"] = _url

SCHEMA_BY_ID = {section["id"]: section for section in SCHEMA}
# Supplier endpoint defaults where the supplied API contract is known.
for _f in SCHEMA_BY_ID["provider_telegram_2"]["fields"]:
    if _f["key"] == "products_path": _f["default"] = "/telegram"
    elif _f["key"] == "purchase_path": _f["default"] = "/telegram"

PROVIDER_SECTIONS = ["provider_telegram_1", "provider_telegram_2", "provider_numbers"]
PAYMENT_SECTIONS = {"auto-upi": "pay_auto_upi", "auto-crypto": "pay_auto_crypto", "manual-upi": "pay_manual_upi", "manual-crypto": "pay_manual_crypto"}

_cache: Dict[str, Dict[str, Any]] = {}


def defaults(section_id: str) -> Dict[str, Any]:
    return {field["key"]: field["default"] for field in SCHEMA_BY_ID[section_id]["fields"]}


def _secret_keys(section_id: str) -> set[str]:
    return {field["key"] for field in SCHEMA_BY_ID[section_id]["fields"] if field["type"] == "secret"}


async def get_section(section_id: str) -> Dict[str, Any]:
    """Merged defaults + stored values with secrets decrypted (server-side use only)."""
    if section_id in _cache:
        return dict(_cache[section_id])
    doc = await settings_col.find_one({"section": section_id}) or {}
    values = defaults(section_id)
    stored = doc.get("values", {})
    secret_keys = _secret_keys(section_id)
    for key, value in stored.items():
        if key in values:
            values[key] = decrypt_secret(value) if key in secret_keys and value else value
    _cache[section_id] = dict(values)
    return values


async def admin_view(section_id: str) -> Dict[str, Any]:
    if section_id not in SCHEMA_BY_ID:
        raise KeyError(section_id)
    values = await get_section(section_id)
    secret_keys = _secret_keys(section_id)
    safe_values = {k: (mask_secret(v) if k in secret_keys else v) for k, v in values.items()}
    secrets_state = {k: {"configured": bool(values[k]), "masked": mask_secret(values[k])} for k in secret_keys}
    doc = await settings_col.find_one({"section": section_id}, {"_id": 0, "updated_at": 1, "updated_by": 1}) or {}
    return {"section": SCHEMA_BY_ID[section_id], "values": safe_values, "secrets": secrets_state, "updated_at": doc.get("updated_at"), "updated_by": doc.get("updated_by")}


def _coerce(field: Dict[str, Any], value: Any) -> Any:
    if field["type"] == "boolean":
        return bool(value) if not isinstance(value, str) else value.lower() in ("true", "1", "yes", "on")
    if field["type"] == "number":
        try:
            number = float(value)
        except (TypeError, ValueError):
            number = float(field["default"] or 0)
        return int(number) if number.is_integer() else number
    return "" if value is None else str(value)


async def update_section(section_id: str, incoming: Dict[str, Any], actor: str) -> Dict[str, Any]:
    if section_id not in SCHEMA_BY_ID:
        raise KeyError(section_id)
    doc = await settings_col.find_one({"section": section_id}) or {}
    stored = dict(doc.get("values", {}))
    secret_keys = _secret_keys(section_id)
    changed: List[str] = []
    for field in SCHEMA_BY_ID[section_id]["fields"]:
        key = field["key"]
        if key not in incoming:
            continue
        value = incoming[key]
        if key in secret_keys:
            # Empty / masked payloads mean "keep existing secret".
            if not value or str(value).startswith("••"):
                continue
            stored[key] = encrypt_secret(str(value))
        else:
            stored[key] = _coerce(field, value)
        changed.append(key)
    await settings_col.update_one({"section": section_id}, {"$set": {"section": section_id, "values": stored, "updated_at": utcnow().isoformat(), "updated_by": actor}}, upsert=True)
    _cache.pop(section_id, None)
    await audit("settings_updated", actor, {"section": section_id, "fields": changed})
    return await admin_view(section_id)


async def clear_secret(section_id: str, key: str, actor: str) -> Dict[str, Any]:
    if key not in _secret_keys(section_id):
        raise KeyError(key)
    await settings_col.update_one({"section": section_id}, {"$unset": {f"values.{key}": ""}, "$set": {"updated_at": utcnow().isoformat(), "updated_by": actor}}, upsert=True)
    _cache.pop(section_id, None)
    await audit("secret_cleared", actor, {"section": section_id, "field": key})
    return await admin_view(section_id)


async def reveal_secret(section_id: str, key: str, actor: str) -> str:
    """Temporary reveal for the owner (audited). Never used in customer paths."""
    if key not in _secret_keys(section_id):
        raise KeyError(key)
    values = await get_section(section_id)
    await audit("secret_revealed", actor, {"section": section_id, "field": key})
    return values.get(key, "")


def _announcement_active(values: Dict[str, Any]) -> bool:
    if not values.get("enabled") or not values.get("message"):
        return False
    now = utcnow().isoformat()
    start, end = values.get("start_at") or "", values.get("end_at") or ""
    return (not start or start <= now) and (not end or end >= now)


async def public_settings() -> Dict[str, Any]:
    """Narrow, secret-free projection consumed by the customer app."""
    branding, announcement, store, currency, content = await get_section("branding"), await get_section("announcement"), await get_section("store"), await get_section("currency"), await get_section("content")
    methods = []
    for method_id, section_id in PAYMENT_SECTIONS.items():
        values = await get_section(section_id)
        methods.append({"id": method_id, "enabled": bool(values.get("enabled")), "maintenance": bool(values.get("maintenance")), "min_amount": values.get("min_amount", 0), "max_amount": values.get("max_amount", 0)})
    return {
        "branding": {k: branding[k] for k in ("store_name", "tagline", "logo_url", "owner_name", "owner_photo_url", "owner_telegram_username", "support_username", "support_link", "support_channel", "community_link", "about_text", "footer_text")},
        "announcement": {**{k: announcement[k] for k in ("message", "button_label", "button_link")}, "active": _announcement_active(announcement)},
        "store": {k: store[k] for k in ("maintenance_mode", "maintenance_message", "currency", "min_recharge", "max_recharge", "otp_timer_minutes", "feature_promo", "feature_wallet", "feature_orders", "feature_recent_countries")},
        "currency": {"default": currency["default_currency"], "supported": [c.strip().upper() for c in str(currency["supported"]).split(",") if c.strip()], "usd_rate": float(currency["usd_rate"] or 84), "show_selector": bool(currency["show_selector"])},
        "content": dict(content),
        "payment_methods": methods,
    }


async def all_admin_views() -> List[Dict[str, Any]]:
    return [await admin_view(section["id"]) for section in SCHEMA]


def invalidate_cache() -> None:
    _cache.clear()
