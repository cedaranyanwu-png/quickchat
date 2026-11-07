const express = require('express');
const crypto = require('node:crypto');
const {
  db, asyncRoute, clampLimit, notFound, toPost, toProfile, uniqueConstraint,
} = require('./utils');
const { normalizeSelectedInterests } = require('../algorithm');
const { notifyUser } = require('../notify');
const { creditPoints, currentBalance, spendPoints } = require('../wallet');
const { getVerificationFeeNaira } = require('../platform-config');
const { flutterwaveRequest, isFlutterwaveSecretConfigured, isFlutterwaveWebhookSecretConfigured, publicAppUrl, flutterwaveWebhookUrl } = require('../flutterwave');

const router = express.Router();

const PROFILE_SELECT = `
  SELECT u.id, u.fullname, u.username, u.email, u.bio, u.interests, u.location, u.website, u.avatar_url, u.is_synthetic,
         u.payout_country, u.creator_membership_price, u.creator_membership_currency,
         u.business_enabled, u.recommendation_preferences,
         u.picture, u.cover_url, u.verified, u.verified_at, u.verification_method, u.createdat, u.created_at,
         (SELECT COUNT(*) FROM follows f WHERE f.followed_id = u.id) AS follower_count,
         (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) AS following_count,
         (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id) AS post_count,
         EXISTS(SELECT 1 FROM follows mine WHERE mine.follower_id = ? AND mine.followed_id = u.id) AS is_following
    FROM users u`;

const POST_SELECT = `
  SELECT p.id, p.author_id, p.body, p.kind, p.category, p.hashtags, p.target_interests, p.source_link,
         p.visibility, p.price_amount, p.price_currency,
         p.community_id, c.name AS community_name, p.rss_article_id, ra.title AS rss_article_title, ra.publisher AS rss_article_publisher, ra.article_url AS rss_article_url, ra.image_url AS rss_article_image_url, p.media, p.video_id, p.created_at,
         u.fullname AS name, u.username, u.avatar_url, u.picture, u.verified,
         u.creator_membership_price AS author_fan_price, u.creator_membership_currency AS author_fan_currency,
         u.interests AS author_interests, u.is_synthetic AS author_is_synthetic,
         (SELECT COUNT(*) FROM post_replies r WHERE r.post_id = p.id) AS reply_count,
         (SELECT COUNT(*) FROM post_reposts rr WHERE rr.post_id = p.id) AS share_count,
         (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS like_count,
         EXISTS(SELECT 1 FROM post_likes mine WHERE mine.post_id = p.id AND mine.user_id = ?) AS liked,
         EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = ?) AS bookmarked,
         EXISTS(SELECT 1 FROM post_reposts mine WHERE mine.post_id = p.id AND mine.user_id = ?) AS reposted,
         CASE WHEN p.author_id = ? OR p.visibility = 'public'
           OR (p.visibility = 'premium' AND EXISTS(SELECT 1 FROM content_purchases cp WHERE cp.post_id = p.id AND cp.user_id = ?))
           OR (p.visibility = 'fans' AND EXISTS(SELECT 1 FROM content_subscriptions cs WHERE cs.entity_type = 'creator' AND cs.entity_id = p.author_id AND cs.subscriber_id = ? AND cs.status = 'active'))
           OR (p.community_id IS NOT NULL AND EXISTS(SELECT 1 FROM content_subscriptions cs WHERE cs.entity_type = 'community' AND cs.entity_id = p.community_id AND cs.subscriber_id = ? AND cs.status = 'active'))
           THEN 1 ELSE 0 END AS can_view
    FROM posts p JOIN users u ON u.id = p.author_id LEFT JOIN communities c ON c.id = p.community_id LEFT JOIN rss_articles ra ON ra.id = p.rss_article_id`;

router.get('/profile/me', asyncRoute(async (req, res) => {
  const row = await db.getOne(`${PROFILE_SELECT} WHERE u.id = ?`, [req.user.id, req.user.id]);
  if (!row) return notFound(res, 'Your account was not found.');
  res.json({ profile: toProfile(row) });
}));

