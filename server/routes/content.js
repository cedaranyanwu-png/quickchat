const express = require('express');
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
const CATEGORIES = ['Technology', 'Programming', 'Artificial Intelligence', 'Business', 'Entrepreneurship', 'Education', 'Comedy', 'Music', 'Gaming', 'Sports', 'Fashion', 'Science', 'Digital Marketing', 'Design', 'Photography', 'Entertainment', 'Health and Fitness', 'Finance'];
const PREMIUM_POST_PRICE_NGN = '500.00';

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
    const response = {
      posts: interleaveAdultPosts(feedResult.posts),
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
  // Live polls need enough candidates to still find interest-matching posts.
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
  const timelinePosts = ranked;
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
  const userRows = query && !live
    ? await db.query(
      `SELECT id, fullname, username, bio, avatar_url, picture, verified
         FROM users WHERE id <> ? AND (LOWER(fullname) LIKE LOWER(?) OR LOWER(username) LIKE LOWER(?))
        ORDER BY fullname LIMIT ?`,
      [req.user.id, likeQuery, likeQuery, clampLimit(req.query.userLimit, 10, 30)],
    )
    : [];

  // Explore keeps the broader algorithm feed: every accessible post, ranked by
  // the reader's interests and freshness, rather than filtered to those interests.
  const explorePosts = live
    ? visiblePostRows
    : rankPosts(visiblePostRows, interestProfile);
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

router.get('/discover', asyncRoute(async (req, res) => {
  const trending = await db.query(
    `SELECT category, COUNT(*) AS post_count FROM posts
      WHERE category IS NOT NULL AND category <> '' GROUP BY category ORDER BY post_count DESC LIMIT 6`,
  );
  const trendingRows = await db.query(
    `SELECT p.id, p.body, p.category, p.source_link, p.media, p.created_at, u.fullname,
            (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS like_count,
            (SELECT COUNT(*) FROM post_replies r WHERE r.post_id = p.id) AS reply_count,
            (SELECT COUNT(*) FROM post_reposts rr WHERE rr.post_id = p.id) AS share_count,
            ((SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) * 2 +
             (SELECT COUNT(*) FROM post_replies r WHERE r.post_id = p.id) * 3 +
             (SELECT COUNT(*) FROM post_reposts rr WHERE rr.post_id = p.id) * 2) AS engagement_score
       FROM posts p JOIN users u ON u.id = p.author_id
      WHERE p.community_id IS NULL AND COALESCE(p.visibility, 'public') = 'public' AND TRIM(p.body) <> ''
      ORDER BY engagement_score DESC, p.created_at DESC, p.id DESC LIMIT 5`,
  );
  const mediaRows = await db.query(
    `SELECT p.id, p.body, p.category, p.source_link, p.media, p.created_at, u.fullname
       FROM posts p JOIN users u ON u.id = p.author_id
      WHERE p.community_id IS NULL AND COALESCE(p.visibility, 'public') = 'public' AND p.media IS NOT NULL AND p.media <> '' AND p.media <> '[]'
      ORDER BY CASE WHEN LOWER(p.media) LIKE '%video%' THEN 0 ELSE 1 END,
               p.created_at DESC, p.id DESC LIMIT 6`,
  );
  const people = await db.query(
    `SELECT u.id, u.fullname, u.username, u.bio, u.interests, u.avatar_url, u.picture, u.verified, u.is_synthetic,
            (SELECT COUNT(*) FROM follows f WHERE f.followed_id = u.id) AS follower_count
       FROM users u WHERE u.id <> ?
         AND NOT EXISTS (SELECT 1 FROM follows mine WHERE mine.follower_id = ? AND mine.followed_id = u.id)
      ORDER BY follower_count DESC LIMIT ?`,
    [req.user.id, req.user.id, 60],
  );
  const interestProfile = await loadInterestProfile(db, req.user.id);
  const categoryRows = people.length
    ? await db.query(
      `SELECT author_id, category FROM posts
        WHERE author_id IN (${people.map(() => '?').join(',')}) AND category IS NOT NULL
      UNION
      SELECT l.user_id AS author_id, p.category FROM post_likes l
        JOIN posts p ON p.id = l.post_id
        WHERE l.user_id IN (${people.map(() => '?').join(',')}) AND p.category IS NOT NULL
      UNION
      SELECT b.user_id AS author_id, p.category FROM bookmarks b
        JOIN posts p ON p.id = b.post_id
        WHERE b.user_id IN (${people.map(() => '?').join(',')}) AND p.category IS NOT NULL
      UNION
      SELECT f.follower_id AS author_id, p.category FROM follows f
        JOIN posts p ON p.author_id = f.followed_id
        WHERE f.follower_id IN (${people.map(() => '?').join(',')}) AND p.category IS NOT NULL`,
      [...people.map((person) => person.id), ...people.map((person) => person.id),
        ...people.map((person) => person.id), ...people.map((person) => person.id)],
    )
    : [];
  const prepareDiscoverPost = (post) => {
    const safety = classifyAdultSource(post.source_link);
    return safety.isUnavailable ? null : { ...post, is_adult: safety.isAdult };
  };
  res.json({
    categories: CATEGORIES,
    trending,
    trendingPosts: interleaveAdultPosts(trendingRows.map(prepareDiscoverPost).filter(Boolean)),
    mediaPosts: interleaveAdultPosts(mediaRows.map(prepareDiscoverPost).filter(Boolean)),
    people: rankPeople(people, interestProfile, categoryRows).slice(0, 5),
  });
}));

// These measurements use saved profile interests and actual existing posts.
// They are estimates and search matches, not guaranteed impressions or reach.
router.get('/composer/insights', asyncRoute(async (req, res) => {
  const interestsInput = String(req.query.interests || '').split(',').filter(Boolean);
  const interests = normalizeSelectedInterests(interestsInput) || [];
  const topic = String(req.query.topic || '').trim().slice(0, 80);
  const hashtags = normalizeHashtags(String(req.query.hashtags || '').split(','));

  let estimatedAudience = 0;
  if (interests.length) {
    const matches = interests.map(() => 'interests LIKE ?').join(' OR ');
    estimatedAudience = await db.getCount(
      `SELECT COUNT(*) AS count FROM users WHERE id <> ? AND (${matches})`,
      [req.user.id, ...interests.map((interest) => `%"${interest}"%`)],
    );
  }

  const topicPostCount = topic
    ? await db.getCount(
      'SELECT COUNT(*) AS count FROM posts WHERE community_id IS NULL AND LOWER(COALESCE(category, \'\')) = LOWER(?)',
      [topic],
    )
    : 0;
  const hashtagInsights = await Promise.all(hashtags.map(async (tag) => ({
    tag,
    postCount: await db.getCount(
      "SELECT COUNT(*) AS count FROM posts WHERE community_id IS NULL AND (LOWER(COALESCE(hashtags, '')) LIKE LOWER(?) OR LOWER(body) LIKE LOWER(?))",
      [`%"${tag}"%`, `%#${tag}%`],
    ),
  })));

  res.json({ estimatedAudience, topicPostCount, hashtags: hashtagInsights });
}));

router.get('/creator/analytics', asyncRoute(async (req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const [summary, rows] = await Promise.all([
    db.getOne(
      `SELECT COUNT(*) AS posts,
              COALESCE(SUM((SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id)), 0) AS likes,
              COALESCE(SUM((SELECT COUNT(*) FROM post_replies r WHERE r.post_id = p.id)), 0) AS replies,
              COALESCE(SUM((SELECT COUNT(*) FROM post_reposts rr WHERE rr.post_id = p.id)), 0) AS reposts
         FROM posts p WHERE p.author_id = ? AND p.created_at >= ?`,
      [req.user.id, since],
    ),
    db.query(
    `SELECT p.category,
            COUNT(*) AS posts,
            COALESCE(SUM((SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id)), 0) AS likes,
            COALESCE(SUM((SELECT COUNT(*) FROM post_replies r WHERE r.post_id = p.id)), 0) AS replies,
            COALESCE(SUM((SELECT COUNT(*) FROM post_reposts rr WHERE rr.post_id = p.id)), 0) AS reposts
       FROM posts p WHERE p.author_id = ? AND p.created_at >= ?
       GROUP BY p.category ORDER BY posts DESC LIMIT 10`,
    [req.user.id, since],
    ),
  ]);
  res.json({ days: 30, recentPerformance: {
    posts: Number(summary?.posts || 0),
    likes: Number(summary?.likes || 0),
    replies: Number(summary?.replies || 0),
    reposts: Number(summary?.reposts || 0),
  }, topics: rows.map((row) => ({
    topic: row.category || 'No topic',
    posts: Number(row.posts || 0),
    likes: Number(row.likes || 0),
    replies: Number(row.replies || 0),
    reposts: Number(row.reposts || 0),
  })) });
}));

router.get('/posts/:postId', asyncRoute(async (req, res) => {
  const postId = positiveId(req.params.postId);
  if (!postId) return res.status(400).json({ message: 'Invalid post ID.' });
  const post = await db.getOne(`${POST_SELECT} WHERE p.id = ?`, [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, postId]);
  if (!post) return notFound(res, 'Post not found.');
  res.json({ post: toPost(post) });
}));

router.post('/posts', asyncRoute(async (req, res) => {
  const body = String(req.body?.text || '').trim();
  const media = normalizeMedia(req.body?.media);
  const category = String(req.body?.category || '').trim().slice(0, 80) || null;
  const hashtags = normalizeHashtags(req.body?.hashtags);
  const targetInterests = normalizeSelectedInterests(req.body?.targetInterests || []);
  const visibility = ['public', 'fans', 'premium'].includes(String(req.body?.visibility || 'public'))
    ? String(req.body?.visibility || 'public')
    : null;
  const owner = await db.getOne('SELECT is_synthetic, creator_membership_price FROM users WHERE id = ?', [req.user.id]);
  if (!owner) return notFound(res, 'Your account was not found.');
  if (!visibility) return res.status(400).json({ message: 'Choose public, fans-only, or premium visibility.' });
  if (visibility !== 'public' && Number(owner.is_synthetic || 0) === 1) {
    return res.status(403).json({ message: 'Automated accounts cannot publish paid or fans-only posts.' });
  }
  if (visibility === 'premium') {
    if (!isFlutterwavePaymentsConfigured()) return res.status(503).json({ message: 'Flutterwave payments are not fully configured yet.' });
    const account = await getAccountForUser(req.user.id);
    if (!account?.ready) return res.status(409).json({ message: 'Add your Flutterwave payout bank account in Settings before monetizing a post.' });
  }
  if (visibility === 'fans' && !owner.creator_membership_price) {
    return res.status(409).json({ message: 'Enable a 30-day fan pass in Settings before publishing fans-only posts.' });
  }
  const priceAmount = visibility === 'premium' ? PREMIUM_POST_PRICE_NGN : null;
  const hasCommunityChoice = req.body?.communityId !== null && req.body?.communityId !== undefined && req.body?.communityId !== '';
  const communityId = req.body?.communityId === null || req.body?.communityId === undefined || req.body?.communityId === ''
    ? null
    : positiveId(req.body.communityId);
  const videoId = positiveId(req.body?.videoId);
  if (!body && media.length === 0 && !videoId) {
    return res.status(400).json({ message: 'Write something or attach media before posting.' });
  }
  if (body.length > 5000) return res.status(400).json({ message: 'Posts can contain at most 5,000 characters.' });
  if (!targetInterests || (hasCommunityChoice && !communityId)) {
    return res.status(400).json({ message: 'Choose valid audience interests and community options.' });
  }

  if (communityId) {
    const membership = await db.getOne(
      'SELECT community_id FROM community_members WHERE community_id = ? AND user_id = ?',
      [communityId, req.user.id],
    );
    if (!membership) return res.status(403).json({ message: 'Join that community before publishing there.' });
  }

  let topics = Array.isArray(req.body?.topics) ? req.body.topics : [];
  let keywords = Array.isArray(req.body?.keywords) ? req.body.keywords : [];
  let audienceSignals = Array.isArray(req.body?.audienceSignals) ? req.body.audienceSignals : [];

  if (!topics.length && !keywords.length && body) {
    try {
      const autoAnalysis = await analyzeContent({ text: body, hashtags });
      topics = autoAnalysis.topics || [];
      keywords = autoAnalysis.keywords || [];
      audienceSignals = autoAnalysis.audiences || [];
    } catch (_err) {}
  }

  const type = videoId || media.some((item) => item.type === 'video') ? 'video' : media.length ? 'image' : 'text';
  const result = await db.insert(
    'INSERT INTO posts (author_id, body, kind, category, hashtags, target_interests, community_id, media, video_id, visibility, price_amount, price_currency, topics, keywords, audience_signals) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [req.user.id, body, type, category, JSON.stringify(hashtags), JSON.stringify(targetInterests), communityId, JSON.stringify(media), videoId, visibility, priceAmount, priceAmount ? 'NGN' : null, JSON.stringify(topics), JSON.stringify(keywords), JSON.stringify(audienceSignals)],
  );
  const postId = Number(result?.id);
  if (!postId) return res.status(201).json({ message: 'Post created.' });

  const matchedInterests = detectPostInterests({ category, text: body, hashtags, targetInterests });
  if (matchedInterests.length) {
    const interestFilters = matchedInterests.map(() => 'LOWER(COALESCE(u.interests, \'\')) LIKE LOWER(?)').join(' OR ');
    const communityFilter = communityId
      ? 'AND EXISTS (SELECT 1 FROM community_members cm WHERE cm.community_id = ? AND cm.user_id = u.id)'
      : '';
    const params = [req.user.id, postId, `shared a post about ${matchedInterests.join(', ')}`, req.user.id,
      ...matchedInterests.map((interest) => `%"${interest}"%`)];
    if (communityId) params.push(communityId);
    params.push(1000);
    await db.query(
      `INSERT INTO notifications (user_id, actor_id, type, post_id, text)
       SELECT u.id, ?, 'interest_post', ?, ? FROM users u
        WHERE u.id <> ? AND (${interestFilters}) ${communityFilter}
        LIMIT ?`,
      params,
    );
  }
  const post = await db.getOne(`${POST_SELECT} WHERE p.id = ?`, [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, postId]);
  res.status(201).json({ post: toPost(post) });
}));

router.delete('/posts/:postId', asyncRoute(async (req, res) => {
  const postId = positiveId(req.params.postId);
  if (!postId) return res.status(400).json({ message: 'Invalid post ID.' });
  const post = await db.getOne('SELECT id FROM posts WHERE id = ? AND author_id = ?', [postId, req.user.id]);
  if (!post) return notFound(res, 'Post not found or it belongs to another user.');
  await db.delete('DELETE FROM post_likes WHERE post_id = ?', [postId]);
  await db.delete('DELETE FROM post_reposts WHERE post_id = ?', [postId]);
  await db.delete('DELETE FROM post_replies WHERE post_id = ?', [postId]);
  await db.delete('DELETE FROM bookmarks WHERE post_id = ?', [postId]);
  await db.delete('DELETE FROM notifications WHERE post_id = ?', [postId]);
  await db.delete('DELETE FROM posts WHERE id = ? AND author_id = ?', [postId, req.user.id]);
  res.json({ message: 'Post deleted.' });
}));

router.post('/posts/:postId/likes', asyncRoute(async (req, res) => {
  const postId = positiveId(req.params.postId);
  const post = postId ? await db.getOne('SELECT id, author_id, created_at FROM posts WHERE id = ?', [postId]) : null;
  if (!post) return notFound(res, 'Post not found.');
  if (!await canViewPost(postId, req.user.id)) return res.status(403).json({ message: 'Unlock this post before interacting with it.' });
  const alreadyLiked = await db.getOne('SELECT user_id FROM post_likes WHERE post_id = ? AND user_id = ?', [postId, req.user.id]);
  if (!alreadyLiked) {
    await db.query('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)', [postId, req.user.id]);
    await notify(post.author_id, req.user.id, 'like', postId, 'liked your post');
  }
  const recorded = await db.getCount('SELECT COUNT(*) AS count FROM post_likes WHERE post_id = ?', [postId]);
  res.json({ liked: true, likes: recorded + legacyEngagementFor(post).likes });
}));

router.delete('/posts/:postId/likes', asyncRoute(async (req, res) => {
  const postId = positiveId(req.params.postId);
  if (!postId) return res.status(400).json({ message: 'Invalid post ID.' });
  const post = await db.getOne('SELECT id, created_at FROM posts WHERE id = ?', [postId]);
  if (!post) return notFound(res, 'Post not found.');
  await db.delete('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?', [postId, req.user.id]);
  const recorded = await db.getCount('SELECT COUNT(*) AS count FROM post_likes WHERE post_id = ?', [postId]);
  res.json({ liked: false, likes: recorded + legacyEngagementFor(post).likes });
}));

router.post('/posts/:postId/reposts', asyncRoute(async (req, res) => {
  const postId = positiveId(req.params.postId);
  const post = postId ? await db.getOne('SELECT id, author_id FROM posts WHERE id = ?', [postId]) : null;
  if (!post) return notFound(res, 'Post not found.');
  if (!await canViewPost(postId, req.user.id)) return res.status(403).json({ message: 'Unlock this post before interacting with it.' });
  const existing = await db.getOne('SELECT user_id FROM post_reposts WHERE post_id = ? AND user_id = ?', [postId, req.user.id]);
  if (!existing) {
    try {
      await db.query('INSERT INTO post_reposts (post_id, user_id) VALUES (?, ?)', [postId, req.user.id]);
      await notify(post.author_id, req.user.id, 'repost', postId, 'reposted your post');
    } catch (error) {
      if (!uniqueConstraint(error)) throw error;
    }
  }
  res.json({ reposted: true, shares: await db.getCount('SELECT COUNT(*) AS count FROM post_reposts WHERE post_id = ?', [postId]) });
}));

router.delete('/posts/:postId/reposts', asyncRoute(async (req, res) => {
  const postId = positiveId(req.params.postId);
  if (!postId) return res.status(400).json({ message: 'Invalid post ID.' });
  await db.delete('DELETE FROM post_reposts WHERE post_id = ? AND user_id = ?', [postId, req.user.id]);
  res.json({ reposted: false, shares: await db.getCount('SELECT COUNT(*) AS count FROM post_reposts WHERE post_id = ?', [postId]) });
}));

router.get('/posts/:postId/replies', asyncRoute(async (req, res) => {
  const postId = positiveId(req.params.postId);
  if (!postId) return res.status(400).json({ message: 'Invalid post ID.' });
  if (!await canViewPost(postId, req.user.id)) return res.status(403).json({ message: 'Unlock this post to view replies.' });
  const replies = await db.query(
    `SELECT r.id, r.post_id, r.body, r.created_at, u.id AS user_id, u.fullname, u.username, u.avatar_url, u.is_synthetic
       FROM post_replies r JOIN users u ON u.id = r.author_id
      WHERE r.post_id = ? ORDER BY r.created_at ASC LIMIT ?`,
    [postId, clampLimit(req.query.limit, 50, 100)],
  );
  res.json({ replies: replies.map((reply) => ({ ...reply, isAutomated: Boolean(Number(reply.is_synthetic || 0)) })) });
}));

router.post('/posts/:postId/replies', asyncRoute(async (req, res) => {
  const postId = positiveId(req.params.postId);
  const body = String(req.body?.text || '').trim();
  const post = postId ? await db.getOne('SELECT id, author_id FROM posts WHERE id = ?', [postId]) : null;
  if (!post) return notFound(res, 'Post not found.');
  if (!await canViewPost(postId, req.user.id)) return res.status(403).json({ message: 'Unlock this post before replying.' });
  if (!body || body.length > 2000) return res.status(400).json({ message: 'Replies must be 1 to 2,000 characters.' });
  const reply = await db.insert(
    'INSERT INTO post_replies (post_id, author_id, body) VALUES (?, ?, ?)',
    [postId, req.user.id, body],
  );
  await notify(post.author_id, req.user.id, 'reply', postId, 'replied to your post');
  res.status(201).json({ reply });
}));

router.get('/videos', asyncRoute(async (req, res) => {
  const videos = await db.query(
    `SELECT v.id, v.title, v.description, v.video_url, v.thumbnail_url, v.duration, v.views, v.created_at,
            u.id AS creator_id, u.fullname AS creator, u.username, u.avatar_url, u.picture
       FROM videos v JOIN users u ON u.id = v.user_id ORDER BY v.created_at DESC LIMIT ?`,
    [clampLimit(req.query.limit, 30, 100)],
  );
  res.json({ videos: videos.map(toVideo) });
}));

router.get('/videos/:videoId', asyncRoute(async (req, res) => {
  const videoId = positiveId(req.params.videoId);
  if (!videoId) return res.status(400).json({ message: 'Invalid video ID.' });
  const video = await db.getOne(
    `SELECT v.*, u.fullname AS creator, u.username, u.avatar_url, u.picture
       FROM videos v JOIN users u ON u.id = v.user_id WHERE v.id = ?`,
    [videoId],
  );
  if (!video) return notFound(res, 'Video not found.');
  res.json({ video: toVideo(video) });
}));

router.post('/videos', asyncRoute(async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const videoUrl = validMediaUrl(req.body?.videoUrl);
  if (!title || title.length > 180 || !videoUrl) {
    return res.status(400).json({ message: 'A title and valid video URL are required.' });
  }
  const inserted = await db.insert(
    'INSERT INTO videos (user_id, title, description, video_url, thumbnail_url, duration) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.id, title, String(req.body?.description || '').slice(0, 5000), videoUrl,
      validMediaUrl(req.body?.thumbnailUrl), String(req.body?.duration || '').slice(0, 20)],
  );
  const video = await db.getOne(
    `SELECT v.*, u.fullname AS creator, u.username, u.avatar_url, u.picture
       FROM videos v JOIN users u ON u.id = v.user_id WHERE v.id = ?`,
    [inserted.id],
  );
  res.status(201).json({ video: toVideo(video) });
}));

