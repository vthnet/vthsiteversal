"""Unified catalog: categories, country products, admin overrides and pricing.

Customer projections never include provider identity or provider cost.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from core.db import catalog_overrides, strip_id, utcnow
from services import providers, settings as settings_service
from services.pricing import resolve_price

CATEGORIES: List[Dict[str, Any]] = [
    {"id": "tg-good", "title": "Telegram Account — Good Quality", "short_title": "Good Quality", "description": "Premium Telegram accounts with protected delivery.", "platform": "telegram", "badge": "GOOD QUALITY", "icon": "shield-check", "accent": "ruby", "provider_key": "provider_telegram_1", "product_type": "account", "sort": 1},
    {"id": "tg-cheap", "title": "Telegram Account — Affordable", "short_title": "Affordable", "description": "Budget-friendly Telegram accounts, fast delivery.", "platform": "telegram", "badge": "BEST PRICE", "icon": "tag", "accent": "violet", "provider_key": "provider_telegram_2", "product_type": "account", "sort": 2},
    {"id": "number-change", "title": "Telegram Number Service", "short_title": "Number Service", "description": "Change your Telegram number with a fresh reservation.", "platform": "telegram", "badge": "NUMBER SERVICE", "icon": "repeat", "accent": "blue", "provider_key": "provider_numbers", "product_type": "number", "sort": 3},
    {"id": "whatsapp", "title": "WhatsApp Number Service", "short_title": "WhatsApp", "description": "WhatsApp-ready numbers with OTP delivery.", "platform": "whatsapp", "badge": "WHATSAPP", "icon": "whatsapp", "accent": "green", "provider_key": "provider_numbers", "product_type": "number", "sort": 4},
]
CATEGORY_BY_ID = {item["id"]: item for item in CATEGORIES}


async def _overrides(kind: str) -> Dict[str, Dict[str, Any]]:
    docs = await catalog_overrides.find({"kind": kind}).to_list(500)
    return {doc["target_id"]: strip_id(doc) or {} for doc in docs}


def _stock_label(stock: int) -> str:
    if stock <= 0:
        return "Out of Stock"
    if stock < 30:
        return "Low Stock"
    return "In Stock"


def _level(override: Optional[Dict[str, Any]], level: str) -> Optional[Dict[str, Any]]:
    if not override:
        return None
    return {"level": level, "markup_type": override.get("markup_type"), "markup_value": override.get("markup_value")}


async def list_categories(admin: bool = False) -> List[Dict[str, Any]]:
    overrides = await _overrides("category")
    store = await settings_service.get_section("store")
    result = []
    for base in sorted(CATEGORIES, key=lambda c: c["sort"]):
        override = overrides.get(base["id"], {})
        provider_cfg = await settings_service.get_section(base["provider_key"])
        category = {**base, "title": override.get("title") or base["title"], "description": override.get("description") or base["description"], "visible": override.get("visible", True), "maintenance": bool(override.get("maintenance") or provider_cfg.get("maintenance") or not provider_cfg.get("enabled") or store.get("maintenance_mode"))}
        if admin:
            category.update({"provider_name": provider_cfg.get("internal_name"), "provider_enabled": provider_cfg.get("enabled"), "markup_type": override.get("markup_type"), "markup_value": override.get("markup_value")})
            result.append(category)
        elif category["visible"]:
            result.append({k: v for k, v in category.items() if k != "provider_key"})
    return result


async def list_products(category_id: str, admin: bool = False, force: bool = False) -> Dict[str, Any]:
    base = CATEGORY_BY_ID.get(category_id)
    if base is None:
        raise KeyError(category_id)
    raw, provider_cfg, error = await providers.fetch_products_safe(base["provider_key"], category_id, force=force)
    product_overrides, country_overrides, category_overrides = await _overrides("product"), await _overrides("country"), await _overrides("category")
    store = await settings_service.get_section("store")
    category_override = category_overrides.get(category_id, {})
    items = []
    for item in raw:
        override = product_overrides.get(item["id"], {})
        if not admin and not override.get("visible", True):
            continue
        pricing = resolve_price(
            float(override.get("cost_override") or item["cost"]),
            [_level(override, "product"), _level(country_overrides.get(item["country_code"]), "country"), _level(category_override, "category"), {"level": "provider", "markup_type": provider_cfg.get("markup_type"), "markup_value": provider_cfg.get("markup_value")}, {"level": "global", "markup_type": store.get("global_markup_type"), "markup_value": store.get("global_markup_value")}],
            float(provider_cfg.get("min_price") or 0),
            float(provider_cfg.get("max_price") or 0),
        )
        stock = int(item["stock"])
        maintenance = bool(override.get("maintenance") or category_override.get("maintenance") or provider_cfg.get("maintenance") or store.get("maintenance_mode"))
        product = {
            "id": item["id"], "category_id": category_id, "country_code": item["country_code"], "country_name": item["country_name"], "flag": item["flag"],
            "product_name": item["product_name"], "platform": base["platform"], "product_type": base["product_type"], "price": pricing["price"], "currency": store.get("currency", "INR"),
            "stock": stock if provider_cfg.get("show_stock", True) else None, "stock_label": _stock_label(stock), "available": stock > 0 and not maintenance, "maintenance": maintenance,
            "popular": bool(override.get("popular", item.get("popular", False))), "details": item.get("details", []),
        }
        if admin:
            product.update({"visible": override.get("visible", True), "pricing": pricing, "provider_key": base["provider_key"], "provider_name": provider_cfg.get("internal_name"), "override": {k: override.get(k) for k in ("markup_type", "markup_value", "cost_override", "popular", "maintenance", "visible")}})
        items.append(product)
    items.sort(key=lambda p: (not p["popular"], not p["available"], p["price"]))
    return {"products": items, "source": "live" if not error else ("cached" if raw else "unavailable"), "error": error, "fetched_at": utcnow().isoformat()}


async def get_product(product_id: str, admin: bool = False) -> Optional[Dict[str, Any]]:
    for category in CATEGORIES:
        if product_id.startswith(f"{category['id']}-"):
            data = await list_products(category["id"], admin=admin)
            return next((p for p in data["products"] if p["id"] == product_id), None)
    return None


async def get_product_internal(product_id: str) -> Optional[Dict[str, Any]]:
    """Full product (with pricing + provider) for server-side purchase logic."""
    return await get_product(product_id, admin=True)


async def upsert_override(kind: str, target_id: str, values: Dict[str, Any]) -> Dict[str, Any]:
    allowed = {"category": {"visible", "maintenance", "title", "description", "markup_type", "markup_value"}, "product": {"visible", "maintenance", "popular", "markup_type", "markup_value", "cost_override"}, "country": {"markup_type", "markup_value"}}[kind]
    clean = {k: v for k, v in values.items() if k in allowed}
    for numeric in ("markup_value", "cost_override"):
        if numeric in clean and clean[numeric] not in (None, ""):
            clean[numeric] = float(clean[numeric])
        elif numeric in clean:
            clean[numeric] = None
    await catalog_overrides.update_one({"kind": kind, "target_id": target_id}, {"$set": {"kind": kind, "target_id": target_id, **clean, "updated_at": utcnow().isoformat()}}, upsert=True)
    providers.invalidate_cache()
    return strip_id(await catalog_overrides.find_one({"kind": kind, "target_id": target_id})) or {}
