# VTH NETWORK — Production Architecture

VTH NETWORK is a production Telegram Mini App / web marketplace backed by FastAPI and MongoDB. The customer application must use live backend data only; no fake inventory or simulated purchases are exposed.

## Provider routing
- TG-Lion: premium Telegram accounts
- LZT Market: affordable Telegram accounts
- TemporaSMS: Telegram number-change and WhatsApp services

## Payments
- Auto UPI uses the configured FamPay-compatible API and verifies gateway order IDs server-side.
- Auto Crypto is enabled only when its provider credentials and endpoints are configured.
- Manual UPI/Crypto remain admin-configurable.

## Operations
- Admin panel controls catalog, providers, servers, orders, users, payments, recharge methods, promos, Telegram bot settings, broadcasts, logs, audit logs, security and health.
- MongoDB stores audit and notification logs.
- Telegram operational notifications are awaited before request completion so serverless functions do not lose fire-and-forget tasks.
- Long-running workers are not used. Vercel Cron / an external scheduler invokes the protected maintenance endpoint for provider reconciliation and stale reservation refunds.
- Customer order/payment verification is also request-driven.

## Deployment
- Frontend: Expo web export hosted by Vercel.
- API: FastAPI exposed through `api/index.py`.
- Database: MongoDB via `MONGO_URL` and `DB_NAME`.
- Production secrets are supplied through environment variables or the encrypted admin settings store.