router.post('/videos/:videoId/views', asyncRoute(async (req, res) => {
  const videoId = positiveId(req.params.videoId);
  const changed = videoId ? await db.update('UPDATE videos SET views = views + 1 WHERE id = ?', [videoId]) : 0;
  if (!changed) return notFound(res, 'Video not found.');
  res.json({ views: await db.getCount('SELECT views AS count FROM videos WHERE id = ?', [videoId]) });
}));

router.get('/videos/:videoId/comments', asyncRoute(async (req, res) => {
  const videoId = positiveId(req.params.videoId);
  if (!videoId) return res.status(400).json({ message: 'Invalid video ID.' });
  const comments = await db.query(
    `SELECT c.id, c.video_id, c.body, c.created_at, u.id AS user_id, u.fullname, u.username, u.avatar_url
       FROM video_comments c JOIN users u ON u.id = c.author_id
      WHERE c.video_id = ? ORDER BY c.created_at ASC LIMIT ?`,
    [videoId, clampLimit(req.query.limit, 50, 100)],
  );
  res.json({ comments });
}));

router.post('/videos/:videoId/comments', asyncRoute(async (req, res) => {
  const videoId = positiveId(req.params.videoId);
  const body = String(req.body?.text || '').trim();
  const video = videoId ? await db.getOne('SELECT id, user_id FROM videos WHERE id = ?', [videoId]) : null;
  if (!video) return notFound(res, 'Video not found.');
  if (!body || body.length > 2000) return res.status(400).json({ message: 'Comments must be 1 to 2,000 characters.' });
  const comment = await db.insert('INSERT INTO video_comments (video_id, author_id, body) VALUES (?, ?, ?)', [videoId, req.user.id, body]);
  if (Number(video.user_id) !== Number(req.user.id)) {
    await notifyUser({
      userId: video.user_id,
      actorId: req.user.id,
      type: 'video_comment',
      text: 'commented on your video',
    });
  }
  res.status(201).json({ comment });
}));

