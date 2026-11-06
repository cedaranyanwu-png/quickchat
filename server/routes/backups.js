const express = require('express');
const { db, asyncRoute } = require('./utils');

const router = express.Router();

// Export only records belonging to the authenticated account. This is a user-data
// backup, not a raw database dump: credentials, tokens, and other users' profiles
// are intentionally excluded.
router.get('/backups/export', asyncRoute(async (req, res) => {
  const userId = req.user.id;
  const [profile, posts, videos, likes, reposts, bookmarks, replies, followers, following, messages] = await Promise.all([
    db.query(
      `SELECT id, fullname, username, email, bio, interests, location, website, avatar_url,
              cover_url, verified, created_at
         FROM users WHERE id = ?`,
      [userId],
    ),
    db.query(
      `SELECT id, body, kind, category, hashtags, target_interests, source_link, visibility,
              price_amount, price_currency, community_id, media, video_id, created_at
         FROM posts WHERE author_id = ? ORDER BY id`,
      [userId],
    ),
    db.query(
      `SELECT id, title, description, video_url, thumbnail_url, duration, views, created_at
         FROM videos WHERE user_id = ? ORDER BY id`,
      [userId],
    ),
    db.query('SELECT post_id, created_at FROM post_likes WHERE user_id = ? ORDER BY post_id', [userId]),
    db.query('SELECT post_id, created_at FROM post_reposts WHERE user_id = ? ORDER BY post_id', [userId]),
    db.query('SELECT post_id, created_at FROM bookmarks WHERE user_id = ? ORDER BY post_id', [userId]),
    db.query(
      'SELECT id, post_id, body, parent_reply_id, created_at FROM post_replies WHERE author_id = ? ORDER BY id',
      [userId],
    ),
    db.query(
      `SELECT u.id, u.fullname, u.username, f.created_at
         FROM follows f JOIN users u ON u.id = f.follower_id
        WHERE f.followed_id = ? ORDER BY f.created_at, u.id`,
      [userId],
    ),
    db.query(
      `SELECT u.id, u.fullname, u.username, f.created_at
         FROM follows f JOIN users u ON u.id = f.followed_id
        WHERE f.follower_id = ? ORDER BY f.created_at, u.id`,
      [userId],
    ),
    db.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.text, m.is_read, m.created_at
         FROM messages m
         JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
        WHERE cm.user_id = ? ORDER BY m.id`,
      [userId],
    ),
  ]);

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({
    exportedAt: new Date().toISOString(),
    tables: {
      profile,
      posts,
      videos,
      likes,
      reposts,
      bookmarks,
      replies,
      followers,
      following,
      messages,
    },
  });
}));

module.exports = router;
