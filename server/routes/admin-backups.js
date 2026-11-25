const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { asyncRoute } = require('./utils');
const { requirePermission, audit } = require('./admin');
const engine = require('../backup-engine');
const r2 = require('../r2-storage');
const { getSetting, setSetting } = require('../platform-settings');

const router = express.Router();

router.get('/admin/r2-buckets', requirePermission('settings.manage'), asyncRoute(async (_req, res) => {
  const raw = await getSetting('r2_buckets', '');
  let saved = { buckets: [], activeId: null };
  try { if (raw) saved = JSON.parse(raw); } catch (_) {}
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({
    activeId: saved.activeId || (!saved.buckets?.length && r2.configFromEnv('R2') ? 'railway-env' : null),
    buckets: (Array.isArray(saved.buckets) && saved.buckets.length ? saved.buckets : (r2.configFromEnv('R2') ? [{ ...r2.configFromEnv('R2'), id: 'railway-env', name: 'Current Railway R2 configuration', enabled: true }] : [])).map((bucket) => ({
      id: bucket.id, name: bucket.name, endpoint: bucket.endpoint, bucket: bucket.bucket,
      region: bucket.region || 'auto', enabled: bucket.enabled !== false,
      hasCredentials: Boolean(bucket.accessKey && bucket.secretKey),
      accessKey: bucket.accessKey ? '••••••••' : '', secretKey: bucket.secretKey ? '••••••••' : '',
    })),
  });
}));

router.post('/admin/r2-buckets/import-environment', requirePermission('settings.manage'), asyncRoute(async (req, res) => {
  const config = r2.configFromEnv('R2');
  if (!config) return res.status(400).json({ message: 'The current Railway R2 environment variables are incomplete.' });
  await r2.listObjects(config, '');
  const raw = await getSetting('r2_buckets', '');
  let saved = { buckets: [], activeId: null };
  try { if (raw) saved = JSON.parse(raw); } catch (_) {}
  const existing = (saved.buckets || []).find((item) => item.bucket === config.bucket && item.endpoint === config.endpoint);
  if (existing) {
    saved.activeId = existing.id;
  } else {
    const id = crypto.randomUUID();
    saved.buckets = [...(saved.buckets || []), { id, name: config.bucket, endpoint: config.endpoint, bucket: config.bucket, region: config.region, accessKey: config.accessKey, secretKey: config.secretKey, enabled: true }];
    saved.activeId = id;
  }
  await setSetting('r2_buckets', JSON.stringify(saved), { secret: true, updatedBy: req.user.id });
  await audit(req, 'storage.r2_environment_imported', 'storage_bucket', saved.activeId, 'Existing Railway R2 environment configuration imported into encrypted admin storage');
  res.json({ message: 'Current R2 configuration imported and activated.', activeId: saved.activeId });
}));

router.post('/admin/r2-buckets', requirePermission('settings.manage'), asyncRoute(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80);
  const endpoint = String(req.body?.endpoint || '').trim().replace(/\/$/, '');
  const bucket = String(req.body?.bucket || '').trim();
  const region = String(req.body?.region || 'auto').trim();
  const accessKey = String(req.body?.accessKey || '').trim();
  const secretKey = String(req.body?.secretKey || '').trim();
  if (!name || !bucket || !/^https:\/\//i.test(endpoint) || !accessKey || !secretKey) {
    return res.status(400).json({ message: 'Enter a name, HTTPS endpoint, bucket name, Access Key ID and Secret Access Key.' });
  }
  const config = { endpoint, bucket, region, accessKey, secretKey };
  await r2.listObjects(config, ''); // Verify credentials and bucket access before saving.
  const raw = await getSetting('r2_buckets', '');
  let saved = { buckets: [], activeId: null };
  try { if (raw) saved = JSON.parse(raw); } catch (_) {}
  if (!Array.isArray(saved.buckets) || saved.buckets.length === 0) {
    const envConfig = r2.configFromEnv('R2');
    if (envConfig) {
      const envId = crypto.randomUUID();
      saved.buckets = [{ id: envId, name: envConfig.bucket, endpoint: envConfig.endpoint, bucket: envConfig.bucket, region: envConfig.region, accessKey: envConfig.accessKey, secretKey: envConfig.secretKey, enabled: true }];
      saved.activeId = envId;
    }
  }
  const id = crypto.randomUUID();
  const record = { id, name, endpoint, bucket, region, accessKey, secretKey, enabled: true };
  saved.buckets = [...(Array.isArray(saved.buckets) ? saved.buckets : []), record];
  if (!saved.activeId) saved.activeId = id;
  await setSetting('r2_buckets', JSON.stringify(saved), { secret: true, updatedBy: req.user.id });
  await audit(req, 'storage.r2_bucket_added', 'storage_bucket', id, 'R2 bucket connection added and tested', null, { name, bucket, endpoint });
  res.status(201).json({ message: 'R2 bucket connected and verified.', id, activeId: saved.activeId });
}));

router.post('/admin/r2-buckets/:id/activate', requirePermission('settings.manage'), asyncRoute(async (req, res) => {
  const raw = await getSetting('r2_buckets', '');
  let saved = { buckets: [], activeId: null };
  try { if (raw) saved = JSON.parse(raw); } catch (_) {}
  const selected = (saved.buckets || []).find((item) => item.id === req.params.id);
  if (!selected || !selected.accessKey || !selected.secretKey) return res.status(404).json({ message: 'R2 bucket configuration not found.' });
  await r2.listObjects(selected, '');
  saved.activeId = selected.id;
  await setSetting('r2_buckets', JSON.stringify(saved), { secret: true, updatedBy: req.user.id });
  await audit(req, 'storage.r2_bucket_activated', 'storage_bucket', selected.id, 'Active R2 storage bucket changed', null, { name: selected.name, bucket: selected.bucket });
  res.json({ message: 'Active R2 bucket changed.', activeId: selected.id });
}));

