const crypto = require('crypto');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const express = require('express');
const { db, asyncRoute, notFound } = require('./utils');

const router = express.Router();
const uploadDirectory = path.join(__dirname, '..', 'uploads');
const imageTypes = {
  'image/jpeg': { extension: 'jpg', maxBytes: 15 * 1024 * 1024 },
  'image/png': { extension: 'png', maxBytes: 15 * 1024 * 1024 },
  'image/gif': { extension: 'gif', maxBytes: 15 * 1024 * 1024 },
  'image/webp': { extension: 'webp', maxBytes: 15 * 1024 * 1024 },
};
const audioTypes = {
  'audio/webm': { extension: 'webm', maxBytes: 30 * 1024 * 1024 },
  'audio/ogg': { extension: 'ogg', maxBytes: 30 * 1024 * 1024 },
  'audio/mp4': { extension: 'm4a', maxBytes: 30 * 1024 * 1024 },
  'audio/mpeg': { extension: 'mp3', maxBytes: 30 * 1024 * 1024 },
  'audio/wav': { extension: 'wav', maxBytes: 30 * 1024 * 1024 },
};
const videoTypes = {
  'video/mp4': { extension: 'mp4', maxBytes: 500 * 1024 * 1024 },
  'video/webm': { extension: 'webm', maxBytes: 500 * 1024 * 1024 },
  'video/quicktime': { extension: 'mov', maxBytes: 500 * 1024 * 1024 },
};
const fileTypes = { ...imageTypes, ...videoTypes, ...audioTypes };

function r2Config() {
  const endpoint = process.env.R2_ENDPOINT || 'https://62809542fc864ad1186326309f104278.r2.cloudflarestorage.com';
  const bucket = process.env.R2_BUCKET || 'uploadbackup';
  const region = process.env.R2_REGION || 'auto';
  const accessKey = process.env.R2_ACCESS_KEY_ID;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY;
  if (![endpoint, bucket, accessKey, secretKey].every(Boolean)) return null;
  return { endpoint: endpoint.replace(/\/$/, ''), bucket, region, accessKey, secretKey };
}
function hmac(key, value) { return crypto.createHmac('sha256', key).update(value, 'utf8').digest(); }
function signingKey(secret, date, region) {
  const dateKey = hmac('AWS4' + secret, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, 's3');
  return hmac(serviceKey, 'aws4_request');
}
function r2ObjectUrl(config, key) {
  const url = new URL(config.endpoint);
  url.pathname = '/' + encodeURIComponent(config.bucket) + '/' + String(key).split('/').map(encodeURIComponent).join('/');
  url.search = '';
  return url;
}
function signedHeaders(config, method, url, payloadHash, contentType = '') {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const headers = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  if (contentType) headers['content-type'] = contentType;
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((name) => name + ':' + headers[name].trim() + '\\n').join('');
  const signedNames = names.join(';');
  const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedNames, payloadHash].join('\n');
  const scope = date + '/' + config.region + '/s3/aws4_request';
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\\n');
  const signature = crypto.createHmac('sha256', signingKey(config.secretKey, date, config.region)).update(stringToSign).digest('hex');
  return { ...headers, Authorization: 'AWS4-HMAC-SHA256 Credential=' + config.accessKey + '/' + scope + ', SignedHeaders=' + signedNames + ', Signature=' + signature };
}
function r2Key(filename) { return 'uploads/' + filename; }
async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}
async function putObject(config, filename, filePath, mimeType) {
  const url = r2ObjectUrl(config, r2Key(filename));
  const stat = await fsPromises.stat(filePath);
  const headers = signedHeaders(config, 'PUT', url, await hashFile(filePath), mimeType);
  headers['content-length'] = String(stat.size);
  const response = await fetch(url, { method: 'PUT', headers, body: fs.createReadStream(filePath), duplex: 'half' });
  if (!response.ok) throw new Error('Cloudflare R2 upload failed (' + response.status + '): ' + (await response.text()).slice(0, 300));
}
async function deleteObject(config, filename) {
  const url = r2ObjectUrl(config, r2Key(filename));
  const response = await fetch(url, { method: 'DELETE', headers: signedHeaders(config, 'DELETE', url, crypto.createHash('sha256').update('').digest('hex')) });
  if (!response.ok && response.status !== 404) throw new Error('Could not remove the media object from Cloudflare R2.');
}
async function getObject(config, filename, range) {
  const url = r2ObjectUrl(config, r2Key(filename));
  const headers = signedHeaders(config, 'GET', url, crypto.createHash('sha256').update('').digest('hex'));
  if (range) headers.range = range;
  return fetch(url, { method: 'GET', headers });
}

