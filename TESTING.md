# Testing

## Source checks completed
- Python backend source compiles successfully with `python -m compileall backend`.
- `httpx` is declared explicitly because provider/payment adapters use it.
- Production defaults disable development Telegram fallback and all automatic payment methods until configured.
- Customer-facing simulated/test purchase mode and fake inventory fallback were removed.
- Same-origin Vercel API routing is supported by the frontend client and `vercel.json`.

## Staging integration tests
`backend/tests/test_vth_regression.py` is opt-in and never runs by default.

For a disposable staging environment, set:
- `VTH_RUN_INTEGRATION_TESTS=1`
- `VTH_API_BASE=https://your-staging-domain`
- `VTH_TEST_ADMIN_USERNAME=...`
- `VTH_TEST_ADMIN_PASSWORD=...`
- `DEV_FALLBACK_USER_ENABLED=true` only on that staging instance if using the development Telegram fixture.

Never use the integration suite against production or real customer/payment data.

The packaging environment did not contain the Python/Node dependency trees, and dependency installation exceeded the available execution window, so browser E2E and a live MongoDB/provider verification could not be truthfully claimed as completed here.
