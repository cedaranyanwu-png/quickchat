# QuickChat Flutterwave v4 payments

QuickChat uses Flutterwave v4 for paid posts, 30-day creator/community passes and points top-ups. The v4 API uses OAuth 2.0 client credentials and the v4 payment orchestration flow. QuickChat keeps 10% of creator sales and pays the creator's 90% share through Flutterwave's v4 transfer API.

## Server configuration

Set these values in `server/.env`:

```env
FLW_ENV=test
FLW_CLIENT_ID=
FLW_CLIENT_SECRET=
FLW_ENCRYPTION_KEY=
FLW_WEBHOOK_SECRET=
FLW_WEBHOOK_URL=
PUBLIC_APP_URL=
```

- `FLW_ENV=test` uses Flutterwave's sandbox API. Use `live` for production.
- `FLW_CLIENT_ID` and `FLW_CLIENT_SECRET` are the v4 OAuth credentials. Keep the client secret server-side.
- `FLW_ENCRYPTION_KEY` is the v4 AES-256 encryption key used by the QuickChat checkout page to encrypt card fields before submission.
- `FLW_WEBHOOK_SECRET` is the secret configured for the Flutterwave webhook.
- `FLW_WEBHOOK_URL` must be the public HTTPS URL ending in `/api/webhooks/flutterwave`.
- `PUBLIC_APP_URL` must be the public HTTPS origin with no path.

Flutterwave v4 authentication uses OAuth 2.0 access tokens; QuickChat obtains and caches a short-lived token on the server. citeturn326613search1turn326613search2

## Payment flow

1. QuickChat creates a pending payment checkout in its own database.
2. The customer opens the QuickChat v4 payment page.
3. Card fields are encrypted in the browser with AES-256 before they are sent to QuickChat.
4. QuickChat sends the encrypted card payload to Flutterwave's v4 orchestrator.
5. If Flutterwave requires 3-D Secure or another authorization step, the customer is redirected to Flutterwave.
6. Flutterwave sends a `charge.completed` webhook.
7. QuickChat verifies the charge with Flutterwave before unlocking content or crediting points.

Flutterwave's v4 documentation recommends verifying the final charge status, amount, currency and reference before providing value. citeturn266342search3turn584518search0

## Creator payout accounts

QuickChat creates Flutterwave v4 transfer recipients for creator payout accounts.

When a creator connects a Nigerian bank account, QuickChat:

1. Retrieves the v4 Nigerian bank list.
2. Resolves the bank account name through the v4 bank account lookup API.
3. Creates a v4 transfer recipient.
4. Stores the returned recipient ID and only a masked account number.

Creator earnings are transferred using Flutterwave's v4 transfer API. citeturn737014search0turn811053search2

## Webhooks

Configure the exact public webhook URL in Flutterwave:

`https://YOUR-DOMAIN/api/webhooks/flutterwave`

QuickChat verifies the v4 `flutterwave-signature` HMAC-SHA256 header against `FLW_WEBHOOK_SECRET`. Duplicate webhook events are idempotently recorded.

Flutterwave documents the v4 webhook signature and recommends verifying critical payment data server-side. citeturn326613search4

## Production

Before switching to live mode:

- Set `FLW_ENV=live`.
- Replace the sandbox client ID, client secret and encryption key with your live v4 credentials.
- Configure the live webhook in Flutterwave.
- Whitelist the server IP if your Flutterwave transfer configuration requires it.
- Test one small payment before enabling creator payouts.

Flutterwave's current v4 production API base is `https://f4bexperience.flutterwave.com`; sandbox uses `https://developersandbox-api.flutterwave.com`. citeturn401663search5