async function storeBufferForUser(ownerId, buffer, mimeType) {
  const type = fileTypes[String(mimeType || '').toLowerCase()];
  if (!type || !Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > type.maxBytes) {
    throw new Error('Generated media is empty, too large, or has an unsupported file type.');
  }
  if (!hasExpectedSignature(mimeType, buffer.subarray(0, 32))) {
    throw new Error('Generated media contents do not match the declared file type.');
  }
  const storage = r2Config();
  if (!storage) throw new Error('Railway media storage is not configured.');
  const filename = `${crypto.randomUUID()}.${type.extension}`;
  const filePath = path.join(uploadDirectory, filename);
  await fsPromises.mkdir(uploadDirectory, { recursive: true });
  let stored = false;
  try {
    await fsPromises.writeFile(filePath, buffer, { flag: 'wx' });
    await putObject(storage, filename, filePath, mimeType);
    stored = true;
    const upload = await db.insert(
      'INSERT INTO media_uploads (owner_id, filename, mime_type, size_bytes) VALUES (?, ?, ?, ?)',
      [ownerId, filename, mimeType, buffer.length],
    );
    const publicOrigin = String(process.env.PUBLIC_API_ORIGIN || process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
    if (!upload?.id || !publicOrigin) throw new Error('Media metadata or public API origin is unavailable.');
    return { id: upload.id, filename, url: `${publicOrigin}/uploads/${filename}`, type: mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('audio/') ? 'audio' : 'image', size: buffer.length };
  } catch (error) {
    if (stored) {
      const url = r2ObjectUrl(storage, r2Key(filename));
      const headers = signedHeaders(storage, 'DELETE', url, crypto.createHash('sha256').update('').digest('hex'));
      await fetch(url, { method: 'DELETE', headers }).catch(() => {});
    }
    throw error;
  } finally {
    await fsPromises.rm(filePath, { force: true }).catch(() => {});
  }
}

router.post('/media', asyncRoute(async (req, res) => {
  const mimeType = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const type = fileTypes[mimeType];
  if (!type) return res.status(415).json({ message: 'Upload a supported image, audio, or video file.' });

  const contentLength = Number(req.get('content-length') || 0);
  if (contentLength > type.maxBytes) {
    req.resume();
    return res.status(413).json({ message: `This file exceeds the ${mimeType.startsWith('video/') ? '500 MB' : mimeType.startsWith('audio/') ? '30 MB' : '15 MB'} upload limit.` });
  }

  const filename = `${crypto.randomUUID()}.${type.extension}`;
  const filePath = path.join(uploadDirectory, filename);
  await fsPromises.mkdir(uploadDirectory, { recursive: true });
  let bytes = 0;
  let tooLarge = false;
  let header = Buffer.alloc(0);
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > type.maxBytes) tooLarge = true;
      if (header.length < 32) header = Buffer.concat([header, chunk.subarray(0, 32 - header.length)]);
      callback(null, tooLarge ? undefined : chunk);
    },
  });

  try {
    await pipeline(req, meter, fs.createWriteStream(filePath, { flags: 'wx' }));
    if (tooLarge) return res.status(413).json({ message: `This file exceeds the ${mimeType.startsWith('video/') ? '500 MB' : mimeType.startsWith('audio/') ? '30 MB' : '15 MB'} upload limit.` });
    if (bytes === 0) return res.status(400).json({ message: 'The uploaded file is empty.' });
    if (!hasExpectedSignature(mimeType, header)) return res.status(415).json({ message: 'The file contents do not match the selected image or video type.' });

    const storage = r2Config();
    if (!storage) {
      return res.status(503).json({ message: 'Media storage is not configured yet. Please try again shortly.' });
    }
    await putObject(storage, filename, filePath, mimeType);

    const upload = await db.insert(
      'INSERT INTO media_uploads (owner_id, filename, mime_type, size_bytes) VALUES (?, ?, ?, ?)',
      [req.user.id, filename, mimeType, bytes],
    );
    const publicOrigin = (process.env.PUBLIC_API_ORIGIN || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    res.status(201).json({
      id: upload?.id,
      url: `${publicOrigin}/uploads/${filename}`,
      type: mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('audio/') ? 'audio' : 'image',
      size: bytes,
    });
  } finally {
    await fsPromises.rm(filePath, { force: true }).catch(() => {});
  }
}));

