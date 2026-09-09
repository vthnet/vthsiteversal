# VTH NETWORK Store

Production-oriented Telegram Mini App / web storefront backed by FastAPI + MongoDB.

## Stack
- Expo Router / React Native Web frontend
- FastAPI backend
- MongoDB via Motor
- Server-side Telegram WebApp authentication
- Owner/admin JWT sessions with bcrypt
- Encrypted admin secrets
- Provider adapters for TG-Lion, LZT Market and TemporaSMS
- FAMPAY Auto UPI verification adapter
- Configurable Auto Crypto adapter
- Wallet, orders, refunds, promo codes, notifications and audit logs

## Production defaults
- There is no customer-facing test/demo purchase mode.
- Development Telegram fallback is **OFF** by default.
- Suppliers are **disabled until credentials are configured**; the storefront never shows fake inventory when a supplier is unavailable.
- Automatic payment methods are **disabled until configured**.
- Customer APIs do not expose provider identity, provider cost or credentials.

## Deployment
See `DEPLOYMENT.md` for Vercel + MongoDB setup and first-admin configuration.
