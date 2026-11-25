const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const zlib = require('zlib');
const { db } = require('./routes/utils');
const { getSetting } = require('./platform-settings');
const { OAuth2Client } = require('google-auth-library');
const r2 = require('./r2-storage');

const backupDirectory = path.resolve(__dirname, process.env.BACKUP_DIRECTORY || '../private-backups');
const mediaDirectory = path.join(__dirname, 'uploads');
const r2BackupPrefix = 'backup/';
async function backupStorageConfig() { return r2.getActiveConfig(); }
async function uploadBackupToR2(filePath, filename) {
  const config = await backupStorageConfig();
  if (!config) throw new Error('No active Cloudflare R2 bucket is configured for database backups.');
  return r2.putFile(config, r2BackupPrefix + filename, filePath, 'application/zip');
}
async function downloadBackupFromR2(filename) {
  const configs = await r2.getAllConfigs();
  for (const config of configs) {
    const response = await r2.getObject(config, r2BackupPrefix + filename);
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    if (response.status !== 404) throw new Error('R2 backup download failed (' + response.status + ').');
  }
  return null;
}
async function deleteBackupFromR2(filename) {
  const configs = await r2.getAllConfigs();
  for (const config of configs) await r2.deleteObject(config, r2BackupPrefix + filename);
}
async function listR2Backups() {
  const configs = await r2.getAllConfigs();
  const results = [];
  for (const config of configs) {
    const objects = await r2.listObjects(config, r2BackupPrefix);
    for (const item of objects.filter((entry) => /^[0-9TZa-z-]+\.zip$/.test(path.basename(entry.key)))) {
      results.push({ filename: path.basename(item.key), id: path.basename(item.key, '.zip'), sizeBytes: Number(item.size || 0), createdAt: item.lastModified || null, storage: 'r2', bucket: config.bucket, bucketId: config.id });
    }
  }
  return results;
}
let running = false;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, '/'));
    const source = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const compressed = zlib.deflateRawSync(source, { level: 6 });
    const crc = crc32(source);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(source.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, compressed);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x0800, 8);
    record.writeUInt16LE(8, 10);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(compressed.length, 20);
    record.writeUInt32LE(source.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(record, name);
    offset += header.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

async function tableDefinitions() {
  if (db.type === 'sqlite') {
    const rows = await db.query("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    return rows.map((row) => ({ name: row.name, createSql: row.sql }));
  }
  if (db.type === 'postgres') {
    const rows = await db.query("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name");
    return rows.map((row) => ({ name: row.name }));
  }
  const rows = await db.query("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name");
  return rows.map((row) => ({ name: row.name }));
}

function quoteIdentifier(name) { const tick = String.fromCharCode(96); return db.type === 'mysql' ? tick + name.split(tick).join(tick + tick) + tick : '"' + name.replace(/"/g, '""') + '"'; }

async function columnsFor(table) {
  if (db.type === 'sqlite') return db.query('PRAGMA table_info(' + quoteIdentifier(table.name) + ')');
  if (db.type === 'postgres') return db.query(
    'SELECT column_name AS name, data_type AS type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? ORDER BY ordinal_position',
    [table.name],
  );
  return db.query(
    'SELECT column_name AS name, column_type AS type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position',
    [table.name],
  );
}

async function createBackup({ createdBy = null, reason = 'Manual administrator backup' } = {}) {
  if (running) {
    const error = new Error('A backup is already running.');
    error.status = 409;
    throw error;
  }
  running = true;
  const startedAt = new Date();
  const id = startedAt.toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(4).toString('hex');
  try {
    await fsp.mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    const tables = await tableDefinitions();
    const entries = [];
    const tableManifest = [];
    let totalRows = 0;
    for (const table of tables) {
      if (!/^[a-zA-Z0-9_]+$/.test(table.name)) continue;
      const columns = await columnsFor(table);
      const rows = await db.query('SELECT * FROM ' + quoteIdentifier(table.name));
      totalRows += rows.length;
      const file = 'database/tables/' + table.name + '.json';
      entries.push({ name: file, data: JSON.stringify(rows) });
      tableManifest.push({ name: table.name, columns, rows: rows.length, file, createSql: table.createSql || null });
    }

    let mediaFiles = 0;
    let mediaBytes = 0;
    const storageConfigs = await r2.getAllConfigs();
    const storage = storageConfigs[0];
    if (!storage) throw new Error('Configure an active R2 bucket before creating a database backup.');
    const mediaRows = await db.query('SELECT filename, mime_type FROM media_uploads ORDER BY id');
    for (const media of mediaRows) {
      const filename = String(media.filename || '');
      if (!/^[a-f0-9-]{36}\.(jpg|png|gif|webp|mp4|webm|mov|ogg|m4a|mp3|wav)$/i.test(filename)) continue;
      let data = null;
      for (const mediaStorage of storageConfigs) {
        const remote = await r2.getObject(mediaStorage, 'uploads/' + filename);
        if (remote.ok) { data = Buffer.from(await remote.arrayBuffer()); break; }
        if (remote.status !== 404) throw new Error('Unable to read media from R2 bucket ' + mediaStorage.bucket + ' (HTTP ' + remote.status + ').');
      }
      if (!data) data = await fsp.readFile(path.join(mediaDirectory, filename)).catch(() => null);
      if (!data) throw new Error('A media file is missing from R2 and local storage: ' + filename);
      entries.push({ name: 'media/' + filename, data });
      mediaFiles += 1;
      mediaBytes += data.length;
    }

    const manifest = {
      format: 'quickchat-admin-backup',
      version: 1,
      database: db.type,
      backupId: id,
      createdAt: startedAt.toISOString(),
      createdBy,
      reason,
      tableCount: tableManifest.length,
      totalRows,
      mediaFiles,
      mediaBytes,
      tables: tableManifest,
    };
    entries.push({ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) });
    const archive = zip(entries);
    const checksum = crypto.createHash('sha256').update(archive).digest('hex');
    const filename = id + '.zip';
    const tempPath = path.join(backupDirectory, filename + '.tmp');
    const finalPath = path.join(backupDirectory, filename);
    await fsp.writeFile(tempPath, archive, { flag: 'wx', mode: 0o600 });
    await fsp.rename(tempPath, finalPath);
    const persisted = await fsp.readFile(finalPath);
    const persistedChecksum = crypto.createHash('sha256').update(persisted).digest('hex');
    if (persistedChecksum !== checksum) {
      await fsp.unlink(finalPath).catch(() => {});
      throw new Error('Backup checksum verification failed; the incomplete archive was removed.');
    }
    const stat = await fsp.stat(finalPath);
    const r2Object = await uploadBackupToR2(finalPath, filename);
    await fsp.unlink(finalPath).catch(() => {});
    return { id, filename, path: null, sizeBytes: stat.size, checksum, totalRows, tableCount: tableManifest.length, mediaFiles, mediaBytes, createdAt: startedAt.toISOString(), r2: { key: r2Object.key, size: r2Object.size, bucket: storage.bucket } };
  } finally {
    running = false;
  }
}

async function cleanupExpiredBackups(retentionDays = 30) {
  const days = Math.max(1, Math.min(3650, Number.parseInt(retentionDays, 10) || 30));
  const cutoff = Date.now() - days * 86400000;
  const backups = await listBackups();
  let deleted = 0;
  for (const backup of backups) {
    if (new Date(backup.createdAt).getTime() < cutoff) {
      const fullPath = getBackupPath(backup.filename);
      if (fullPath) { await fsp.unlink(fullPath).catch(() => {}); }
      await deleteBackupFromR2(backup.filename).catch(() => {});
      deleted += 1;
    }
  }
  return deleted;
}

async function listBackups() {
  await fsp.mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const names = await fsp.readdir(backupDirectory);
  const results = [];
  for (const name of names.filter((item) => /^[0-9TZa-z-]+\.zip$/.test(item))) {
    const fullPath = path.join(backupDirectory, name);
    try {
      const stat = await fsp.stat(fullPath);
      if (stat.isFile()) results.push({ id: name.slice(0, -4), filename: name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() });
    } catch (_) {}
  }
  const r2Backups = await listR2Backups().catch(() => []);
  const merged = new Map();
  for (const item of results) merged.set(item.filename, { ...item, storage: 'local' });
  for (const item of r2Backups) merged.set(item.filename, { ...merged.get(item.filename), ...item, storage: 'r2' });
  return [...merged.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function getBackupPath(filename) {
  if (!/^[0-9TZa-z-]+\.zip$/.test(String(filename || ''))) return null;
  return path.join(backupDirectory, filename);
}


function parseZip(buffer) {
  const entries = new Map(); let offset = 0;
  while (offset + 30 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature === 0x04034b50) {
      const flags = buffer.readUInt16LE(offset + 6), method = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18), nameLength = buffer.readUInt16LE(offset + 26), extraLength = buffer.readUInt16LE(offset + 28);
      if (flags & 0x08) throw new Error('Unsupported ZIP data descriptor.');
      const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
      const dataStart = offset + 30 + nameLength + extraLength;
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
      const data = method === 0 ? compressed : method === 8 ? zlib.inflateRawSync(compressed) : null;
      if (!data) throw new Error(`Unsupported ZIP compression method for ${name}.`);
      entries.set(name, data); offset = dataStart + compressedSize; continue;
    }
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    offset += 1;
  }
  return entries;
}

async function restoreBackup(archivePath, { reason = 'Administrator restore', restoredBy = null } = {}) {
  if (running) { const error = new Error('A backup operation is already running.'); error.status = 409; throw error; }
  running = true;
  try {
    const archive = await fsp.readFile(archivePath);
    const checksum = crypto.createHash('sha256').update(archive).digest('hex');
    const entries = parseZip(archive);
    const manifest = JSON.parse(String(entries.get('manifest.json') || '{}'));
    if (manifest.format !== 'quickchat-admin-backup' || !Array.isArray(manifest.tables)) throw new Error('Invalid QuickChat backup archive.');
    const tableNames = manifest.tables.map((t) => t.name).filter((name) => /^[a-zA-Z0-9_]+$/.test(name));
    const existing = new Set((await tableDefinitions()).map((t) => t.name));
    const restoreTables = tableNames.filter((name) => existing.has(name));
    const skippedTables = tableNames.filter((name) => !existing.has(name));
    if (db.type === 'sqlite') await db.query('PRAGMA foreign_keys = OFF');
    if (db.type === 'mysql') await db.query('SET FOREIGN_KEY_CHECKS = 0');
    if (db.type === 'postgres') await db.query('SET session_replication_role = replica');
    try {
      for (const tableName of restoreTables.slice().reverse()) await db.query('DELETE FROM ' + quoteIdentifier(tableName));
      let restoredRows = 0;
      for (const tableName of restoreTables) {
        const raw = entries.get(`database/tables/${tableName}.json`); if (!raw) continue;
        const rows = JSON.parse(raw.toString('utf8')); if (!Array.isArray(rows)) continue;
        const columns = new Set((await columnsFor({ name: tableName })).map((c) => String(c.name).toLowerCase()));
        for (const row of rows) {
          const keys = Object.keys(row).filter((key) => columns.has(String(key).toLowerCase())); if (!keys.length) continue;
          await db.query(`INSERT INTO ${quoteIdentifier(tableName)} (${keys.map(quoteIdentifier).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, keys.map((key) => row[key]));
          restoredRows += 1;
        }
      }
      await restoreMedia(entries);
      return { checksum, restoredRows, restoredTables: restoreTables.length, skippedTables, mediaFiles: manifest.mediaFiles || 0, reason, restoredBy };
    } finally {
      if (db.type === 'sqlite') await db.query('PRAGMA foreign_keys = ON');
      if (db.type === 'mysql') await db.query('SET FOREIGN_KEY_CHECKS = 1');
      if (db.type === 'postgres') await db.query('SET session_replication_role = DEFAULT');
    }
  } finally { running = false; }
}

async function restoreMedia(entries) {
  const storage = await backupStorageConfig();
  if (!storage) throw new Error('Configure an active R2 bucket before restoring backup media.');
  for (const [name, data] of entries) {
    const base = path.basename(name);
    if (name.startsWith('media/') && /^[a-f0-9-]{36}\.(jpg|png|gif|webp|mp4|webm|mov|ogg|m4a|mp3|wav)$/i.test(base)) {
      await r2.putBuffer(storage, 'uploads/' + base, data, 'application/octet-stream');
    }
  }

}

async function googleDriveConfig() {
  return {
    clientId: await getSetting('google_drive_client_id', ''),
    clientSecret: await getSetting('google_drive_client_secret', ''),
    refreshToken: await getSetting('google_drive_refresh_token', ''),
    folderId: await getSetting('google_drive_folder_id', ''),
    enabled: String(await getSetting('google_drive_enabled', 'false')).toLowerCase() === 'true',
  };
}

async function googleDriveAccessToken(config) {
  if (!config.clientId || !config.clientSecret || !config.refreshToken) throw new Error('Google Drive OAuth credentials are not configured.');
  const client = new OAuth2Client(config.clientId, config.clientSecret);
  client.setCredentials({ refresh_token: config.refreshToken });
  const token = await client.getAccessToken(); if (!token?.token) throw new Error('Google Drive OAuth token could not be refreshed.');
  return token.token;
}

async function uploadToGoogleDrive(backupPath, filename) {
  const config = await googleDriveConfig();
  if (!config.enabled) return null;
  const token = await googleDriveAccessToken(config);
  const data = await fsp.readFile(backupPath);
  const metadata = { name: filename, mimeType: 'application/zip', ...(config.folderId ? { parents: [config.folderId] } : {}) };
  const init = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/zip',
      'X-Upload-Content-Length': String(data.length),
    },
    body: JSON.stringify(metadata),
  });
  if (!init.ok) {
    const payload = await init.json().catch(() => ({}));
    throw new Error(payload?.error?.message || `Google Drive upload initialization failed with HTTP ${init.status}.`);
  }
  const location = init.headers.get('location');
  if (!location) throw new Error('Google Drive did not return an upload session URL.');
  const upload = await fetch(location, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/zip', 'Content-Length': String(data.length) },
    body: data,
  });
  const payload = await upload.json().catch(() => ({}));
  if (!upload.ok) throw new Error(payload?.error?.message || `Google Drive upload failed with HTTP ${upload.status}.`);
  return payload;
}
async function listGoogleDriveBackups() {
  const config = await googleDriveConfig(); if (!config.enabled) return [];
  const token = await googleDriveAccessToken(config), folder = config.folderId.replace(/'/g, "\\'");
  const q = `name contains '.zip' and trashed = false${config.folderId ? ` and '${folder}' in parents` : ''}`;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,size,createdTime,webViewLink)&orderBy=createdTime desc&pageSize=100`, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload?.error?.message || `Google Drive listing failed with HTTP ${response.status}.`);
  return payload.files || [];
}

async function downloadFromGoogleDrive(fileId) {
  const config = await googleDriveConfig(); if (!config.enabled) throw new Error('Google Drive backup storage is disabled.');
  const token = await googleDriveAccessToken(config);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload?.error?.message || `Google Drive download failed with HTTP ${response.status}.`); }
  return Buffer.from(await response.arrayBuffer());
}

module.exports = { createBackup, listBackups, getBackupPath, cleanupExpiredBackups, backupDirectory, isRunning: () => running, restoreBackup, uploadToGoogleDrive, listGoogleDriveBackups, downloadFromGoogleDrive, downloadBackupFromR2, deleteBackupFromR2 };

