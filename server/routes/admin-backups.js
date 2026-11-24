const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { asyncRoute } = require('./utils');
const { requirePermission, audit } = require('./admin');
const engine = require('../backup-engine');

const router = express.Router();

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
  try { drive = await engine.uploadToGoogleDrive(result.path, result.filename); } catch (error) { console.error('[Backup] Google Drive upload failed:', error.message); }
  res.status(201).json({
    message: 'Backup created and checksum verified.',
    backup: {
      id: result.id, filename: result.filename, sizeBytes: result.sizeBytes,
      checksum: result.checksum, totalRows: result.totalRows, tableCount: result.tableCount,
      mediaFiles: result.mediaFiles, mediaBytes: result.mediaBytes, createdAt: result.createdAt, googleDrive: drive,
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
  if (!stat?.isFile()) return res.status(404).json({ message: 'Backup not found.' });
  if (stat?.isFile()) await fsp.unlink(fullPath).catch(() => {});
  await engine.deleteBackupFromR2(req.params.filename).catch(() => {});
  await audit(req, 'backup.deleted', 'backup', req.params.filename, 'Administrator deleted a backup archive', { sizeBytes: stat.size }, null);
  res.json({ message: 'Backup deleted.' });
}));

module.exports = router;