router.get('/admin/backups', requirePermission('backups.view'), asyncRoute(async (_req, res) => {
  const backups = await engine.listBackups();
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ backups, running: engine.isRunning() });
}));

router.post('/admin/backups', requirePermission('backups.create'), asyncRoute(async (req, res) => {
  const result = await engine.createBackup({ createdBy: req.user.id, reason: String(req.body?.reason || 'Manual administrator backup').slice(0, 300) });
  await audit(req, 'backup.created', 'backup', result.id, 'Administrator created a full platform backup', null, {
    sizeBytes: result.sizeBytes, checksum: result.checksum, tableCount: result.tableCount, totalRows: result.totalRows, mediaFiles: result.mediaFiles,
  });
  let drive = null;
  if (result.path) {
    try { drive = await engine.uploadToGoogleDrive(result.path, result.filename); } catch (error) { console.error('[Backup] Google Drive upload failed:', error.message); }
  }
  res.status(201).json({
    message: 'Backup created and checksum verified.',
    backup: {
      id: result.id, filename: result.filename, sizeBytes: result.sizeBytes,
      checksum: result.checksum, totalRows: result.totalRows, tableCount: result.tableCount,
      mediaFiles: result.mediaFiles, mediaBytes: result.mediaBytes, createdAt: result.createdAt, storage: result.r2, googleDrive: drive,
    },
  });
}));

router.get('/admin/backups/:filename/download', requirePermission('backups.download'), asyncRoute(async (req, res) => {
  const fullPath = engine.getBackupPath(req.params.filename);
  if (!fullPath) return res.status(400).json({ message: 'Invalid backup filename.' });
  let stat = await fsp.stat(fullPath).catch(() => null);
  if (!stat?.isFile()) {
    const data = await engine.downloadBackupFromR2(req.params.filename);
    if (!data) return res.status(404).json({ message: 'Backup not found.' });
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', data.length);
    res.setHeader('Content-Disposition', 'attachment; filename="' + path.basename(fullPath) + '"');
    return res.end(data);
  }
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', 'attachment; filename="' + path.basename(fullPath) + '"');
  fs.createReadStream(fullPath).pipe(res);
}));


router.get('/admin/backups/google-drive', requirePermission('backups.view'), asyncRoute(async (_req, res) => {
  const files = await engine.listGoogleDriveBackups();
  res.json({ files });
}));

router.post('/admin/backups/:filename/restore', requirePermission('backups.create'), asyncRoute(async (req, res) => {
  const filename = String(req.params.filename || '');
  const fullPath = engine.getBackupPath(filename);
  if (!fullPath) return res.status(400).json({ message: 'Invalid backup filename.' });
  let stat = await fsp.stat(fullPath).catch(() => null);
  let restorePath = fullPath;
  if (!stat?.isFile()) {
    const data = await engine.downloadBackupFromR2(filename);
    if (!data) return res.status(404).json({ message: 'Backup not found.' });
    restorePath = path.join(os.tmpdir(), 'quickchat-r2-restore-' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.zip');
    await fsp.writeFile(restorePath, data, { mode: 0o600 });
  }
  if (!req.body?.confirm) return res.status(400).json({ message: 'Restore confirmation is required.' });
  const result = await engine.restoreBackup(restorePath, { restoredBy: req.user.id, reason: String(req.body?.reason || 'Administrator restore').slice(0, 300) });
  if (restorePath !== fullPath) await fsp.unlink(restorePath).catch(() => {});
  await audit(req, 'backup.restored', 'backup', filename, result.reason, null, { checksum: result.checksum, restoredRows: result.restoredRows, restoredTables: result.restoredTables });
  res.json({ message: 'Backup restored successfully.', result });
}));

router.post('/admin/backups/google-drive/:fileId/restore', requirePermission('backups.create'), asyncRoute(async (req, res) => {
  if (!req.body?.confirm) return res.status(400).json({ message: 'Restore confirmation is required.' });
  const data = await engine.downloadFromGoogleDrive(String(req.params.fileId || ''));
  const tempPath = path.join(os.tmpdir(), `quickchat-drive-restore-${Date.now()}-${Math.random().toString(16).slice(2)}.zip`);
  await fsp.writeFile(tempPath, data, { mode: 0o600 });
  try {
    const result = await engine.restoreBackup(tempPath, { restoredBy: req.user.id, reason: String(req.body?.reason || 'Google Drive administrator restore').slice(0, 300) });
    await audit(req, 'backup.google_drive_restored', 'backup', req.params.fileId, result.reason, null, { checksum: result.checksum, restoredRows: result.restoredRows, restoredTables: result.restoredTables });
    res.json({ message: 'Google Drive backup restored successfully.', result });
  } finally {
    await fsp.unlink(tempPath).catch(() => {});
  }
}));

router.delete('/admin/backups/:filename', requirePermission('backups.delete'), asyncRoute(async (req, res) => {
  const fullPath = engine.getBackupPath(req.params.filename);
  if (!fullPath) return res.status(400).json({ message: 'Invalid backup filename.' });
  const stat = await fsp.stat(fullPath).catch(() => null);
  if (stat?.isFile()) await fsp.unlink(fullPath).catch(() => {});
  await engine.deleteBackupFromR2(req.params.filename);
  await audit(req, 'backup.deleted', 'backup', req.params.filename, 'Administrator deleted a backup archive', { sizeBytes: stat?.size || null }, null);
  res.json({ message: 'Backup deleted from R2.' });
}));

module.exports = router;
