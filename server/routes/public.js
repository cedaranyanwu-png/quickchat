const fs = require('fs');
const path = require('path');
const express = require('express');
const { db, asyncRoute, notFound, toPost } = require('./utils');

const router = express.Router();
const uploadDirectory = path.join(__dirname, '..', 'uploads');

// Public read-only previews let a recipient open a copied link without a QuickChat session.
router.get('/share/posts/:postId', asyncRoute(async (req, res) => {
  const postId = positiveId(req.params.postId);
  if (!postId) return res.status(400).json({ message: 'Invalid post ID.' });
  const post = await db.getOne(
    `SELECT p.id, p.author_id, p.body, p.kind, p.category, p.hashtags, p.target_interests, p.source_link,
            p.visibility, p.price_amount, p.price_currency,
            p.community_id, c.name AS community_name, p.media, p.video_id, p.created_at,
            u.fullname AS name, u.username, u.avatar_url, u.picture, u.verified,
            u.creator_membership_price AS author_fan_price, u.creator_membership_currency AS author_fan_currency,
            u.interests AS author_interests, u.is_synthetic AS author_is_synthetic,
            (SELECT COUNT(*) FROM post_replies r WHERE r.post_id = p.id) AS reply_count,
            (SELECT COUNT(*) FROM post_reposts rr WHERE rr.post_id = p.id) AS share_count,
            (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS like_count,
            0 AS liked, 0 AS bookmarked, 0 AS reposted,
            CASE WHEN p.visibility = 'public' AND p.community_id IS NULL THEN 1 ELSE 0 END AS can_view
       FROM posts p JOIN users u ON u.id = p.author_id
       LEFT JOIN communities c ON c.id = p.community_id
      WHERE p.id = ?`,
    [postId],
  );
  if (!post) return notFound(res, 'Post not found.');
  const sharePost = toPost(post);
  delete sharePost.authorInterests;
  delete sharePost.targetInterests;
  res.json({ post: sharePost });
}));

router.get('/share/videos/:videoId', asyncRoute(async (req, res) => {
  const videoId = positiveId(req.params.videoId);
  if (!videoId) return res.status(400).json({ message: 'Invalid video ID.' });
  const video = await db.getOne(
    `SELECT v.id, v.title, v.description, v.video_url, v.thumbnail_url, v.duration, v.views, v.created_at,
            u.id AS creator_id, u.fullname AS creator, u.username, u.avatar_url, u.picture
       FROM videos v JOIN users u ON u.id = v.user_id WHERE v.id = ?`,
    [videoId],
  );
  if (!video) return notFound(res, 'Video not found.');
  res.json({ video: toVideo(video) });
}));

// Uploads are already public for playback. This endpoint provides reliable attachment
// behavior even when the frontend and media server use different origins.
router.get('/downloads/:filename', asyncRoute(async (req, res) => {
  const filename = String(req.params.filename || '');
  if (!/^[a-f0-9-]{36}\.(jpg|png|gif|webp|mp4|webm|mov)$/i.test(filename)) {
    return res.status(400).json({ message: 'Invalid media file name.' });
  }
  const upload = await db.getOne('SELECT filename, mime_type FROM media_uploads WHERE filename = ?', [filename]);
  if (!upload) return notFound(res, 'Media file not found.');

  const filePath = path.join(uploadDirectory, filename);
  res.setHeader('Content-Type', upload.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(filePath, (error) => {
    if (error && !res.headersSent) res.status(error.statusCode || 404).json({ message: 'Media file not found.' });
  });
}));

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function toVideo(row) {
  const fields = Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key.toLowerCase(), value]));
  const username = fields.username || '';
  return {
    id: fields.id,
    title: fields.title,
    description: fields.description || '',
    videoUrl: fields.video_url,
    thumbnail: fields.thumbnail_url || null,
    duration: fields.duration || '',
    views: Number(fields.views || 0),
    creatorId: fields.creator_id || fields.user_id,
    creator: fields.creator || fields.fullname || '',
    username,
    handle: username.startsWith('@') ? username : `@${username}`,
    picture: fields.avatar_url || fields.picture || null,
    createdAt: fields.created_at,
  };
}

module.exports = router;
