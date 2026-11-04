const express = require('express');
const {
  db, asyncRoute, clampLimit, notFound, toPost, uniqueConstraint,
} = require('./utils');
const { loadInterestProfile, rankPosts } = require('../algorithm');
const { getAccountForUser, isFlutterwavePaymentsConfigured, parseMoney } = require('../flutterwave');

const router = express.Router();

const COMMUNITY_POST_SELECT = `
  SELECT p.id, p.author_id, p.body, p.kind, p.category, p.hashtags, p.target_interests, p.source_link,
         p.visibility, p.price_amount, p.price_currency,
         p.community_id, c.name AS community_name, p.media, p.video_id, p.created_at,
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
           OR (p.visibility = 'fans' AND EXISTS(SELECT 1 FROM content_subscriptions cs WHERE cs.entity_type = 'creator' AND cs.entity_id = p.author_id AND cs.subscriber_id = ? AND cs.status = 'active' AND cs.current_period_end > CURRENT_TIMESTAMP))
           OR EXISTS(SELECT 1 FROM content_subscriptions cs WHERE cs.entity_type = 'community' AND cs.entity_id = p.community_id AND cs.subscriber_id = ? AND cs.status = 'active' AND cs.current_period_end > CURRENT_TIMESTAMP)
           THEN 1 ELSE 0 END AS can_view
    FROM posts p JOIN users u ON u.id = p.author_id JOIN communities c ON c.id = p.community_id`;

