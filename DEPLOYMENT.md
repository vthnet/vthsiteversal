# VTH NETWORK production deployment

## Vercel
1. Import the repository into Vercel.
2. Keep the repository root as the project root.
3. Vercel uses `vercel.json` to build the Expo web app and route `/api/*` to FastAPI.
4. Add the variables from `backend/.env.example` in Vercel Project Settings. Do not commit real secrets.
5. Deploy and open `/api/health` to verify the backend function is reachable.

## MongoDB
Use a production MongoDB database and allow the Vercel serverless runtime to connect from the configured network policy. The application creates its indexes during startup.

## First admin setup
Generate a bcrypt password hash locally, then set `ADMIN_PASSWORD_HASH` in Vercel. Do not put the plaintext password in source control.

## Admin Panel
After deployment, open `/admin`, sign in, then configure provider credentials and payment settings under the Admin Panel. Secrets are encrypted at rest and are never returned to customer APIs.

### Provider defaults
- TG-Lion: `https://api.tg-lion.net`
- LZT Market: `https://prod-api.lzt.market`
- TemporaSMS: `https://api.temporasms.com/stubs/handler_api.php`

Providers are disabled by default. Enable a provider only after its API key and endpoint have been tested from Admin → Health.

### Auto UPI
The Auto UPI adapter supports the supplied FAMPAY service:
- QR: `https://fampay.anujbots.xyz/qr.php?upi=...&amount=...`
- Verification: `https://fampay.anujbots.xyz/verify.php?order_id=...&api_key=...`

Set the UPI ID and API key in Admin → Methods → Auto UPI. Wallet credit occurs only after server-side verification and an amount check.

### Auto Crypto
The adapter is generic and server-side. Configure the provider base URL, API key, create-invoice path and verify-invoice path in Admin → Methods → Auto Crypto.

## Production behavior
- Customer-facing test/demo purchase simulation has been removed.
- Development Telegram fallback defaults to **OFF**.
- Unconfigured suppliers are shown as unavailable rather than fake inventory.
- Automatic payment methods are disabled until configured.
- Customer APIs never expose provider names, API keys or provider costs.


## Serverless maintenance
The API no longer starts a persistent background worker. Vercel Cron calls `/api/cron/maintenance` once per day for maintenance/refund/provider reconciliation. Set `CRON_SECRET` in Vercel Environment Variables; the same secret protects the cron endpoint. Customer order/payment verification is also performed on-demand through the API, so the system does not depend on a long-running worker.

For frequent supplier reconciliation or high-volume broadcast delivery, use a paid Vercel plan with a more frequent cron schedule or an external scheduler that calls the protected endpoint.