async function servePublicMedia(req, res, next) {
  try {
    const filename = String(req.params.filename || '');
    if (!/^[a-f0-9-]{36}\.(jpg|png|gif|webp|mp4|webm|mov|ogg|m4a|mp3|wav)$/i.test(filename)) return res.status(404).end();
    const upload = await db.getOne(
      'SELECT mime_type, size_bytes FROM media_uploads WHERE filename = ?',
      [filename],
    );
    if (!upload) return res.status(404).end();

    const filePath = path.join(uploadDirectory, filename);
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', upload.mime_type);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      if (req.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!match) return res.status(416).end();
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Math.min(Number(match[2]), upload.size_bytes - 1) : upload.size_bytes - 1;
        if (start > end || start >= upload.size_bytes) return res.status(416).end();
        res.status(206).set({
          'Content-Range': `bytes ${start}-${end}/${upload.size_bytes}`,
          'Content-Length': String(end - start + 1),
        });
        return pipeline(fs.createReadStream(filePath, { start, end }), res);
      }
      res.setHeader('Content-Length', String(upload.size_bytes));
      return pipeline(fs.createReadStream(filePath), res);
    }

    const storage = s3Config();
    if (!storage) return res.status(404).end();
    const remote = await getObject(storage, filename, req.headers.range);
    if (!remote.ok && remote.status !== 206) return res.status(remote.status === 404 ? 404 : 502).end();
    res.status(remote.status);
    res.setHeader('Content-Type', upload.mime_type);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    for (const header of ['content-length', 'content-range']) {
      const value = remote.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    if (!remote.body) return res.end();
    return pipeline(Readable.fromWeb(remote.body), res);
  } catch (error) {
    return next(error);
  }
}

router.delete('/media/:filename', asyncRoute(async (req, res) => {
  const filename = String(req.params.filename || '');
  if (!/^[a-f0-9-]{36}\.(jpg|png|gif|webp|mp4|webm|mov|ogg|m4a|mp3|wav)$/i.test(filename)) {
    return res.status(400).json({ message: 'Invalid media file name.' });
  }
  const upload = await db.getOne(
    'SELECT id FROM media_uploads WHERE filename = ? AND owner_id = ?',
    [filename, req.user.id],
  );
  if (!upload) return notFound(res, 'Media file not found.');
  const filePath = path.join(uploadDirectory, filename);
  if (fs.existsSync(filePath)) await fsPromises.rm(filePath, { force: true });
  const storage = s3Config();
  if (storage) {
    const url = s3RequestUrl(storage, filename);
    const headers = signedHeaders(storage, 'DELETE', url, crypto.createHash('sha256').update('').digest('hex'));
    const response = await fetch(url, { method: 'DELETE', headers });
    if (!response.ok && response.status !== 404) throw new Error('Could not remove the media object from cloud storage.');
  }
  await db.delete('DELETE FROM media_uploads WHERE id = ? AND owner_id = ?', [upload.id, req.user.id]);
  res.json({ message: 'Media file deleted.' });
}));

function hasExpectedSignature(mimeType, bytes) {
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/gif') return ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6));
  if (mimeType === 'image/webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (mimeType === 'video/webm' || mimeType === 'audio/webm') return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (mimeType === 'audio/ogg') return bytes.toString('ascii', 0, 4) === 'OggS';
  if (mimeType === 'audio/wav') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE';
  if (mimeType === 'audio/mp4') return bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp';
  if (mimeType === 'audio/mpeg') return bytes.length >= 3 && (bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
  if (mimeType === 'video/mp4' || mimeType === 'video/quicktime') return bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp';
  return false;
}

router.servePublicMedia = servePublicMedia;
router.storeBufferForUser = storeBufferForUser;
module.exports = router;
