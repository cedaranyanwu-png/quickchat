# QuickChat platform backups

## Current implementation

The administrator Backup & Recovery section creates a ZIP archive containing:
- A JSON snapshot of every application database table discovered in the configured SQLite, PostgreSQL, or MySQL database.
- Uploaded image and video files matching QuickChat's generated media filename convention.
- A manifest with database type, table/row counts, archive timestamp, creator ID, and media totals.

Archives are stored in `private-backups/` at the repository root by default, outside the React build's public directory. Set `BACKUP_DIRECTORY` to an absolute path on a persistent volume when deploying.

## Access control

The module adds four RBAC permissions:
- `backups.view`
- `backups.create`
- `backups.download`
- `backups.delete`

The existing Super Administrator receives all permissions. The built-in Administrator role receives the backup permissions through the normal permission seeding process. Other roles must be granted the permissions by an authorized administrator.

## Scheduled snapshots

Scheduling is disabled by default. To enable it, configure the server environment:

```env
BACKUP_SCHEDULE_ENABLED=true
BACKUP_CRON=0 2 * * *
BACKUP_RETENTION_DAYS=30
BACKUP_DIRECTORY=/persistent/private-backups
TZ=Africa/Lagos
```

The default cron expression is 02:00 server-local time. Set the process timezone explicitly (for example `TZ=Africa/Lagos`) if the host does not already use the intended timezone. Retention cleanup runs after a successful scheduled backup.

## Operational and recovery limitations

This is the first backup foundation, not a completed disaster-recovery system:
- Snapshot generation currently materializes table rows and archive entries in process memory. Large production databases or media libraries may exceed available memory; test on a representative staging dataset before enabling.
- The database and media snapshot is not a transactionally consistent cross-system point-in-time snapshot while writes continue.
- Archives are not yet encrypted at rest. Restrict filesystem access, use encrypted persistent storage, and protect downloaded archives as sensitive production data (they include account records and credential hashes).
- Google Drive OAuth/multi-account upload is not implemented in this phase.
- Automated database restoration and restore drills are not implemented. Do not treat a downloaded archive as a verified recovery procedure until restore tooling and staging validation are added.
- The SHA-256 checksum is calculated and checked against the persisted archive after writing; retain it with the backup record when transferring archives.

Do not enable scheduled backups on a production host until persistent disk capacity, access restrictions, and backup frequency have been reviewed.