router.get('/notifications', asyncRoute(async (req, res) => {
  const notifications = await db.query(
    `SELECT n.id, n.type, n.text, n.is_read, n.created_at, n.post_id, n.live_session_id,
            a.id AS actor_id, a.fullname AS actor_name, a.username AS actor_username, a.avatar_url AS actor_avatar,
            a.is_synthetic AS actor_is_synthetic
       FROM notifications n LEFT JOIN users a ON a.id = n.actor_id
      WHERE n.user_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT ?`,
    [req.user.id, clampLimit(req.query.limit, 50, 100)],
  );
  res.json({
    notifications: notifications.map((item) => ({
      id: item.id,
      type: item.type,
      text: item.text,
      read: Boolean(Number(item.is_read || 0)),
      postId: item.post_id,
      liveSessionId: item.live_session_id || null,
      time: relativeTime(item.created_at),
      createdAt: item.created_at,
      actor: item.actor_id ? {
        id: item.actor_id,
        name: item.actor_name,
        username: item.actor_username,
        handle: item.actor_username?.startsWith('@') ? item.actor_username : `@${item.actor_username || ''}`,
        picture: item.actor_avatar || null,
        isAutomated: Boolean(Number(item.actor_is_synthetic || 0)),
      } : null,
    })),
    unread: await db.getCount('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]),
  });
}));

router.get('/notifications/unread-count', asyncRoute(async (req, res) => {
  res.json({ unread: await db.getCount('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]) });
}));

router.patch('/notifications/read', asyncRoute(async (req, res) => {
  await db.update('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ message: 'Notifications marked as read.' });
}));

router.get('/communities', asyncRoute(async (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 100);
  const filter = query ? 'WHERE LOWER(c.name) LIKE LOWER(?) OR LOWER(c.category) LIKE LOWER(?)' : '';
  const params = query ? [req.user.id, req.user.id, req.user.id, `%${query}%`, `%${query}%`, clampLimit(req.query.limit, 50, 100)]
    : [req.user.id, req.user.id, req.user.id, clampLimit(req.query.limit, 50, 100)];
  const rows = await db.query(
    `SELECT c.id, c.slug, c.name, c.description, c.category, c.created_at, c.monthly_price, c.price_currency,
            (SELECT COUNT(*) FROM community_members cm WHERE cm.community_id = c.id) AS members,
            EXISTS(SELECT 1 FROM community_members mine WHERE mine.community_id = c.id AND mine.user_id = ?) AS joined,
            CASE WHEN c.created_by = ? OR c.monthly_price IS NULL
              OR EXISTS(SELECT 1 FROM content_subscriptions cs WHERE cs.entity_type = 'community' AND cs.entity_id = c.id AND cs.subscriber_id = ? AND cs.status = 'active' AND cs.current_period_end > CURRENT_TIMESTAMP)
              THEN 1 ELSE 0 END AS can_access
       FROM communities c ${filter} ORDER BY members DESC, c.name LIMIT ?`,
    params,
  );
  res.json({ communities: rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description || '',
    category: row.category || '',
    members: Number(row.members || 0),
    joined: Boolean(row.can_access),
    isPaid: Boolean(row.monthly_price),
    monthlyPrice: row.monthly_price || null,
    currency: row.price_currency || 'NGN',
    createdAt: row.created_at,
  })) });
}));

router.get('/communities/:communityId/posts', asyncRoute(async (req, res) => {
  const communityId = positiveId(req.params.communityId);
  const community = communityId ? await db.getOne(
    'SELECT id, name, slug, description, category, created_by, monthly_price, price_currency FROM communities WHERE id = ?',
    [communityId],
  ) : null;
  if (!community) return notFound(res, 'Community not found.');
  const isOwner = Number(community.created_by) === Number(req.user.id);
  const entitlement = community.monthly_price && !isOwner
    ? await db.getOne(
      `SELECT id FROM content_subscriptions WHERE entity_type = 'community' AND entity_id = ? AND subscriber_id = ?
        AND status = 'active' AND current_period_end > CURRENT_TIMESTAMP`,
      [communityId, req.user.id],
    )
    : null;
  const canAccess = !community.monthly_price || isOwner || Boolean(entitlement);
  const communityInfo = {
    id: community.id, name: community.name, slug: community.slug,
    description: community.description || '', category: community.category || '',
    isPaid: Boolean(community.monthly_price), monthlyPrice: community.monthly_price || null,
    currency: community.price_currency || 'NGN', canAccess,
  };
  if (!canAccess) return res.json({ community: communityInfo, posts: [], requiresSubscription: true });
  const rows = await db.query(
    `${COMMUNITY_POST_SELECT} WHERE p.community_id = ? ORDER BY p.created_at DESC, p.id DESC LIMIT ?`,
    [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, communityId, clampLimit(req.query.limit, 30, 100)],
  );
  const profile = await loadInterestProfile(db, req.user.id);
  res.json({ community: communityInfo, posts: rankPosts(rows.map(toPost).filter((post) => !post.isUnavailable), profile) });
}));

router.post('/communities', asyncRoute(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const category = String(req.body?.category || '').trim().slice(0, 80);
  const description = String(req.body?.description || '').trim();
  const paidPrice = String(req.body?.monthlyPrice || '').trim();
  const paidCents = paidPrice ? parseMoney(paidPrice) : null;
  if (paidPrice && (!paidCents || paidCents < 300000)) {
    return res.status(400).json({ message: 'A paid community pass must be at least ₦3,000 for 30 days.' });
  }
  if (!name || name.length > 100 || description.length > 1000) {
    return res.status(400).json({ message: 'Community name and description are invalid.' });
  }
  if (paidCents) {
    if (!isFlutterwavePaymentsConfigured()) return res.status(503).json({ message: 'Flutterwave payments are not fully configured yet.' });
    const owner = await db.getOne('SELECT is_synthetic FROM users WHERE id = ?', [req.user.id]);
    if (!owner || Number(owner.is_synthetic || 0) === 1) return res.status(403).json({ message: 'Automated accounts cannot create paid communities.' });
    const account = await getAccountForUser(req.user.id);
    if (!account?.ready) return res.status(409).json({ message: 'Add your Flutterwave payout bank account in Settings before creating a paid community.' });
  }
  const slugBase = slugify(name).slice(0, 60) || 'community';
  let slug = slugBase;
  for (let suffix = 2; await db.getOne('SELECT id FROM communities WHERE slug = ?', [slug]); suffix += 1) {
    slug = `${slugBase}-${suffix}`;
  }
  const community = await db.insert(
    'INSERT INTO communities (slug, name, description, category, created_by, monthly_price, price_currency) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [slug, name, description, category, req.user.id, paidCents ? centsToPrice(paidCents) : null, paidCents ? 'NGN' : null],
  );
  await db.query('INSERT INTO community_members (community_id, user_id) VALUES (?, ?)', [community.id, req.user.id]);
  res.status(201).json({ community: { ...community, slug, joined: true, members: 1 } });
}));