// Profile edits accept only normal fields and server-uploaded image URLs; the same
// avatar URL is mirrored into the legacy picture column for older account rows.
router.patch('/profile/me', asyncRoute(async (req, res) => {
  const current = await db.getOne(
    'SELECT id, fullname, username, bio, interests, location, website, avatar_url, cover_url, payout_country FROM users WHERE id = ?',
    [req.user.id],
  );
  if (!current) return notFound(res, 'Your account was not found.');

  const fullName = String(req.body?.fullName ?? current.fullname).trim();
  let username = String(req.body?.username ?? current.username).trim().replace(/^@/, '');
  const bio = String(req.body?.bio ?? current.bio ?? '').trim();
  const location = String(req.body?.location ?? current.location ?? '').trim();
  const website = String(req.body?.website ?? current.website ?? '').trim();
  const payoutCountry = String(req.body?.payoutCountry ?? current.payout_country ?? 'NG').trim().toUpperCase();
  const interests = req.body?.interests === undefined
    ? normalizeSelectedInterests(parseStoredInterests(current.interests)) || []
    : normalizeSelectedInterests(req.body.interests);
  const avatarUrl = req.body?.avatarUrl === undefined ? current.avatar_url : validProfileImage(req.body.avatarUrl);
  const coverUrl = req.body?.coverUrl === undefined ? current.cover_url : validProfileImage(req.body.coverUrl);
  if (avatarUrl === undefined || coverUrl === undefined) return res.status(400).json({ message: 'Profile images must be uploaded images or valid image URLs.' });
  if (!fullName || fullName.length > 100) return res.status(400).json({ message: 'Name is required and must be under 100 characters.' });
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) {
    return res.status(400).json({ message: 'Username must be 3 to 30 letters, numbers, dots, or underscores.' });
  }
  if (bio.length > 160 || location.length > 120 || website.length > 255) {
    return res.status(400).json({ message: 'One or more profile fields exceed their allowed length.' });
  }
  if (!['NG', 'US', 'CA'].includes(payoutCountry)) return res.status(400).json({ message: 'Payout country must be Nigeria, the United States, or Canada.' });
  if (!interests) return res.status(400).json({ message: 'Choose valid interests from the available list.' });

  try {
    const duplicate = await db.getOne(
      'SELECT id FROM users WHERE LOWER(REPLACE(username, ?, ?)) = LOWER(?) AND id <> ?',
      ['@', '', username, req.user.id],
    );
    if (duplicate) return res.status(409).json({ message: 'That username is already in use.' });

    await db.update(
      'UPDATE users SET fullname = ?, name = ?, username = ?, bio = ?, interests = ?, location = ?, website = ?, avatar_url = ?, picture = ?, cover_url = ?, payout_country = ? WHERE id = ?',
      [fullName, fullName, username, bio, JSON.stringify(interests), location, website, avatarUrl, avatarUrl, coverUrl, payoutCountry, req.user.id],
    );
    await db.delete('DELETE FROM user_interests WHERE user_id = ?', [req.user.id]);
    for (const interest of interests) {
      await db.insert('INSERT INTO user_interests (user_id, interest_key) VALUES (?, ?)', [req.user.id, interest]);
    }
    const row = await db.getOne(`${PROFILE_SELECT} WHERE u.id = ?`, [req.user.id, req.user.id]);
    res.json({ profile: toProfile(row) });
  } catch (error) {
    if (uniqueConstraint(error)) return res.status(409).json({ message: 'That username is already in use.' });
    throw error;
  }
}));

// Verification is a paid application. Flutterwave confirms the charge; an administrator awards the badge after review.
router.get('/verification/status', asyncRoute(async (req, res) => {
  const row = await db.getOne(
    'SELECT id, verified, verified_at, verification_method, fullname, username FROM users WHERE id = ?',
    [req.user.id],
  );
  if (!row) return notFound(res, 'User not found.');
  const verificationPrice = await getVerificationFeeNaira();
  const payment = await db.getOne(
    'SELECT status, amount, currency, paid_at, created_at FROM verification_fee_payments WHERE user_id = ? ORDER BY id DESC LIMIT 1',
    [req.user.id],
  );
  res.json({
    verified: Boolean(Number(row.verified || 0)),
    verifiedAt: row.verified_at || null,
    verificationMethod: row.verification_method || null,
    planPrice: String(verificationPrice),
    
    currency: 'NGN',
    paymentStatus: payment?.status || 'unpaid',
    payment,
  });
}));

