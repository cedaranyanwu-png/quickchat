# QuickChat WhatsApp verification and service notifications

WhatsApp is the account activation method for password and Google sign-in. Email verification is not required to activate or sign in to an account. Email remains available for account contact and password recovery.

## Railway / server environment variables

Set these variables on the QuickChat API service:

- `WHATSAPP_PHONE_NUMBER_ID` — Phone Number ID from Meta WhatsApp Manager.
- `WHATSAPP_ACCESS_TOKEN` — Permanent or system-user access token with WhatsApp messaging permissions.
- `WHATSAPP_API_VERSION` — Optional Graph API version; defaults to `v22.0`.
- `WHATSAPP_VERIFICATION_TEMPLATE` — Optional approved template name; defaults to `quickchat_phone_verification`.
- `WHATSAPP_NOTIFICATION_TEMPLATE` — Optional approved template name; defaults to `quickchat_admin_notification`.
- `WHATSAPP_TEMPLATE_LANGUAGE` — Optional template language code; defaults to `en`.
- `PUBLIC_APP_URL` — Public QuickChat frontend origin, for example `https://quickchat.example.com`. Verification links are built from this value in production.

Do not place access tokens in frontend environment variables or commit them to Git.

## Required Meta message templates

Create and get approval for these WhatsApp templates in Meta WhatsApp Manager. The template names and language must match the server environment variables.

### 1. `quickchat_phone_verification`

- Category: Utility
- Language: `en`
- Body example: `Confirm your QuickChat account by opening this link: {{1}}. This link expires in 30 minutes. If you did not create this account, ignore this message.`
- Body parameter 1: the one-time QuickChat verification URL.

### 2. `quickchat_admin_notification`

- Category: Utility
- Language: `en`
- Body example: `QuickChat service notification: {{1}}. {{2}}`
- Body parameter 1: notification title.
- Body parameter 2: administrator message.

Meta must approve the templates before production messages can be sent. The server sends template messages, not free-form outbound WhatsApp messages.

## Account verification behavior

1. Registration requires an international WhatsApp number (for example `+2348012345678`).
2. QuickChat creates the account in an inactive/unverified state and sends a one-time link to that WhatsApp number.
3. The link expires after 30 minutes and can be used once.
4. Password login is blocked until the WhatsApp link is confirmed.
5. Google sign-in also requires a WhatsApp number and verification. Existing Google accounts without a WhatsApp number are prompted to add one.
6. Users can request another link. Resend requests are rate-limited.
7. Legacy email verification endpoints remain for compatibility but are no longer an activation requirement.

Opening the link demonstrates access to the WhatsApp number that received the message. It does not verify a user's legal identity.

## Admin service notifications

The Admin portal includes **WhatsApp notifications**. Administrators with the `notifications.send` permission can send an outage, maintenance, or restoration notice to users who:

- have a WhatsApp number;
- have completed WhatsApp verification; and
- explicitly opted in to WhatsApp service notifications.

Broadcasts are processed in batches of up to 250 recipients. Continue with **Send next batch** until the admin panel reports that no further recipients remain. The activity log's `accepted` status means Meta accepted the API request; it is not proof of delivery. Delivery receipts are not yet integrated.

## Operational notes

- The WhatsApp Cloud API credentials must be configured on the API service before registration verification or admin notifications can be delivered.
- WhatsApp template approval and business messaging limits are controlled by Meta.
- Keep a separate support/recovery path for users who lose access to their registered WhatsApp number.