router.post('/communities/:communityId/join', asyncRoute(async (req, res) => {
  const communityId = positiveId(req.params.communityId);
  const community = communityId ? await db.getOne('SELECT id, monthly_price FROM communities WHERE id = ?', [communityId]) : null;
  if (!community) return notFound(res, 'Community not found.');
  if (community.monthly_price) return res.status(402).json({ message: 'Buy a 30-day community pass to join this paid community.' });
  try {
    await db.query('INSERT INTO community_members (community_id, user_id) VALUES (?, ?)', [communityId, req.user.id]);
  } catch (error) {
    if (!uniqueConstraint(error)) throw error;
  }
  res.json({ joined: true });
}));

router.delete('/communities/:communityId/join', asyncRoute(async (req, res) => {
  const communityId = positiveId(req.params.communityId);
  if (!communityId) return res.status(400).json({ message: 'Invalid community ID.' });
  await db.delete('DELETE FROM community_members WHERE community_id = ? AND user_id = ?', [communityId, req.user.id]);
  res.json({ joined: false });
}));

router.get('/lists', asyncRoute(async (req, res) => {
  const lists = await db.query(
    `SELECT l.id, l.owner_id, l.name, l.description, l.is_private, l.created_at,
            (SELECT COUNT(*) FROM list_members lm WHERE lm.list_id = l.id) AS members
       FROM lists l WHERE l.owner_id = ? ORDER BY l.created_at DESC`,
    [req.user.id],
  );
  res.json({ lists: lists.map(toList) });
}));

router.post('/lists', asyncRoute(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim();
  const isPrivate = req.body?.isPrivate === true || req.body?.isPrivate === 1 ||
    String(req.body?.isPrivate).toLowerCase() === 'true' ? 1 : 0;
  if (!name || name.length > 100 || description.length > 500) {
    return res.status(400).json({ message: 'List name and description are invalid.' });
  }
  const list = await db.insert(
    'INSERT INTO lists (owner_id, name, description, is_private) VALUES (?, ?, ?, ?)',
    [req.user.id, name, description, isPrivate],
  );
  await db.query('INSERT INTO list_members (list_id, user_id) VALUES (?, ?)', [list.id, req.user.id]);
  res.status(201).json({ list: { ...toList(list), members: 1 } });
}));

router.get('/lists/:listId', asyncRoute(async (req, res) => {
  const listId = positiveId(req.params.listId);
  const list = listId ? await db.getOne(
    `SELECT l.id, l.owner_id, l.name, l.description, l.is_private, l.created_at,
            (SELECT COUNT(*) FROM list_members lm WHERE lm.list_id = l.id) AS members
       FROM lists l WHERE l.id = ?`,
    [listId],
  ) : null;
  if (!list) return notFound(res, 'List not found.');
  if (Number(list.is_private) && Number(list.owner_id) !== req.user.id) return res.status(403).json({ message: 'This list is private.' });
  const members = await db.query(
    `SELECT u.id, u.fullname, u.username, u.avatar_url FROM list_members lm
       JOIN users u ON u.id = lm.user_id WHERE lm.list_id = ? ORDER BY u.fullname`,
    [listId],
  );
  res.json({ list: toList(list), members });
}));

router.delete('/lists/:listId', asyncRoute(async (req, res) => {
  const listId = positiveId(req.params.listId);
  if (!listId) return res.status(400).json({ message: 'Invalid list ID.' });
  const list = await db.getOne('SELECT id FROM lists WHERE id = ? AND owner_id = ?', [listId, req.user.id]);
  if (!list) return notFound(res, 'List not found or it belongs to another user.');
  await db.delete('DELETE FROM list_members WHERE list_id = ?', [listId]);
  await db.delete('DELETE FROM lists WHERE id = ? AND owner_id = ?', [listId, req.user.id]);
  res.json({ message: 'List deleted.' });
}));

router.post('/lists/:listId/members', asyncRoute(async (req, res) => {
  const listId = positiveId(req.params.listId);
  const userId = positiveId(req.body?.userId);
  if (!listId || !userId) return res.status(400).json({ message: 'List and user IDs are required.' });
  const list = await db.getOne('SELECT id FROM lists WHERE id = ? AND owner_id = ?', [listId, req.user.id]);
  if (!list) return notFound(res, 'List not found or it belongs to another user.');
  if (!await db.getOne('SELECT id FROM users WHERE id = ?', [userId])) return notFound(res, 'User not found.');
  try {
    await db.query('INSERT INTO list_members (list_id, user_id) VALUES (?, ?)', [listId, userId]);
  } catch (error) {
    if (!uniqueConstraint(error)) throw error;
  }
  res.json({ added: true });
}));

