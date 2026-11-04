const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const {
  db, asyncRoute, clampLimit, notFound, toPost, uniqueConstraint,
} = require('./utils');
const {
  detectPostInterests, filterPostsByInterest, loadInterestProfile, normalizeSelectedInterests, rankPeople, rankPosts,
} = require('../algorithm');
const { classifyAdultSource } = require('../adult-content');
const { legacyEngagementFor } = require('../engagement');
const { getAccountForUser, isFlutterwavePaymentsConfigured } = require('../flutterwave');
const { notifyUser } = require('../notify');
const { getRecommendedFeed } = require('../services/recommendation-engine');
const { analyzeContent } = require('../services/content-classifier');

const router = express.Router();
const CATEGORIES = ['Technology', 'Programming', 'Artificial Intelligence', 'Business', 'Entrepreneurship', 'Education', 'Comedy', 'Music', 'Gaming', 'Sports', 'Fashion', 'Science', 'Digital Marketing', 'Lifestyle', 'Culture'];
const PREMIUM_POST_PRICE_NGN = '500.00';

function getBotSqlitePaths() {
  const candidates = [
    process.env.AI_POSTER_SQLITE_PATH,
    path.resolve(__dirname, '../test_database.sqlite'),
    path.resolve(__dirname, '../database.sqlite'),
  ];
  return [...new Set(candidates.filter(Boolean).map((entry) => path.resolve(entry)))];
}

