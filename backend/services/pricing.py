"""Centralized pricing engine.

Final customer price = provider cost + markup, resolved server-side only.
Resolution order (most specific wins): product -> country -> category ->
provider -> global. Each level may define a fixed or percentage markup; the
provider level may also clamp the final price between min/max.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def _apply(cost: float, markup_type: str, markup_value: float) -> float:
    if markup_type == "fixed":
        return cost + markup_value
    return cost * (1 + markup_value / 100)


def resolve_price(cost: float, levels: List[Optional[Dict[str, Any]]], min_price: float = 0, max_price: float = 0) -> Dict[str, Any]:
    """`levels` is ordered most-specific first; the first level with a numeric
    markup_value wins. Returns the price breakdown used by admin views."""
    applied = {"level": "none", "markup_type": "percent", "markup_value": 0}
    for level in levels:
        if not level:
            continue
        value = level.get("markup_value")
        if value is None or value == "":
            continue
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            continue
        if numeric == 0 and level.get("level") not in ("product", "country", "category"):
            continue
        applied = {"level": level.get("level", "unknown"), "markup_type": level.get("markup_type") or "percent", "markup_value": numeric}
        break
    price = _apply(cost, applied["markup_type"], applied["markup_value"])
    if min_price and price < float(min_price):
        price = float(min_price)
    if max_price and price > float(max_price):
        price = float(max_price)
    price = round(max(price, 0), 2)
    return {"cost": round(cost, 2), "price": price, "markup": round(price - cost, 2), **applied}
