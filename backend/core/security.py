"""Authentication, authorization and secret handling.

- Admin: bcrypt-verified password (hash lives in backend .env) -> short-lived JWT
  with role claim + server-side session record (revocable). Optional Telegram
  owner-ID login once the bot token is configured.
- Customer: Telegram WebApp initData verified server-side (HMAC-SHA256 with the
  bot token). Development fallback user is only available when explicitly
  enabled in the backend environment.
- Secrets: encrypted at rest (Fernet) and always masked in API responses.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import timedelta
from typing import Any, Dict, Optional
from urllib.parse import parse_qsl
from uuid import uuid4

import bcrypt
import jwt
from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from core import config
from core.db import admin_sessions, audit_logs, strip_id, users, utcnow

bearer = HTTPBearer(auto_error=False)

_fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(config.SETTINGS_ENCRYPTION_KEY.encode()).digest()))
_DUMMY_HASH = bcrypt.hashpw(b"vth-dummy-password", bcrypt.gensalt(rounds=12))
_login_failures: Dict[str, list[float]] = {}
LOGIN_MAX_ATTEMPTS = 6
LOGIN_WINDOW_SECONDS = 600


# ---------------------------------------------------------------- secrets
def encrypt_secret(value: str) -> str:
    return _fernet.encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    try:
        return _fernet.decrypt(value.encode()).decode()
    except (InvalidToken, ValueError):
        return ""


def mask_secret(value: str) -> str:
    if not value:
        return ""
    tail = value[-4:] if len(value) > 8 else ""
    return f"{'•' * 16}{tail}"


# ------------------------------------------------------------ admin auth
def _client_ip(request: Request) -> str:
    return request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "unknown")


def _throttled(ip: str) -> bool:
    now = time.time()
    attempts = [t for t in _login_failures.get(ip, []) if now - t < LOGIN_WINDOW_SECONDS]
    _login_failures[ip] = attempts
    return len(attempts) >= LOGIN_MAX_ATTEMPTS


def verify_admin_password(username: str, password: str) -> bool:
    if not config.ADMIN_PASSWORD_HASH:
        return False
    username_ok = secrets.compare_digest(username, config.ADMIN_USERNAME)
    candidate = config.ADMIN_PASSWORD_HASH.encode() if username_ok else _DUMMY_HASH
    try:
        password_ok = bcrypt.checkpw(password.encode(), candidate)
    except ValueError:
        return False
    return password_ok and username_ok


async def issue_admin_token(request: Request, method: str, subject: str) -> Dict[str, Any]:
    now = utcnow()
    expires = now + timedelta(minutes=config.ADMIN_TOKEN_MINUTES)
    jti = str(uuid4())
    payload = {"sub": subject, "role": "owner", "jti": jti, "iss": config.JWT_ISSUER, "aud": config.JWT_AUDIENCE, "iat": now, "exp": expires}
    token = jwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)
    await admin_sessions.insert_one({"jti": jti, "subject": subject, "method": method, "ip": _client_ip(request), "created_at": now, "expires_at": expires, "revoked_at": None})
    await audit("admin_login", subject, {"method": method, "ip": _client_ip(request)})
    return {"access_token": token, "token_type": "bearer", "expires_in": config.ADMIN_TOKEN_MINUTES * 60, "role": "owner", "username": subject}


async def admin_login(request: Request, username: str, password: str) -> Dict[str, Any]:
    ip = _client_ip(request)
    if _throttled(ip):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    if not verify_admin_password(username, password):
        _login_failures.setdefault(ip, []).append(time.time())
        await audit("admin_login_failed", username[:64], {"ip": ip})
        raise HTTPException(status_code=401, detail="Invalid credentials")
    _login_failures.pop(ip, None)
    return await issue_admin_token(request, "password", config.ADMIN_USERNAME)


async def get_current_admin(request: Request, credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> Dict[str, Any]:
    unauthorized = HTTPException(status_code=401, detail="Admin authentication required")
    if credentials is None:
        raise unauthorized
    try:
        claims = jwt.decode(credentials.credentials, config.JWT_SECRET, algorithms=[config.JWT_ALGORITHM], issuer=config.JWT_ISSUER, audience=config.JWT_AUDIENCE, options={"require": ["sub", "role", "jti", "exp"]})
    except jwt.PyJWTError:
        raise unauthorized
    if claims.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Insufficient role")
    session = await admin_sessions.find_one({"jti": claims["jti"], "revoked_at": None, "expires_at": {"$gt": utcnow()}})
    if session is None:
        raise unauthorized
    request.state.admin = claims
    return claims


async def revoke_admin_session(credentials: Optional[HTTPAuthorizationCredentials]) -> None:
    if credentials is None:
        return
    try:
        claims = jwt.decode(credentials.credentials, config.JWT_SECRET, algorithms=[config.JWT_ALGORITHM], issuer=config.JWT_ISSUER, audience=config.JWT_AUDIENCE)
        await admin_sessions.update_one({"jti": claims["jti"]}, {"$set": {"revoked_at": utcnow()}})
        await audit("admin_logout", claims.get("sub", ""), {})
    except jwt.PyJWTError:
        return


async def audit(action: str, actor: str, detail: Dict[str, Any]) -> None:
    safe_detail = {k: v for k, v in detail.items() if not any(s in k.lower() for s in ("token", "secret", "password", "api_key", "key"))}
    await audit_logs.insert_one({"id": str(uuid4()), "action": action, "actor": actor, "detail": safe_detail, "created_at": utcnow().isoformat()})


# --------------------------------------------------------- telegram auth
def verify_telegram_init_data(init_data: str, bot_token: str, max_age_seconds: int = 86400) -> Optional[Dict[str, Any]]:
    """Validate Telegram WebApp initData (HMAC-SHA256). Returns the user dict or None."""
    if not init_data or not bot_token:
        return None
    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = pairs.pop("hash", None)
    if not received_hash:
        return None
    check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    computed = hmac.new(secret_key, check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(computed, received_hash):
        return None
    auth_date = int(pairs.get("auth_date", "0") or 0)
    if auth_date and time.time() - auth_date > max_age_seconds:
        return None
    try:
        return json.loads(pairs.get("user", "{}"))
    except json.JSONDecodeError:
        return None


DEV_USER = {"id": "dev-telegram-user", "telegram_id": "108247193", "first_name": "Alex", "last_name": "VTH", "username": "alex_vth", "language": "en", "avatar_url": None, "role": "customer", "source": "development-fallback"}


def issue_customer_token(user_id: str) -> str:
    now = utcnow()
    payload = {"sub": user_id, "role": "customer", "iss": config.JWT_ISSUER, "aud": config.JWT_AUDIENCE, "iat": now, "exp": now + timedelta(days=config.CUSTOMER_TOKEN_DAYS)}
    return jwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)


async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> Dict[str, Any]:
    unauthorized = HTTPException(status_code=401, detail="Telegram session required")
    if credentials is None:
        raise unauthorized
    try:
        claims = jwt.decode(credentials.credentials, config.JWT_SECRET, algorithms=[config.JWT_ALGORITHM], issuer=config.JWT_ISSUER, audience=config.JWT_AUDIENCE)
    except jwt.PyJWTError:
        raise unauthorized
    if claims.get("role") != "customer":
        raise HTTPException(status_code=403, detail="Customer session required")
    user = await users.find_one({"id": claims["sub"]})
    if user is None:
        raise unauthorized
    await users.update_one({"id": user["id"]}, {"$set": {"last_seen": utcnow().isoformat()}})
    return strip_id(user) or {}