function normalizeMedia(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).map((item) => {
    const url = validMediaUrl(item?.url);
    const type = item?.type === 'video' ? 'video' : 'image';
    const thumbnailUrl = type === 'video' ? validMediaUrl(item?.thumbnailUrl) : null;
    return url ? { type, url, ...(thumbnailUrl ? { thumbnailUrl } : {}) } : null;
  }).filter(Boolean);
}

function normalizeHashtags(value) {
  const candidates = Array.isArray(value) ? value : [];
  const normalized = candidates.map((item) => String(item || '').trim().replace(/^#+/, '').toLowerCase())
    .filter((tag) => /^[a-z0-9_]{1,40}$/.test(tag));
  return [...new Set(normalized)].slice(0, 10);
}

function validMediaUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  const url = value.trim();
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? url : null;
  } catch (_error) {
    return null;
  }
}

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function canViewPost(postId, userId) {
  const row = await db.getOne(
    `SELECT CASE WHEN p.author_id = ? OR p.visibility = 'public'
      OR (p.visibility = 'premium' AND EXISTS(SELECT 1 FROM content_purchases cp WHERE cp.post_id = p.id AND cp.user_id = ?))
      OR (p.visibility = 'fans' AND EXISTS(SELECT 1 FROM content_subscriptions cs WHERE cs.entity_type = 'creator' AND cs.entity_id = p.author_id AND cs.subscriber_id = ? AND cs.status = 'active' AND cs.current_period_end > CURRENT_TIMESTAMP))
      OR (p.community_id IS NOT NULL AND EXISTS(SELECT 1 FROM content_subscriptions cs WHERE cs.entity_type = 'community' AND cs.entity_id = p.community_id AND cs.subscriber_id = ? AND cs.status = 'active' AND cs.current_period_end > CURRENT_TIMESTAMP))
      THEN 1 ELSE 0 END AS can_view
       FROM posts p WHERE p.id = ?`,
    [userId, userId, userId, userId, postId],
  );
  return Boolean(Number(row?.can_view || 0));
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

async function notify(recipientId, actorId, type, postId, text) {
  await notifyUser({ userId: recipientId, actorId, type, postId, text });
}

module.exports = router;
