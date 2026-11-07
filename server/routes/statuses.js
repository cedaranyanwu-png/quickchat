const express = require('express');
const { db, asyncRoute, notFound } = require('./utils');

const router = express.Router();
const DAY_MS = 24 * 60 * 60 * 1000;

router.get('/statuses', asyncRoute(async (req, res) => {
  const rows = await db.query(
    `SELECT s.id, s.user_id, s.status_type, s.text, s.media_url, s.background_color,
            s.created_at, s.expires_at,
            u.fullname, u.username, u.avatar_url, u.picture, u.verified,
            CASE WHEN sv.viewer_id IS NULL THEN 0 ELSE 1 END AS viewed
       FROM statuses s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN status_views sv ON sv.status_id = s.id AND sv.viewer_id = ?
      WHERE s.expires_at > CURRENT_TIMESTAMP
      ORDER BY CASE WHEN s.user_id = ? THEN 0 ELSE 1 END,
               s.created_at ASC, s.id ASC`,
    [req.user.id, req.user.id],
  );

  const groups = new Map();
  for (const row of rows) {
    const key = String(row.user_id);
    if (!groups.has(key)) {
      groups.set(key, {
        userId: row.user_id,
        name: row.fullname || '',
        username: row.username || '',
        picture: row.avatar_url || row.picture || null,
        verified: Boolean(Number(row.verified || 0)),
        isOwn: Number(row.user_id) === Number(req.user.id),
        statuses: [],
      });
    }
    groups.get(key).statuses.push({
      id: row.id,
      type: row.status_type,
      text: row.text || '',
      mediaUrl: row.media_url || null,
      backgroundColor: row.background_color || '#123b8a',
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      viewed: Boolean(Number(row.viewed || 0)),
    });
  }

  const result = [...groups.values()].map((group) => ({
    ...group,
    viewedCount: group.statuses.filter((status) => status.viewed).length,
    statusCount: group.statuses.length,
  }));
  res.json({ statuses: result });
}));

router.post('/statuses', asyncRoute(async (req, res) => {
  const type = String(req.body?.type || 'text').trim().toLowerCase();
  const text = String(req.body?.text || '').trim().slice(0, 700);
  const mediaUrl = String(req.body?.mediaUrl || '').trim();
  const backgroundColor = /^#[0-9a-f]{6}$/i.test(String(req.body?.backgroundColor || ''))
    ? String(req.body.backgroundColor)
    : '#123b8a';

  if (!['text', 'image', 'video'].includes(type)) {
    return res.status(400).json({ message: 'Choose a text, image, or video status.' });
  }
  if (type === 'text' && !text) {
    return res.status(400).json({ message: 'Write something before posting your status.' });
  }
  if (type !== 'text' && !/^https?:\/\//i.test(mediaUrl) && !/^\/(?!\/)/.test(mediaUrl)) {
    return res.status(400).json({ message: 'Upload a valid image or video for this status.' });
  }
  if (type === 'video' && text.length > 300) {
    return res.status(400).json({ message: 'Video status captions must be 300 characters or fewer.' });
  }

  const expiresAt = new Date(Date.now() + DAY_MS).toISOString();
  const inserted = await db.insert(
    'INSERT INTO statuses (user_id, status_type, text, media_url, background_color, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.id, type, text, type === 'text' ? null : mediaUrl, backgroundColor, expiresAt],
  );
  const status = await db.getOne(
    `SELECT id, status_type AS type, text, media_url AS "mediaUrl",
            background_color AS "backgroundColor", created_at AS "createdAt", expires_at AS "expiresAt"
       FROM statuses WHERE id = ? AND user_id = ?`,
    [inserted.id, req.user.id],
  );
  res.status(201).json({ status });
}));

router.post('/statuses/:statusId/views', asyncRoute(async (req, res) => {
  const statusId = Number(req.params.statusId);
  if (!Number.isSafeInteger(statusId) || statusId < 1) {
    return res.status(400).json({ message: 'Invalid status ID.' });
  }
  const status = await db.getOne(
    'SELECT id, user_id FROM statuses WHERE id = ? AND expires_at > CURRENT_TIMESTAMP',
    [statusId],
  );
  if (!status) return notFound(res, 'This status is no longer available.');
  if (Number(status.user_id) !== Number(req.user.id)) {
    const existing = await db.getOne(
      'SELECT status_id FROM status_views WHERE status_id = ? AND viewer_id = ?',
      [statusId, req.user.id],
    );
    if (!existing) {
      await db.insert(
        'INSERT INTO status_views (status_id, viewer_id) VALUES (?, ?)',
        [statusId, req.user.id],
      );
    }
  }
  res.json({ viewed: true });
}));

router.delete('/statuses/:statusId', asyncRoute(async (req, res) => {
  const statusId = Number(req.params.statusId);
  if (!Number.isSafeInteger(statusId) || statusId < 1) {
    return res.status(400).json({ message: 'Invalid status ID.' });
  }
  const status = await db.getOne(
    'SELECT id FROM statuses WHERE id = ? AND user_id = ?',
    [statusId, req.user.id],
  );
  if (!status) return notFound(res, 'Status not found.');
  await db.delete('DELETE FROM status_views WHERE status_id = ?', [statusId]);
  await db.delete('DELETE FROM statuses WHERE id = ? AND user_id = ?', [statusId, req.user.id]);
  res.json({ deleted: true });
}));

module.exports = router;
