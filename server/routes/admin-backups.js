const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
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
  res.status(201).json({
    message: 'Backup created and checksum verified.',
    backup: {
      id: result.id, filename: result.filename, sizeBytes: result.sizeBytes,
      checksum: result.checksum, totalRows: result.totalRows, tableCount: result.tableCount,
      mediaFiles: result.mediaFiles, mediaBytes: result.mediaBytes, createdAt: result.createdAt,
    },
  });
}));

router.get('/admin/backups/:filename/download', requirePermission('backups.download'), asyncRoute(async (req, res) => {
  const fullPath = engine.getBackupPath(req.params.filename);
  if (!fullPath) return res.status(400).json({ message: 'Invalid backup filename.' });
  const stat = await fsp.stat(fullPath).catch(() => null);
  if (!stat?.isFile()) return res.status(404).json({ message: 'Backup not found.' });
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', 'attachment; filename="' + path.basename(fullPath) + '"');
  fs.createReadStream(fullPath).pipe(res);
}));

router.delete('/admin/backups/:filename', requirePermission('backups.delete'), asyncRoute(async (req, res) => {
  const fullPath = engine.getBackupPath(req.params.filename);
  if (!fullPath) return res.status(400).json({ message: 'Invalid backup filename.' });
  const stat = await fsp.stat(fullPath).catch(() => null);
  if (!stat?.isFile()) return res.status(404).json({ message: 'Backup not found.' });
  await fsp.unlink(fullPath);
  await audit(req, 'backup.deleted', 'backup', req.params.filename, 'Administrator deleted a backup archive', { sizeBytes: stat.size }, null);
  res.json({ message: 'Backup deleted.' });
}));

module.exports = router;
