"""Quick end-to-end smoke of the VTH API (run: python tests/smoke_api.py)."""
import json
import os
import sys
import urllib.error
import urllib.request

B = os.environ.get("VTH_API", "http://127.0.0.1:8001/api")


def call(path, method="GET", body=None, token=None):
    req = urllib.request.Request(B + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]


s, auth = call("/auth/telegram", "POST", {})
print("auth", s, auth.get("user", {}).get("id"), auth.get("verified"))
t = auth["token"]
print("profile", call("/profile", token=t)[0], "noauth", call("/profile")[0])
print("cats", call("/catalog/categories")[1][0]["title"])
s, p = call("/catalog/categories/tg-good")
print("prods", s, p["products"][0]["price"], "provider leak:", "provider" in json.dumps(p).lower())
print("public settings", call("/settings/public")[1]["branding"]["store_name"])
print("wallet", call("/wallet", token=t))
print("orders", call("/orders", token=t)[0], len(call("/orders", token=t)[1]))
s, pay = call("/payments", "POST", {"method": "auto-upi", "amount": 100}, token=t)
print("pay", s, pay.get("id"), pay.get("status"))
print("verify", call(f"/payments/{pay['id']}/verify", "POST", token=t)[1]["status"])
print("preview", call("/purchases/preview", "POST", {"product_id": "tg-good-in"}, token=t)[1]["status"])
print("admin noauth", call("/admin/overview")[0])
print("bad login", call("/admin/auth/login", "POST", {"username": "owner", "password": "wrong"})[0])
s, a = call("/admin/auth/login", "POST", {"username": "owner", "password": "VthOwner#2026"})
print("login", s)
at = a["access_token"]
print("overview", call("/admin/overview", token=at)[1]["users"])
s, sec = call("/admin/settings/bot", token=at)
print("bot sec", s, sec["secrets"])
s, u = call("/admin/settings/bot", "PUT", {"values": {"bot_token": "123456:ABCDEF-secret-token", "owner_telegram_id": "108247193"}}, token=at)
print("upd", s, u["values"]["bot_token"], u["secrets"]["bot_token"])
print("reveal", call("/admin/settings/bot/secrets/bot_token/reveal", "POST", token=at)[1]["value"][-5:])
print("clear", call("/admin/settings/bot/secrets/bot_token", "DELETE", token=at)[1]["secrets"]["bot_token"])
print("approve", call(f"/admin/payments/{pay['id']}/approve", "POST", {}, token=at)[1])
print("approve dup", call(f"/admin/payments/{pay['id']}/approve", "POST", {}, token=at)[1]["duplicate"])
print("wallet after", call("/wallet", token=t)[1]["balance"])
s, pur = call("/purchases", "POST", {"product_id": "tg-good-in"}, token=t)
print("purchase", s, pur.get("status"), pur.get("message"))
print("wallet after purchase", call("/wallet", token=t)[1]["balance"])
print("promo create", call("/admin/promo", "POST", {"code": "vth10", "type": "percent", "value": 10}, token=at)[0])
print("promo validate", call("/promo/validate", "POST", {"code": "VTH10", "amount": 100}, token=t)[1])
print("health", [(h["id"], h["status"]) for h in call("/admin/health", token=at)[1]])
print("catalog admin", call("/admin/catalog", token=at)[1]["categories"][0]["provider_name"])
print("product markup", call("/admin/catalog/products/tg-good-in", "PUT", {"values": {"markup_type": "percent", "markup_value": 20}}, token=at)[0], call("/catalog/products/tg-good-in")[1]["price"])
print("reset markup", call("/admin/catalog/products/tg-good-in", "PUT", {"values": {"markup_value": None}}, token=at)[0], call("/catalog/products/tg-good-in")[1]["price"])
print("audit", len(call("/admin/logs/audit", token=at)[1]), "notif", [(n["event"], n["status"]) for n in call("/admin/logs/notifications", token=at)[1][:3]])
print("cancel otp order", call("/orders/VTH-4D20B9/cancel", "POST", token=t)[1])
print("wallet after refund", call("/wallet", token=t)[1]["balance"])
print("logout", call("/admin/auth/logout", "POST", token=at)[0], "after logout", call("/admin/overview", token=at)[0])
