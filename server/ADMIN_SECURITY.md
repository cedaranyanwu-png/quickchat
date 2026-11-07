# QuickChat administration security

## Main platform owner bootstrap

The first main-owner account is created by the one-time bootstrap in `server/admin-owner.js`. It runs after the existing user and RBAC tables have been initialized.

Set both variables in the private server environment before the first API startup:

- `SUPER_ADMIN_BOOTSTRAP_EMAIL`: the private email address that will own the platform.
- `SUPER_ADMIN_BOOTSTRAP_PASSWORD`: the one-time initial password.

The bootstrap creates the account with the display name **Cedar Anyanwu**, username **admin**, a bcrypt password hash, the Super Administrator role, and the main-owner designation. It marks the account as requiring a password change. The supplied password is never logged or returned by an API.

The bootstrap is idempotent. Once `platform_ownership` contains its owner row, subsequent starts do not recreate the account, reset its password, or change ownership. If another Super Administrator already exists, bootstrap stops rather than silently taking ownership. Resolve an existing administrator setup explicitly before attempting a first-owner bootstrap.

After the first successful login, QuickChat redirects the owner to `/admin/first-login`. The API independently blocks all authenticated API requests except the password-change endpoint until the initial password is changed. The new password must contain at least 12 characters and is stored using bcrypt. The password-change event is audited without credentials or hashes.

After the first successful bootstrap, remove `SUPER_ADMIN_BOOTSTRAP_PASSWORD` from the deployment environment. Do not put the initial password in source control, deployment logs, tickets, or public documentation. The bootstrap will not reset an existing account password.

## Owner credential management

The main owner can change the administrator username at `PUT /api/admin/security/username`. The request requires the current password and a unique username. Password changes require the current password and a matching confirmation. Security events are written to `admin_audit_logs`.

## Ownership transfer

Only the current main owner can call `POST /api/admin/ownership/transfer`. The request requires the current password, the target user ID, and the target username typed exactly. The target is granted the Super Administrator role before the owner designation is transferred. The transfer is audited. Ordinary administrators cannot assign the Super Administrator role or change the owner designation.

## Environment example

Copy `server/.env.example` to `server/.env`, set the bootstrap email and one-time password privately, and restart the API once. Do not add production secrets to the repository.
