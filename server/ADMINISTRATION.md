# QuickChat Administration

The administration centre is served by the existing React application at `/admin`. Its API is mounted under `/api/admin` and uses the existing JWT bearer authentication. Administrative authorization is evaluated from database role assignments on every protected request; frontend route visibility is not an authorization boundary.

## First Super Administrator

1. Register a normal QuickChat account using the email address that will own platform administration.
2. Stop the API.
3. In `server/.env`, set `SUPER_ADMIN_EMAIL` to that exact account email.
4. Restart the API. Startup migrations create the administration tables, seed the system roles and permission catalogue, then assign the Super Administrator role to the matching account.
5. Sign in with that account and open `/admin`.

Do not set this variable to an email address that has not been registered. Do not leave it set to a shared or publicly accessible mailbox. The value is read at startup; changing it does not automatically remove an existing Super Administrator assignment.

## Initial roles

- Super Administrator: all registered permissions, including administrator and role governance.
- Administrator: operational platform management, excluding Super Administrator and role-governance controls.
- Moderator: report and content moderation permissions.
- Verification Officer: user/community verification and badge permissions.
- Community Manager: community and community-report permissions.
- Support Agent: limited account/report visibility and complaint resolution.

Custom role creation and role assignment are permission-checked by the backend. A caller cannot grant permissions they do not hold. Only a Super Administrator can grant the Super Administrator role. The last active Super Administrator is protected from deactivation.

## Implemented API surface

All endpoints below require a valid QuickChat bearer token.

- `GET /api/admin/me` — current administrative roles and permissions.
- `GET /api/admin/overview` — live database totals and recent audit actions.
- `GET /api/admin/users?page=1&limit=25&search=` — paginated user directory.
- `GET /api/admin/roles`, `POST /api/admin/roles`, `PUT /api/admin/roles/:id`, `DELETE /api/admin/roles/:id` — role catalogue and management.
- `POST /api/admin/admins/:id/roles` — assign administrative roles.
- `POST /api/admin/admins/:id/deactivate` and `POST /api/admin/admins/:id/reactivate` — administrative access lifecycle.
- `GET /api/admin/audit-logs` — append-only audit history.
- `GET /api/admin/verifications` and `POST /api/admin/verifications/:id/decision` — verification review.
- `POST /api/verification/application` — submit a user verification application.
- `POST /api/reports` — submit a moderation report.
- `GET /api/admin/reports`, `POST /api/admin/reports/:id/assign`, `POST /api/admin/reports/:id/resolve` — report workflow.
- `POST /api/admin/users/:id/suspend`, `POST /api/admin/users/:id/ban`, `POST /api/admin/users/:id/restore`, `POST /api/admin/users/:id/deletion-request` — account enforcement workflow.

## Data and enforcement notes

- Existing users and content are not recreated or deleted by the administration migration.
- The new governance tables are created with `CREATE TABLE IF NOT EXISTS`; role/permission seeds are idempotent.
- Active bans and unexpired suspensions are checked by the shared authentication middleware, so they block protected API access rather than merely changing an admin-page label.
- Account deletion currently creates a scheduled, auditable deletion request. It deliberately does not hard-delete user data; a separately reviewed retention/anonymization job must be implemented before deletion can be enabled in production.
- Audit entries are exposed read-only through the API. Do not grant direct database write access to ordinary administrators.
- Verification decisions currently update the existing `users.verified` flag. Badge catalog presentation, community verification, detailed moderation actions, content restoration, automated expiry jobs, notification delivery, and full admin user-action controls remain follow-on implementation work.
- Run the existing application tests and a migration backup against a staging database before deploying to production.
