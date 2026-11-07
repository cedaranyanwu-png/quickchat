# QuickChat WhatsApp service notifications (optional)

**WhatsApp is no longer used to register, activate, or sign in to QuickChat accounts.** Users can create an account with their name, username, email, and password, or use Google sign-in. This integration is retained only for optional administrator service announcements.

## Railway environment variables

Set these on the QuickChat API service only if you intend to use administrator WhatsApp announcements:

- `WHATSAPP_PHONE_NUMBER_ID` — Phone Number ID from Meta WhatsApp Manager.
- `WHATSAPP_ACCESS_TOKEN` — Server-side access token with WhatsApp messaging permissions.
- `WHATSAPP_API_VERSION` — Optional Graph API version; defaults to `v22.0`.
- `WHATSAPP_NOTIFICATION_TEMPLATE` — Approved template name; defaults to `quickchat_admin_notification`.
- `WHATSAPP_TEMPLATE_LANGUAGE` — Optional template language code; defaults to `en`.

Never put the access token in frontend environment variables or commit it to Git.

## Notification template

Create and get approval for a Utility template named `quickchat_admin_notification` in Meta WhatsApp Manager.

Suggested body:

`QuickChat service notification: {{1}}. {{2}}`

- Parameter 1: notification title.
- Parameter 2: administrator message.

## Administrator announcements

The Admin portal can send maintenance, outage, or restoration notices to users who have a WhatsApp number and explicitly opted in to service notifications. Administrators need the `notifications.send` permission.

Broadcasts are processed in batches of up to 250 recipients. Continue with **Send next batch** until the admin panel reports that no recipients remain. An `accepted` activity status means Meta accepted the API request; it is not proof of delivery. Delivery receipts are not integrated.

## Account access

- WhatsApp is not required during registration.
- WhatsApp verification is not required during password login or Google sign-in.
- Existing WhatsApp verification fields on older accounts are ignored by authentication.
- Users can continue using their existing QuickChat email and password or Google sign-in.
