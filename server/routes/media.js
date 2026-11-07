const crypto = require('crypto');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { Transform } = require('stream');
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

// Stream uploads to disk so longer videos do not need to fit in server memory.
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
      if (!tooLarge && bytes > type.maxBytes) tooLarge = true;
      if (header.length < 32) header = Buffer.concat([header, chunk.subarray(0, 32 - header.length)]);
      // Discard bytes beyond the limit but finish consuming the request cleanly.
      if (tooLarge) callback();
      else callback(null, chunk);
    },
  });

  try {
    await pipeline(req, meter, fs.createWriteStream(filePath, { flags: 'wx' }));
    if (tooLarge) {
      await fsPromises.rm(filePath, { force: true });
      return res.status(413).json({ message: `This file exceeds the ${mimeType.startsWith('video/') ? '500 MB' : '15 MB'} upload limit.` });
    }
    if (bytes === 0) {
      await fsPromises.rm(filePath, { force: true });
      return res.status(400).json({ message: 'The uploaded file is empty.' });
    }
    if (!hasExpectedSignature(mimeType, header)) {
      await fsPromises.rm(filePath, { force: true });
      return res.status(415).json({ message: 'The file contents do not match the selected image or video type.' });
    }

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
  } catch (error) {
    await fsPromises.rm(filePath, { force: true });
    throw error;
  }
}));

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
  await fsPromises.rm(path.join(uploadDirectory, filename), { force: true });
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

module.exports = router;
