const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const zlib = require('zlib');
const { db } = require('./routes/utils');

const backupDirectory = path.resolve(__dirname, process.env.BACKUP_DIRECTORY || '../private-backups');
const mediaDirectory = path.join(__dirname, 'uploads');
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
    try {
      const files = await fsp.readdir(mediaDirectory, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || !/^[a-f0-9-]{36}\.(jpg|png|gif|webp|mp4|webm|mov)$/i.test(file.name)) continue;
        const fullPath = path.join(mediaDirectory, file.name);
        const stat = await fsp.stat(fullPath);
        if (!stat.isFile()) continue;
        const data = await fsp.readFile(fullPath);
        entries.push({ name: 'media/' + file.name, data });
        mediaFiles += 1;
        mediaBytes += data.length;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
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
    return { id, filename, path: finalPath, sizeBytes: stat.size, checksum, totalRows, tableCount: tableManifest.length, mediaFiles, mediaBytes, createdAt: startedAt.toISOString() };
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
      if (fullPath) { await fsp.unlink(fullPath).catch(() => {}); deleted += 1; }
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
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function getBackupPath(filename) {
  if (!/^[0-9TZa-z-]+\.zip$/.test(String(filename || ''))) return null;
  return path.join(backupDirectory, filename);
}

module.exports = { createBackup, listBackups, getBackupPath, cleanupExpiredBackups, backupDirectory, isRunning: () => running };