router.delete('/lists/:listId/members/:userId', asyncRoute(async (req, res) => {
  const listId = positiveId(req.params.listId);
  const userId = positiveId(req.params.userId);
  if (!listId || !userId) return res.status(400).json({ message: 'List and user IDs are required.' });
  const list = await db.getOne('SELECT id FROM lists WHERE id = ? AND owner_id = ?', [listId, req.user.id]);
  if (!list) return notFound(res, 'List not found or it belongs to another user.');
  await db.delete('DELETE FROM list_members WHERE list_id = ? AND user_id = ?', [listId, userId]);
  res.json({ removed: true });
}));

router.get(['/books', '/bookmarks'], asyncRoute(async (req, res) => {
  const rows = await db.query(
    `SELECT p.id, p.author_id, p.body, p.kind, p.category, p.hashtags, p.target_interests,
            p.visibility, p.price_amount, p.price_currency,
            p.community_id, c.name AS community_name, p.media, p.video_id, p.created_at,
            u.fullname AS name, u.username, u.avatar_url, u.picture, u.verified,
            u.creator_membership_price AS author_fan_price, u.creator_membership_currency AS author_fan_currency,
            u.interests AS author_interests, u.is_synthetic AS author_is_synthetic,
            (SELECT COUNT(*) FROM post_replies r WHERE r.post_id = p.id) AS reply_count,
            (SELECT COUNT(*) FROM post_reposts rr WHERE rr.post_id = p.id) AS share_count,
            (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS like_count,
            EXISTS(SELECT 1 FROM post_likes mine WHERE mine.post_id = p.id AND mine.user_id = ?) AS liked,
            1 AS bookmarked,
            EXISTS(SELECT 1 FROM post_reposts mine WHERE mine.post_id = p.id AND mine.user_id = ?) AS reposted,
            CASE WHEN p.author_id = ? OR p.visibility = 'public'
              OR (p.visibility = 'premium' AND EXISTS(SELECT 1 FROM content_purchases cp WHERE cp.post_id = p.id AND cp.user_id = ?))
              OR (p.visibility = 'fans' AND EXISTS(SELECT 1 FROM content_subscriptions cs WHERE cs.entity_type = 'creator' AND cs.entity_id = p.author_id AND cs.subscriber_id = ? AND cs.status = 'active' AND cs.current_period_end > CURRENT_TIMESTAMP))
              OR (p.community_id IS NOT NULL AND EXISTS(SELECT 1 FROM content_subscriptions cs WHERE cs.entity_type = 'community' AND cs.entity_id = p.community_id AND cs.subscriber_id = ? AND cs.status = 'active' AND cs.current_period_end > CURRENT_TIMESTAMP))
              THEN 1 ELSE 0 END AS can_view
       FROM bookmarks b JOIN posts p ON p.id = b.post_id JOIN users u ON u.id = p.author_id
       LEFT JOIN communities c ON c.id = p.community_id
      WHERE b.user_id = ? ORDER BY b.created_at DESC LIMIT ?`,
    [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, clampLimit(req.query.limit, 50, 100)],
  );
  res.json({ bookmarks: rows.map(toPost), posts: rows.map(toPost) });
}));

router.post('/posts/:postId/bookmark', asyncRoute(async (req, res) => {
  const postId = positiveId(req.params.postId);
  if (!postId || !await db.getOne('SELECT id FROM posts WHERE id = ?', [postId])) return notFound(res, 'Post not found.');
  try {
    await db.query('INSERT INTO bookmarks (user_id, post_id) VALUES (?, ?)', [req.user.id, postId]);
  } catch (error) {
    if (!uniqueConstraint(error)) throw error;
  }
  res.json({ bookmarked: true });
}));

router.delete('/posts/:postId/bookmark', asyncRoute(async (req, res) => {
  const postId = positiveId(req.params.postId);
  if (!postId) return res.status(400).json({ message: 'Invalid post ID.' });
  await db.delete('DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?', [req.user.id, postId]);
  res.json({ bookmarked: false });
}));

function toList(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description || '',
    isPrivate: Boolean(Number(row.is_private || 0)),
    members: Number(row.members || 0),
    createdAt: row.created_at,
  };
}

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function centsToPrice(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function relativeTime(value) {
  if (!value) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

module.exports = router;
