"""Environment-backed configuration. Secrets never leave this process."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET must be configured in backend/.env")
JWT_ALGORITHM = "HS256"
JWT_ISSUER = "vth-network-api"
JWT_AUDIENCE = "vth-network-app"
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "owner")
ADMIN_PASSWORD_HASH = os.environ.get("ADMIN_PASSWORD_HASH", "")
ADMIN_TOKEN_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "120"))
CUSTOMER_TOKEN_DAYS = 7
SETTINGS_ENCRYPTION_KEY = os.environ.get("SETTINGS_ENCRYPTION_KEY") or JWT_SECRET
CRON_SECRET = os.getenv("CRON_SECRET", "")
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
PRODUCTION = os.environ.get("ENVIRONMENT", "production").lower() == "production"
DEV_FALLBACK_USER_ENABLED = os.environ.get("DEV_FALLBACK_USER_ENABLED", "false").lower() == "true"
PROVIDER_TIMEOUT_DEFAULT = 6.0
