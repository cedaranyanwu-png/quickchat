# Flutterwave payments setup

QuickChat uses Flutterwave hosted checkout for premium posts and 30-day creator or community passes. Payments use NGN. QuickChat keeps 10% and routes the remaining 90% to the creator's Flutterwave subaccount, before provider processing charges.

## Configure the server

Add these values to `server/.env`:

```env
FLW_SECRET_KEY=
FLW_SECRET_HASH=
FLW_WEBHOOK_URL=
PUBLIC_APP_URL=
```

- `FLW_SECRET_KEY`: the Flutterwave secret API key, kept on the server. Never put it in a `REACT_APP_` variable or commit it.
- `FLW_SECRET_HASH`: the webhook secret hash configured in the Flutterwave dashboard. It is separate from the API key.
- `FLW_WEBHOOK_URL`: the public HTTPS URL ending in `/api/webhooks/flutterwave`.
- `PUBLIC_APP_URL`: the public HTTPS origin for this app, with no path.

In the Flutterwave dashboard, register the exact `FLW_WEBHOOK_URL` and set its secret hash to the same value as `FLW_SECRET_HASH`. The server verifies the `verif-hash` header and then verifies each transaction with Flutterwave before unlocking content or activating a pass. The browser return URL alone never marks a purchase as paid.

For local development, use a public HTTPS tunnel for the app and webhook; Flutterwave cannot deliver webhooks to localhost. Restart the API after editing `server/.env`.

## Creator payout setup

Only real user accounts can enable paid content. In Settings, a creator selects a Nigerian bank, enters a 10-digit account number, checks the resolved account holder name, and confirms it. QuickChat creates a Flutterwave subaccount and stores its IDs, bank name, account name, and masked account number. The full account number is sent to Flutterwave for account resolution and subaccount creation; QuickChat does not store it.

Creators can charge ₦500 or more for premium posts. Fan and community passes start at ₦3,000 for 30 days. New checkouts include the creator subaccount and the 10% platform share. Settlement timing and applicable processing fees follow Flutterwave's account and settlement rules.

## Payment references

- [Flutterwave Standard checkout](https://developer.flutterwave.com/docs/flutterwave-standard-1)
- [Flutterwave split payments](https://developer.flutterwave.com/docs/split-payments)
- [Flutterwave webhooks](https://developer.flutterwave.com/docs/webhooks)
- [Flutterwave transaction verification](https://developer.flutterwave.com/docs/transaction-verification)
