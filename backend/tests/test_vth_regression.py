"""Opt-in staging integration tests for VTH NETWORK.

These tests intentionally do not run against production by default. Set
VTH_RUN_INTEGRATION_TESTS=1 and point VTH_API_BASE at a disposable staging
instance with test credentials before running them.
"""
import os
import pytest

pytestmark = pytest.mark.skipif(os.environ.get("VTH_RUN_INTEGRATION_TESTS") != "1", reason="staging integration tests are opt-in")

import json
import time
import uuid

import pytest
import requests


# --- Auth --------------------------------------------------------------
class TestAuth:
    def test_customer_dev_login_returns_token(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/telegram", json={}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("token")
        assert data["user"]["id"] == "dev-telegram-user"

    def test_profile_requires_auth(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/profile", timeout=15)
        assert r.status_code == 401

    def test_profile_with_token(self, api_client, base_url, customer_token, bearer):
        r = api_client.get(f"{base_url}/api/profile", headers=bearer(customer_token), timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("id") == "dev-telegram-user"


# --- Catalog provider masking ------------------------------------------
FORBIDDEN_PROVIDER_STRINGS = ["TG-Lion", "LZT", "TemporaSMS", "Tempora", "lzt", "tg-lion"]


class TestCatalogMasking:
    def test_categories_have_no_provider_leak(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/catalog/categories", timeout=15)
        assert r.status_code == 200
        text = r.text
        assert "provider" not in text.lower(), f"'provider' key leaked: {text[:500]}"
        for token in FORBIDDEN_PROVIDER_STRINGS:
            assert token not in text, f"Provider name leaked: {token}"

    def test_category_detail_tg_good_no_leak(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/catalog/categories/tg-good", timeout=15)
        assert r.status_code == 200
        text = r.text
        assert "provider" not in text.lower()
        for token in FORBIDDEN_PROVIDER_STRINGS:
            assert token not in text


# --- Number product servers & purchase preview -------------------------
class TestNumberProductFlow:
    def test_servers_list_returns_enabled_and_disabled(self, api_client, base_url):
        r = api_client.get(
            f"{base_url}/api/catalog/products/number-change-us/servers", timeout=15
        )
        assert r.status_code == 200, r.text
        servers = r.json()
        assert isinstance(servers, list) and len(servers) >= 2
        # Expect at least one enabled operator labeled Operator 1 and disabled Operator -9
        labels = {s.get("label") or s.get("name") or s.get("id"): s for s in servers}
        # Fallback: locate by enabled flag
        enabled = [s for s in servers if s.get("enabled") is True]
        disabled = [s for s in servers if s.get("enabled") is False]
        assert enabled, f"No enabled operators: {servers}"
        assert disabled, f"No disabled operators: {servers}"

    def test_preview_requires_server_for_number_product(
        self, api_client, base_url, customer_token, bearer
    ):
        r = api_client.post(
            f"{base_url}/api/purchases/preview",
            headers=bearer(customer_token),
            json={"product_id": "number-change-us"},
            timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_preview_disabled_server_conflict(
        self, api_client, base_url, customer_token, bearer
    ):
        servers = api_client.get(
            f"{base_url}/api/catalog/products/number-change-us/servers", timeout=15
        ).json()
        disabled = next(s for s in servers if s.get("enabled") is False)
        r = api_client.post(
            f"{base_url}/api/purchases/preview",
            headers=bearer(customer_token),
            json={"product_id": "number-change-us", "server_id": disabled["id"]},
            timeout=15,
        )
        assert r.status_code == 409, r.text

    def test_preview_enabled_server_price_79(
        self, api_client, base_url, customer_token, bearer
    ):
        servers = api_client.get(
            f"{base_url}/api/catalog/products/number-change-us/servers", timeout=15
        ).json()
        enabled = next(s for s in servers if s.get("enabled") is True)
        r = api_client.post(
            f"{base_url}/api/purchases/preview",
            headers=bearer(customer_token),
            json={"product_id": "number-change-us", "server_id": enabled["id"]},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("price") == 79, body


# --- Admin auth & bot secret masking ------------------------------------
class TestAdmin:
    def test_bad_password_401(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/admin/auth/login",
            json={"username": "owner", "password": "nope"},
            timeout=15,
        )
        assert r.status_code == 401

    def test_overview_requires_auth(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/admin/overview", timeout=15)
        assert r.status_code == 401

    def test_correct_login_returns_token(self, admin_token):
        assert admin_token and len(admin_token) > 10

    def test_bot_secret_lifecycle(self, api_client, base_url, admin_token, bearer):
        secret_val = f"111222:TEST_{uuid.uuid4().hex[:10]}"
        # Update
        put = api_client.put(
            f"{base_url}/api/admin/settings/bot",
            headers=bearer(admin_token),
            json={"values": {"bot_token": secret_val, "owner_telegram_id": "108247193"}},
            timeout=15,
        )
        assert put.status_code == 200, put.text
        body = put.json()
        masked = body["values"]["bot_token"]
        assert masked.startswith("••••"), f"Bot token not masked: {masked}"
        # Reveal
        rev = api_client.post(
            f"{base_url}/api/admin/settings/bot/secrets/bot_token/reveal",
            headers=bearer(admin_token),
            timeout=15,
        )
        assert rev.status_code == 200
        assert rev.json()["value"] == secret_val
        # Clear
        clr = api_client.delete(
            f"{base_url}/api/admin/settings/bot/secrets/bot_token",
            headers=bearer(admin_token),
            timeout=15,
        )
        assert clr.status_code == 200
        cleared = clr.json()["secrets"]["bot_token"]
        # Cleared value could be None/""/False or {'configured': False, 'masked': ''}
        if isinstance(cleared, dict):
            assert cleared.get("configured") is False, cleared
        else:
            assert cleared in (None, "", False), cleared


# --- Payment approve idempotency ---------------------------------------
class TestPayments:
    def test_auto_upi_awaiting_and_idempotent_approve(
        self, api_client, base_url, customer_token, admin_token, bearer
    ):
        # Initial wallet balance
        bal_before = api_client.get(
            f"{base_url}/api/wallet", headers=bearer(customer_token), timeout=15
        ).json()["balance"]

        # Create payment
        r = api_client.post(
            f"{base_url}/api/payments",
            headers=bearer(customer_token),
            json={"method": "auto-upi", "amount": 100},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        pay = r.json()
        assert pay["status"] == "awaiting_verification"
        pid = pay["id"]

        # First approve
        a1 = api_client.post(
            f"{base_url}/api/admin/payments/{pid}/approve",
            headers=bearer(admin_token),
            json={},
            timeout=15,
        )
        assert a1.status_code == 200, a1.text
        assert a1.json().get("duplicate") in (False, None)

        # Second approve → duplicate:true
        a2 = api_client.post(
            f"{base_url}/api/admin/payments/{pid}/approve",
            headers=bearer(admin_token),
            json={},
            timeout=15,
        )
        assert a2.status_code == 200, a2.text
        assert a2.json().get("duplicate") is True

        # Wallet should be credited only once
        bal_after = api_client.get(
            f"{base_url}/api/wallet", headers=bearer(customer_token), timeout=15
        ).json()["balance"]
        assert bal_after - bal_before == 100, f"expected +100 got {bal_after - bal_before}"


# --- Broadcasts / notifications ----------------------------------------
class TestBroadcasts:
    def test_broadcast_flow(self, api_client, base_url, admin_token, customer_token, bearer):
        title = f"TEST_Broadcast_{uuid.uuid4().hex[:6]}"
        create = api_client.post(
            f"{base_url}/api/admin/broadcasts",
            headers=bearer(admin_token),
            json={"values": {"title": title, "message": "Regression test broadcast", "audience": "all"}},
            timeout=15,
        )
        assert create.status_code in (200, 201), create.text

        live = api_client.get(f"{base_url}/api/live-updates", timeout=15)
        assert live.status_code == 200
        assert any(item.get("title") == title for item in live.json()), live.text

        notif = api_client.get(
            f"{base_url}/api/notifications",
            headers=bearer(customer_token),
            timeout=15,
        )
        assert notif.status_code == 200
        body = notif.json()
        unread = body.get("unread") if isinstance(body, dict) else None
        if unread is None and isinstance(body, dict):
            unread = body.get("unread_count")
        # Some implementations return {items, unread}
        if unread is None and isinstance(body, list):
            unread = sum(1 for n in body if not n.get("read"))
        assert unread and unread > 0, body

        # Fetch notification ids to pass to mark-read
        raw_ids = []
        if isinstance(body, dict):
            raw_ids = [n.get("id") for n in body.get("items", []) if n.get("id")]
        elif isinstance(body, list):
            raw_ids = [n.get("id") for n in body if n.get("id")]

        mark = api_client.post(
            f"{base_url}/api/notifications/read",
            headers=bearer(customer_token),
            json={"ids": raw_ids},
            timeout=15,
        )
        assert mark.status_code == 200, mark.text


# --- Health & Server CRUD ----------------------------------------------
class TestHealthAndServers:
    def test_health_statuses(self, api_client, base_url, admin_token, bearer):
        r = api_client.get(
            f"{base_url}/api/admin/health", headers=bearer(admin_token), timeout=20
        )
        assert r.status_code == 200
        entries = r.json()
        assert isinstance(entries, list) and entries
        for e in entries:
            assert "status" in e

    def test_server_crud(self, api_client, base_url, admin_token, bearer):
        product_id = "number-change-us"
        payload = {
            "values": {
                "product_id": product_id,
                "name": f"TEST_Op_{uuid.uuid4().hex[:5]}",
                "enabled": True,
                "customer_price": 79,
            }
        }
        create = api_client.post(
            f"{base_url}/api/admin/servers",
            headers=bearer(admin_token),
            json=payload,
            timeout=15,
        )
        assert create.status_code in (200, 201), create.text
        sid = create.json().get("id") or create.json().get("server", {}).get("id")
        assert sid, create.text

        # Toggle enabled off
        put = api_client.put(
            f"{base_url}/api/admin/servers/{sid}",
            headers=bearer(admin_token),
            json={"values": {"enabled": False}},
            timeout=15,
        )
        assert put.status_code == 200, put.text
        body = put.json()
        # Field may be at root or under 'server'
        enabled_val = body.get("enabled")
        if enabled_val is None and isinstance(body.get("server"), dict):
            enabled_val = body["server"].get("enabled")
        assert enabled_val is False, body

        # Delete
        d = api_client.delete(
            f"{base_url}/api/admin/servers/{sid}",
            headers=bearer(admin_token),
            timeout=15,
        )
        assert d.status_code in (200, 204), d.text