router.post('/verification/checkout', asyncRoute(async (req, res) => {
  const user = await db.getOne('SELECT id, email, fullname, username, verified FROM users WHERE id = ?', [req.user.id]);
  if (!user) return notFound(res, 'User not found.');
  if (Number(user.verified || 0)) return res.status(409).json({ message: 'Your account is already verified.' });
  if (!isFlutterwaveSecretConfigured() || !isFlutterwaveWebhookSecretConfigured()) {
    return res.status(503).json({ message: 'Flutterwave is not fully configured. Please contact QuickChat support.' });
  }
  const fee = await getVerificationFeeNaira();
  const pending = await db.getOne("SELECT checkout_url, tx_ref FROM verification_fee_payments WHERE user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1", [req.user.id]);
  if (pending?.checkout_url && pending.tx_ref) return res.json({ checkoutUrl: pending.checkout_url, txRef: pending.tx_ref });
  const txRef = `qcverify_${req.user.id}_${crypto.randomUUID()}`;
  await db.insert(
    "INSERT INTO verification_fee_payments (user_id, tx_ref, amount, currency, status) VALUES (?, ?, ?, 'NGN', 'pending')",
    [req.user.id, txRef, `${fee}.00`],
  );
  try {
    const origin = publicAppUrl();
    flutterwaveWebhookUrl();
    const checkout = await flutterwaveRequest('POST', 'payments', {
      tx_ref: txRef,
      amount: `${fee}.00`,
      currency: 'NGN',
      redirect_url: `${origin}/api/payments/flutterwave/callback`,
      customer: { email: user.email, name: user.fullname || user.username || 'QuickChat member' },
      customizations: { title: 'QuickChat Verification', description: 'One-time account verification fee' },
      meta: { quickchat_kind: 'verification_fee', quickchat_user_id: String(user.id) },
    });
    const checkoutUrl = checkout?.data?.link;
    if (!checkoutUrl) throw Object.assign(new Error('Flutterwave did not return a checkout URL.'), { status: 502 });
    await db.update('UPDATE verification_fee_payments SET checkout_url = ? WHERE tx_ref = ?', [checkoutUrl, txRef]);
    res.status(201).json({ checkoutUrl, txRef, amount: fee, currency: 'NGN' });
  } catch (error) {
    await db.update("UPDATE verification_fee_payments SET status = 'failed' WHERE tx_ref = ?", [txRef]);
    throw error;
  }
}));

function parseStoredInterests(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(String(value || '[]')); } catch (_error) { return []; }
}

function validProfileImage(value) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? value : undefined;
  } catch (_error) {
    return undefined;
  }
}

router.get('/profile/me/posts', asyncRoute(async (req, res) => {
  const tab = String(req.query.tab || 'Posts').toLowerCase();
  const condition = tab === 'likes'
    ? 'p.id IN (SELECT post_id FROM post_likes WHERE user_id = ?)'
    : tab === 'media'
      ? "p.author_id = ? AND p.kind IN ('image', 'video')"
      : 'p.author_id = ?';
  const userParam = tab === 'likes' ? req.user.id : req.user.id;
  const rows = await db.query(
    `${POST_SELECT} WHERE ${condition} ORDER BY p.created_at DESC, p.id DESC LIMIT ?`,
    [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, userParam, clampLimit(req.query.limit, 30, 100)],
  );
  res.json({ posts: rows.map(toPost).filter((post) => !post.isUnavailable), tab });
}));

router.get('/profiles/:username', asyncRoute(async (req, res) => {
  const username = String(req.params.username || '').trim().replace(/^@/, '');
  const row = await db.getOne(
    `${PROFILE_SELECT} WHERE LOWER(REPLACE(u.username, ?, ?)) = LOWER(?)`,
    [req.user.id, '@', '', username],
  );
  if (!row) return notFound(res, 'Profile not found.');
  const profile = toProfile(row);
  const tab = String(req.query.tab || 'Posts').toLowerCase();
  const condition = tab === 'likes'
    ? 'p.id IN (SELECT post_id FROM post_likes WHERE user_id = ?)'
    : tab === 'media'
      ? "p.author_id = ? AND p.kind IN ('image', 'video')"
      : 'p.author_id = ?';
  const postOwner = tab === 'likes' ? profile.id : profile.id;
  const posts = await db.query(
    `${POST_SELECT} WHERE ${condition} ORDER BY p.created_at DESC, p.id DESC LIMIT ?`,
    [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, postOwner, clampLimit(req.query.limit, 30, 100)],
  );
  res.json({ profile, posts: posts.map(toPost).filter((post) => !post.isUnavailable), tab });
}));

