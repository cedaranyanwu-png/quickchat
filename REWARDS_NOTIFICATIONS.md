# QuickChat Rewards Programme and Notifications

## Rewards economy

This module is intentionally separate from the existing creator-sales wallet and purchased platform points.

- Verified registration: 100 programme points, awarded once.
- Daily return: one Star per Nigeria-local calendar day. Users claim from `/rewards`.
- Star conversion: 100 Stars become 100 programme points. Complete 100-Star batches are converted together.
- Referrals: 20 points after the referred account verifies its email and claims its first daily Star. A referral can be credited once; self-referrals and duplicate referred accounts are rejected.
- Point conversion: 100 programme points become ₦1,000 (₦10 per point).
- Withdrawal: minimum ₦100; an active verified payout account is required. Admin approval and manual bank transfer are required.

The programme has its own wallet and immutable-reference ledger tables (`qc_reward_wallets`, `qc_reward_ledger`). It does not alter the older creator earnings conversion rules. Daily claims are unique per user and Nigeria-local date. Wallet debits are conditional on sufficient balance.

## Member endpoints

All endpoints require a verified member bearer token:

- `GET /api/rewards-program/me`
- `POST /api/rewards-program/daily-claim`
- `POST /api/rewards-program/convert-stars`
- `POST /api/rewards-program/convert-points` with `{ "points": 100 }`
- `GET /api/rewards-program/withdrawals`
- `POST /api/rewards-program/withdrawals` with `{ "amount": 100 }`
- `POST /api/rewards-program/tasks/:taskId/complete`
- `GET /api/rewards-program/popup`

The rewards page is available from Menu → Rewards & tasks.

## Administrator endpoints

- `GET /api/admin/rewards-program/overview`
- `POST /api/admin/rewards-program/tasks`
- `PATCH /api/admin/rewards-program/tasks/:id`
- `GET /api/admin/rewards-program/withdrawals?status=pending|approved|paid|rejected`
- `POST /api/admin/rewards-program/withdrawals/:id/review` with `approve`, `reject`, or `paid`
- `GET /api/admin/notifications`
- `POST /api/admin/notifications`

The admin console exposes reward tasks/withdrawal review and a Notifications centre. Notification campaigns support in-app inbox, email (through the existing configured email provider), and in-app popup delivery. Audiences include everyone, verified users, recently active users, inactive users, and new users. Automated/synthetic accounts are excluded.

## Operational notes

- Email campaigns are sent sequentially in a background task by the running API process. For very large campaigns or guaranteed retry after process restarts, move campaign delivery to a persistent queue/worker before scaling multiple API replicas.
- A notification email is counted as successful only when the configured provider accepts it; preview/log-only email mode is recorded as failed, not as delivered.
- Programme task rewards are restricted to server-verifiable profile completion. Do not enable user self-reported tasks that credit cash-convertible points without adding an approval/proof workflow.
- Withdrawal approval does not initiate a bank transfer. The administrator must transfer the funds externally and then mark the request paid.
