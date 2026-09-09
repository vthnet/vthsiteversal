import os
import pytest
import requests

# Prefer public URL from frontend .env so we exercise the ingress path.
def _load_public_url() -> str:
    override = os.environ.get("VTH_API_BASE")
    if override:
        return override.rstrip("/")
    try:
        with open("/app/frontend/.env", "r", encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    except Exception:
        pass
    return "http://127.0.0.1:8001"


BASE_URL = _load_public_url()


@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def customer_token(api_client) -> str:
    r = api_client.post(f"{BASE_URL}/api/auth/telegram", json={}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token(api_client) -> str:
    r = api_client.post(
        f"{BASE_URL}/api/admin/auth/login",
        json={"username": os.environ.get("VTH_TEST_ADMIN_USERNAME", "owner"), "password": os.environ.get("VTH_TEST_ADMIN_PASSWORD", "")},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def bearer():
    return _bearer