router.get('/users', asyncRoute(async (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 100);
  const queryFilter = query
    ? "AND (LOWER(COALESCE(u.fullname, '')) LIKE LOWER(?) OR LOWER(COALESCE(u.username, '')) LIKE LOWER(?))"
    : '';
  // Keep bindings in the same order as their SQL placeholders for both SQLite and PostgreSQL:
  // following-state user, excluded current user, optional name/username patterns, then result limit.
  const params = [req.user.id, req.user.id];
  if (query) {
    const likeQuery = `%${query}%`;
    params.push(likeQuery, likeQuery);
  }
  params.push(clampLimit(req.query.limit, 20, 100));

  const users = await db.query(
    `SELECT u.id, u.fullname, u.username, u.bio, u.avatar_url, u.picture, u.verified, u.is_synthetic,
            EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followed_id = u.id) AS following
       FROM users u WHERE u.id <> ? ${queryFilter} ORDER BY LOWER(COALESCE(u.fullname, '')), u.id LIMIT ?`,
    params,
  );
  res.json({ users: users.map(toSuggestion) });
}));

router.get('/users/:userId/followers', listRelationships('followers'));
router.get('/users/:userId/following', listRelationships('following'));

function listRelationships(relationship) {
  return asyncRoute(async (req, res) => {
    const userId = positiveId(req.params.userId);
    if (!userId) return res.status(400).json({ message: 'Invalid user ID.' });
    if (!await db.getOne('SELECT id FROM users WHERE id = ?', [userId])) return notFound(res, 'User not found.');

    const limit = clampLimit(req.query.limit, 50, 100);
    const offset = Math.max(0, Math.min(100000, Number.parseInt(req.query.offset, 10) || 0));
    const relationColumn = relationship === 'followers' ? 'f.followed_id' : 'f.follower_id';
    const personColumn = relationship === 'followers' ? 'f.follower_id' : 'f.followed_id';
    const users = await db.query(
      `SELECT u.id, u.fullname, u.username, u.bio, u.avatar_url, u.picture, u.verified, u.is_synthetic,
              EXISTS(SELECT 1 FROM follows mine WHERE mine.follower_id = ? AND mine.followed_id = u.id) AS following
         FROM follows f JOIN users u ON u.id = ${personColumn}
        WHERE ${relationColumn} = ?
        ORDER BY f.created_at DESC, u.id DESC LIMIT ? OFFSET ?`,
      [req.user.id, userId, limit + 1, offset],
    );
    const hasMore = users.length > limit;
    const page = users.slice(0, limit);
    res.json({
      users: page.map(toSuggestion),
      hasMore,
      nextOffset: offset + page.length,
    });
  });
}

router.post('/users/:userId/follow', asyncRoute(async (req, res) => {
  const targetId = positiveId(req.params.userId);
  if (!targetId) return res.status(400).json({ message: 'Invalid user ID.' });
  if (targetId === req.user.id) return res.status(400).json({ message: 'You cannot follow your own account.' });
  if (!await db.getOne('SELECT id FROM users WHERE id = ?', [targetId])) return notFound(res, 'User not found.');

  let created = false;
  try {
    await db.query('INSERT INTO follows (follower_id, followed_id) VALUES (?, ?)', [req.user.id, targetId]);
    created = true;
  } catch (error) {
    if (!uniqueConstraint(error)) throw error;
  }
  if (created) {
    await notifyUser({
      userId: targetId,
      actorId: req.user.id,
      type: 'follow',
      text: 'followed you',
    });
  }
  res.json({ following: true });
}));

router.delete('/users/:userId/follow', asyncRoute(async (req, res) => {
  const targetId = positiveId(req.params.userId);
  if (!targetId) return res.status(400).json({ message: 'Invalid user ID.' });
  await db.delete('DELETE FROM follows WHERE follower_id = ? AND followed_id = ?', [req.user.id, targetId]);
  res.json({ following: false });
}));

function toSuggestion(row) {
  const username = row.username || '';
  return {
    id: row.id,
    name: row.fullname || '',
    username,
    handle: username.startsWith('@') ? username : `@${username}`,
    bio: row.bio || '',
    picture: row.avatar_url || row.picture || null,
    verified: Boolean(Number(row.verified || 0)),
    isAutomated: Boolean(Number(row.is_synthetic || 0)),
    following: Boolean(row.following),
  };
}

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

module.exports = router;