function mergeUniquePosts(primaryPosts = [], secondaryPosts = []) {
  const seen = new Set();
  const merged = [];
  for (const post of [...primaryPosts, ...secondaryPosts]) {
    const identity = post?.sourceLink ? `source:${String(post.sourceLink)}` : `post:${String(post.id)}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    merged.push(post);
  }
  return merged.sort((left, right) => {
    const leftValue = new Date(left.createdAt || left.created_at || 0).getTime();
    const rightValue = new Date(right.createdAt || right.created_at || 0).getTime();
    return rightValue - leftValue;
  });
}

function readBotSqliteDatabase(databasePath) {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(databasePath, (error) => {
      if (error) return reject(error);
      resolve(database);
    });
  });
}

async function loadBotPostsForFeed(userId, options = {}) {
  const { query = '', limit = 60 } = options;
  const candidatePaths = getBotSqlitePaths();
  let latestBotPosts = [];

  for (const databasePath of candidatePaths) {
    if (!fs.existsSync(databasePath)) continue;
    let database;
    try {
      database = await readBotSqliteDatabase(databasePath);
      const whereClauses = [
        'p.community_id IS NULL',
        'COALESCE(u.is_synthetic, 0) = 1',
      ];
      const params = [userId, userId, userId, userId, userId, userId, userId, userId, userId];
      if (query) {
        whereClauses.push('(LOWER(p.body) LIKE LOWER(?) OR LOWER(COALESCE(p.category, \''\')) LIKE LOWER(?) OR LOWER(COALESCE(p.hashtags, \''\')) LIKE LOWER(?))');
        const likeQuery = `%${String(query).trim().slice(0, 100)}%`;
        params.push(likeQuery, likeQuery, likeQuery);
      }
      const sql = `
        SELECT p.id, p.author_id, p.body, p.kind, p.category, p.hashtags, p.target_interests, p.source_link,
               p.visibility, p.price_amount, p.price_currency, p.topics, p.keywords, p.audience_signals,
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
               CASE WHEN p.author_id = ? OR p.visibility = 'public' THEN 1 ELSE 0 END AS can_view
          FROM posts p
          JOIN users u ON u.id = p.author_id
          LEFT JOIN communities c ON c.id = p.community_id
         WHERE ${whereClauses.join(' AND ')}
         ORDER BY p.created_at DESC, p.id DESC LIMIT ?`;
      const rows = await new Promise((resolve, reject) => {
        database.all(sql, [...params, Number(limit)], (error, databaseRows) => {
          if (error) return reject(error);
          resolve(databaseRows || []);
        });
      });
      latestBotPosts = mergeUniquePosts(latestBotPosts, rows.map((row) => toPost(row)).filter((row) => !row.isUnavailable));
    } catch (_error) {
      // Ignore missing/invalid bot SQLite data and keep the main feed running.
    } finally {
      if (database) {
        await new Promise((resolve, reject) => {
          database.close((error) => (error ? reject(error) : resolve()));
        }).catch(() => {});
      }
    }
  }

  return latestBotPosts.slice(0, limit);
}

const POST_SELECT = `
  SELECT p.id, p.author_id, p.body, p.kind, p.category, p.hashtags, p.target_interests, p.source_link,
         p.visibility, p.price_amount, p.price_currency, p.topics, p.keywords, p.audience_signals,
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
           OR (p.community_id IS NOT NULL AND EXISTS(SELECT 1 FROM content_subscriptions cs WHERE cs.entity_type = 'community' AND cs.entity_id = p.community_id AND cs.subscriber_id = ? AND cs.status = 'active' AND cs.current_period_end > CURRENT_TIMESTAMP))
           THEN 1 ELSE 0 END AS can_view
     FROM posts p JOIN users u ON u.id = p.author_id LEFT JOIN communities c ON c.id = p.community_id`;

// Free communities and paid communities the reader belongs to may surface in the
// main feeds. Paid community posts stay out until the reader has an active pass.
const COMMUNITY_ACCESS = `(p.community_id IS NULL OR c.monthly_price IS NULL OR c.created_by = ?
  OR EXISTS (SELECT 1 FROM content_subscriptions cs
              WHERE cs.entity_type = 'community' AND cs.entity_id = p.community_id
                AND cs.subscriber_id = ? AND cs.status = 'active'
                AND cs.current_period_end > CURRENT_TIMESTAMP))`;

async function loadPeopleSuggestions(userId, limit = 5, interestProfile) {
  const people = await db.query(
    `SELECT u.id, u.fullname, u.username, u.bio, u.interests, u.avatar_url, u.picture, u.verified, u.is_synthetic,
            (SELECT COUNT(*) FROM follows f WHERE f.followed_id = u.id) AS follower_count
       FROM users u
      WHERE u.id <> ?
        AND NOT EXISTS (SELECT 1 FROM follows mine WHERE mine.follower_id = ? AND mine.followed_id = u.id)
      ORDER BY follower_count DESC, u.id DESC LIMIT ?`,
    [userId, userId, Math.max(limit * 5, 30)],
  );
  if (!people.length) return [];
  const ids = people.map((person) => person.id);
  const placeholders = ids.map(() => '?').join(',');
  const categoryRows = await db.query(
    `SELECT author_id, category FROM posts
       WHERE author_id IN (${placeholders}) AND category IS NOT NULL
     UNION
     SELECT l.user_id AS author_id, p.category FROM post_likes l
       JOIN posts p ON p.id = l.post_id
      WHERE l.user_id IN (${placeholders}) AND p.category IS NOT NULL
     UNION
     SELECT b.user_id AS author_id, p.category FROM bookmarks b
       JOIN posts p ON p.id = b.post_id
      WHERE b.user_id IN (${placeholders}) AND p.category IS NOT NULL
     UNION
     SELECT f.follower_id AS author_id, p.category FROM follows f
       JOIN posts p ON p.author_id = f.followed_id
      WHERE f.follower_id IN (${placeholders}) AND p.category IS NOT NULL`,
    [...ids, ...ids, ...ids, ...ids],
  );
  const profile = interestProfile || await loadInterestProfile(db, userId);
  return rankPeople(people, profile, categoryRows).slice(0, limit).map((person) => ({
    id: person.id,
    name: person.fullname || '',
    username: person.username || '',
    handle: person.username?.startsWith('@') ? person.username : `@${person.username || ''}`,
    bio: person.bio || '',
    picture: person.avatar_url || person.picture || null,
    verified: Boolean(Number(person.verified || 0)),
    isAutomated: Boolean(Number(person.is_synthetic || 0)),
    followers: Number(person.follower_count || 0),
  }));
}

async function loadCommunitySuggestions(userId, limit = 4) {
  const rows = await db.query(
    `SELECT c.id, c.slug, c.name, c.description, c.category, c.monthly_price, c.price_currency,
            (SELECT COUNT(*) FROM community_members cm WHERE cm.community_id = c.id) AS members
       FROM communities c
      WHERE NOT EXISTS (SELECT 1 FROM community_members mine
                         WHERE mine.community_id = c.id AND mine.user_id = ?)
      ORDER BY members DESC, c.created_at DESC LIMIT ?`,
    [userId, limit],
  );
  return rows.map((community) => ({
    id: community.id,
    slug: community.slug,
    name: community.name,
    description: community.description || '',
    category: community.category || '',
    members: Number(community.members || 0),
    isPaid: Boolean(community.monthly_price),
    monthlyPrice: community.monthly_price || null,
    currency: community.price_currency || 'NGN',
  }));
}

router.get('/home', asyncRoute(async (req, res) => {
  const tab = String(req.query.tab || 'All').trim();
  const live = req.query.live === '1';
  const limit = clampLimit(req.query.limit, 30, 100);

  if (tab.toLowerCase() === 'all') {
    const feedResult = await getRecommendedFeed(req.user.id, { tab, limit, live });
    const profile = await loadInterestProfile(db, req.user.id);
    const botPosts = await loadBotPostsForFeed(req.user.id, { query: '', limit: Math.max(limit * 2, 60) });
    const mergedPosts = mergeUniquePosts(feedResult.posts || [], botPosts);
    const response = {
      posts: interleaveAdultPosts(mergedPosts).slice(0, limit),
      boostedAccounts: feedResult.boostedAccounts || [],
      tab,
    };
    if (!live) {
      const [suggestedUsers, suggestedCommunities] = await Promise.all([
        loadPeopleSuggestions(req.user.id, 4, profile),
        loadCommunitySuggestions(req.user.id, 4),
      ]);
      response.suggestedUsers = suggestedUsers;
      response.suggestedCommunities = suggestedCommunities;
    }
    return res.json(response);
  }

  const hasInterestFilter = !['all', 'following'].includes(tab.toLowerCase());
  const conditions = [COMMUNITY_ACCESS];
  const params = [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id,
    req.user.id, req.user.id];

  if (tab.toLowerCase() === 'following') {
    conditions.push('(p.author_id IN (SELECT followed_id FROM follows WHERE follower_id = ?) OR p.id IN (SELECT post_id FROM post_reposts WHERE user_id IN (SELECT followed_id FROM follows WHERE follower_id = ?)))');
    params.push(req.user.id, req.user.id);
  }

  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const candidateLimit = live && !hasInterestFilter
    ? Math.min(300, Math.max(limit * 3, 90))
    : Math.min(300, Math.max(limit * 5, 100));
  params.push(candidateLimit);
  const rows = await db.query(`${POST_SELECT}${where} ORDER BY p.created_at DESC, p.id DESC LIMIT ?`, params);
  let posts = rows.map(toPost).filter((post) => !post.isUnavailable);
  const profile = await loadInterestProfile(db, req.user.id);

  if (hasInterestFilter) {
    posts = filterPostsByInterest(posts, tab);
  }

  const ranked = tab.toLowerCase() === 'following' ? posts : rankPosts(posts, profile);
  const botPosts = await loadBotPostsForFeed(req.user.id, { query: '', limit: Math.max(limit * 2, 60) });
  const timelinePosts = mergeUniquePosts(ranked, botPosts);
  const response = { posts: timelinePosts.slice(0, limit), tab };
  if (!live) {
    const [suggestedUsers, suggestedCommunities] = await Promise.all([
      loadPeopleSuggestions(req.user.id, 4, profile),
      loadCommunitySuggestions(req.user.id, 4),
    ]);
    response.suggestedUsers = suggestedUsers;
    response.suggestedCommunities = suggestedCommunities;
  }
  res.json(response);
}));

router.get('/explore', asyncRoute(async (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 100);
  const live = req.query.live === '1';
  const limit = clampLimit(req.query.limit, 24, 100);
  const candidateLimit = live ? Math.min(300, Math.max(limit * 3, 90)) : Math.min(300, Math.max(limit * 5, 100));
  const likeQuery = `%${query}%`;
  const conditions = [COMMUNITY_ACCESS];
  const params = [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id,
    req.user.id, req.user.id];
  if (query) conditions.push("(LOWER(p.body) LIKE LOWER(?) OR LOWER(COALESCE(p.category, '')) LIKE LOWER(?) OR LOWER(COALESCE(p.hashtags, '')) LIKE LOWER(?))");
  const where = ` WHERE ${conditions.join(' AND ')}`;
  if (query) params.push(likeQuery, likeQuery, likeQuery);
  params.push(candidateLimit);

  const postRows = await db.query(`${POST_SELECT}${where} ORDER BY p.created_at DESC, p.id DESC LIMIT ?`, params);
  const visiblePostRows = postRows.map(toPost).filter((post) => !post.isUnavailable);
  const interestProfile = await loadInterestProfile(db, req.user.id);
  const botPostRows = await loadBotPostsForFeed(req.user.id, { query, limit: candidateLimit });
  const mergedVisiblePostRows = mergeUniquePosts(visiblePostRows, botPostRows);
  const userRows = query && !live
    ? await db.query(
      `SELECT id, fullname, username, bio, avatar_url, picture, verified
         FROM users WHERE id <> ? AND (LOWER(fullname) LIKE LOWER(?) OR LOWER(username) LIKE LOWER(?))
        ORDER BY fullname LIMIT ?`,
      [req.user.id, likeQuery, likeQuery, clampLimit(req.query.userLimit, 10, 30)],
    )
    : [];

  const explorePosts = live
    ? mergedVisiblePostRows
    : rankPosts(mergedVisiblePostRows, interestProfile);
  const response = {
    categories: CATEGORIES,
    posts: interleaveAdultPosts(explorePosts).slice(0, limit),
    users: userRows.map((user) => ({
      id: user.id,
      name: user.fullname,
      username: user.username,
      handle: user.username?.startsWith('@') ? user.username : `@${user.username}`,
      bio: user.bio || '',
      picture: user.avatar_url || user.picture || null,
      verified: Boolean(Number(user.verified || 0)),
    })),
  };
  if (!live) {
    const [suggestedUsers, suggestedCommunities] = await Promise.all([
      loadPeopleSuggestions(req.user.id, 4, interestProfile),
      loadCommunitySuggestions(req.user.id, 4),
    ]);
    response.suggestedUsers = suggestedUsers;
    response.suggestedCommunities = suggestedCommunities;
  }
  res.json(response);
}));

function interleaveAdultPosts(posts, safePostsBetweenAdult = 4) {
  const regularPosts = [];
  const adultPosts = [];
  for (const post of posts) (post.isAdult || post.is_adult ? adultPosts : regularPosts).push(post);
  if (!adultPosts.length || !regularPosts.length) return posts;

  const mixed = [];
  let regularIndex = 0;
  let adultIndex = 0;
  while (regularIndex < regularPosts.length || adultIndex < adultPosts.length) {
    for (let count = 0; count < safePostsBetweenAdult && regularIndex < regularPosts.length; count += 1) {
      mixed.push(regularPosts[regularIndex++]);
    }
    if (adultIndex < adultPosts.length) mixed.push(adultPosts[adultIndex++]);
  }
  return mixed;
}

module.exports = router;
