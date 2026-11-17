const db = require('../database');
const { loadInterestProfile, detectPostInterests, rankPosts, parseInterestList } = require('../algorithm');
const { toPost } = require('../routes/utils');
const { getEligibleAds } = require('./ads-service');
const { getEligibleBoostedPosts, getEligibleBoostedProfiles } = require('./boost-service');
const { getBusinessProfile, getBusinessOpportunities } = require('./business-service');
const { getOrCreateRecProfile, getUserNegativeFilters, recordImpressions } = require('./feedback-service');
const { rerankCandidates } = require('./jev-recommendation');

const CONFIGURABLE_WEIGHTS = {
  interestMatch: 4.5,
  topicMatch: 2.5,
  businessRelevance: 2.0,
  freshness: 1.5,
  trendingScore: 1.2,
};

// SQL select for posts matching standard QuickChat schema
const POST_SELECT = `
  SELECT p.id, p.author_id, p.body, p.kind, p.category, p.hashtags, p.target_interests, p.source_link,
         p.visibility, p.price_amount, p.price_currency, p.topics, p.keywords, p.audience_signals,
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
           OR (p.visibility = 'fans' AND EXISTS(SELECT 1 FROM content_subscriptions cs WHERE cs.entity_type = 'creator' AND cs.entity_id = p.author_id AND cs.subscriber_id = ? AND cs.status = 'active' AND cs.current_period_end > CURRENT_TIMESTAMP))
           OR (p.community_id IS NOT NULL AND EXISTS(SELECT 1 FROM content_subscriptions cs WHERE cs.entity_type = 'community' AND cs.entity_id = p.community_id AND cs.subscriber_id = ? AND cs.status = 'active' AND cs.current_period_end > CURRENT_TIMESTAMP))
           THEN 1 ELSE 0 END AS can_view
    FROM posts p JOIN users u ON u.id = p.author_id LEFT JOIN communities c ON c.id = p.community_id LEFT JOIN rss_articles ra ON ra.id = p.rss_article_id`;

const COMMUNITY_ACCESS = `(p.community_id IS NULL OR c.monthly_price IS NULL OR c.created_by = ?
  OR EXISTS (SELECT 1 FROM content_subscriptions cs
              WHERE cs.entity_type = 'community' AND cs.entity_id = p.community_id
                AND cs.subscriber_id = ? AND cs.status = 'active'
                AND cs.current_period_end > CURRENT_TIMESTAMP))`;

function calculateTrendingScore(row) {
  const likes = Number(row.like_count || 0);
  const replies = Number(row.reply_count || 0);
  const reposts = Number(row.share_count || 0);
  const rawEngagement = likes * 1.5 + replies * 2.5 + reposts * 2.0;

  // Anti-manipulation check: penalize if likes to replies ratio is suspicious (> 100:0)
  const ratioPenalty = (likes > 50 && replies === 0) ? 0.4 : 1.0;

  // Time decay: 48h half-life
  const ageHours = Math.max(0.1, (Date.now() - new Date(row.created_at || 0).getTime()) / 3600000);
  const decay = 1 / Math.pow(1 + ageHours / 24, 1.2);

  return rawEngagement * ratioPenalty * decay;
}

/**
 * Central recommendation candidate generator and ranker
 */
async function getRecommendedFeed(userId, { tab = 'All', limit = 30, live = false } = {}) {
  const [userProfile, interestProfile, recProfile, negativeFilters, bizProfile] = await Promise.all([
    db.getOne('SELECT interests, location FROM users WHERE id = ?', [userId]),
    loadInterestProfile(db, userId),
    getOrCreateRecProfile(userId),
    getUserNegativeFilters(userId),
    getBusinessProfile(userId),
  ]);

  const declaredInterests = parseInterestList(userProfile?.interests);
  const targetInterests = declaredInterests.length > 0 ? declaredInterests : [...interestProfile.keys()];
  const bizCategory = bizProfile?.businessCategory || '';

  // 1. Candidate Retrieval: Organic Posts
  const conditions = [COMMUNITY_ACCESS];
  const params = [userId, userId, userId, userId, userId, userId, userId, userId, userId];

  if (tab.toLowerCase() === 'following') {
    conditions.push('(p.author_id IN (SELECT followed_id FROM follows WHERE follower_id = ?) OR p.id IN (SELECT post_id FROM post_reposts WHERE user_id IN (SELECT followed_id FROM follows WHERE follower_id = ?)))');
    params.push(userId, userId);
  }

  const whereClause = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const candidateLimit = live ? 60 : 120;
  params.push(candidateLimit);

  const postRows = await db.query(
    `${POST_SELECT}${whereClause} ORDER BY p.created_at DESC, p.id DESC LIMIT ?`,
    params
  );

  let candidatePosts = postRows
    .map(toPost)
    .filter((post) => !post.isUnavailable && !negativeFilters.hiddenPostIds.has(post.id) && !negativeFilters.hiddenUserIds.has(post.authorId));

  // 2. Candidate Retrieval: Trending Posts
  const trendingCandidates = candidatePosts.map((post) => ({
    post,
    trendingScore: calculateTrendingScore(post),
  })).sort((a, b) => b.trendingScore - a.trendingScore);

  // 3. Candidate Retrieval: Boosted Posts (Process B eligibility check)
  const boostedCandidates = await getEligibleBoostedPosts({
    userInterests: targetInterests,
    limit: 4,
  });

  const boostedPostIds = new Set(boostedCandidates.map((b) => b.post_id));

  // 4. Candidate Retrieval: Sponsored Ads (Process B eligibility check)
  let sponsoredAds = [];
  if (recProfile.preferences.personalized_ads !== false && tab.toLowerCase() !== 'following') {
    sponsoredAds = await getEligibleAds({
      userInterests: targetInterests,
      businessCategory: bizCategory,
      limit: 3,
    });
    // Filter out ads the user marked not_interested
    sponsoredAds = sponsoredAds.filter((ad) => !negativeFilters.hiddenAdIds.has(ad.id));
  }

  // 5. Candidate Retrieval: Boosted Accounts
  let boostedAccounts = [];
  if (!live && tab.toLowerCase() !== 'following') {
    boostedAccounts = await getEligibleBoostedProfiles({
      userInterests: targetInterests,
      currentUserId: userId,
      limit: 2,
    });
  }

  // PROCESS A: Relevance Scoring for Organic Posts
  const scoredPosts = candidatePosts.map((post) => {
    let score = 0;
    const postTopics = detectPostInterests(post);
    const postCategory = post.category || '';

    // A. Interest match
    let interestScore = 0;
    for (const interest of postTopics) {
      interestScore += (interestProfile.get(interest) || 0);
      if (declaredInterests.includes(interest)) interestScore += 1.5;
    }
    score += Math.min(3, interestScore) * CONFIGURABLE_WEIGHTS.interestMatch;

    // B. Feedback learning weights
    const userCategoryWeight = recProfile.personalWeights[postCategory];
    if (userCategoryWeight !== undefined) {
      score += (userCategoryWeight - 1.0) * 2.0;
    }

    // C. Business relevance
    if (bizCategory && post.text) {
      if (post.text.toLowerCase().includes(bizCategory.toLowerCase())) {
        score += CONFIGURABLE_WEIGHTS.businessRelevance;
      }
    }

    // D. Freshness
    const ageHours = Math.max(0, (Date.now() - new Date(post.createdAt || 0).getTime()) / 3600000);
    const freshnessScore = 1 / (1 + ageHours / 36);
    score += freshnessScore * CONFIGURABLE_WEIGHTS.freshness;

    // E. Boosted flag
    const isBoosted = boostedPostIds.has(post.id);
    if (isBoosted) score += 3.0; // Modest boost in score, but respects relevance

    return {
      ...post,
      isPromoted: isBoosted,
      isSponsored: false,
      itemType: 'post',
      relevanceScore: score,
      recommendationReason: isBoosted
        ? 'Promoted post'
        : postTopics.length > 0 && targetInterests.includes(postTopics[0])
          ? `Because you're interested in ${postTopics[0]}`
          : postCategory
            ? `Recommended in ${postCategory}`
            : 'Recommended for you',
    };
  });

  // Sort by final score, while keeping a creator's newest video uploads
  // visible after the feed refresh. Without this small freshness guarantee,
  // an interest-ranked page can immediately push a just-published video out.
  if (tab.toLowerCase() !== 'following') {
    scoredPosts.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  let feedCandidates = rankedPosts;
  if (tab.toLowerCase() === 'all') {
    const recentOwnVideos = rankedPosts
      .filter((post) => {
        if (Number(post.authorId) !== Number(userId) || post.type !== 'video') return false;
        const createdAt = new Date(post.createdAt || 0).getTime();
        return Number.isFinite(createdAt) && Date.now() - createdAt <= 24 * 60 * 60 * 1000;
      })
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 3);
    if (recentOwnVideos.length) {
      const pinnedIds = new Set(recentOwnVideos.map((post) => String(post.id)));
      feedCandidates = [...recentOwnVideos, ...rankedPosts.filter((post) => !pinnedIds.has(String(post.id)))];
    }
  }

  // Jev is a bounded decision layer over the deterministic candidate ranker.
  // The existing scoring remains the fallback and provides the initial candidate set;
  // Jev only reranks the strongest candidates and never controls visibility/access rules.
  const jevResult = await rerankCandidates({
    user: {
      interests: targetInterests,
      location: userProfile?.location || '',
      businessCategory: bizCategory,
      preferredCategories: Object.keys(recProfile.personalWeights || {}),
    },
    posts: scoredPosts,
  });
  const rankedPosts = jevResult.posts;

  // PROCESS B: Blending, Diversification & Frequency Capping
  // Interleave organic posts with sponsored ads and boosted promotions:
  // Frequency cap: At most 1 sponsored ad every 5 items.
  const blendedFeed = [];
  let adIndex = 0;
  let organicCountSinceLastAd = 0;

  for (let i = 0; i < feedCandidates.length; i++) {
    blendedFeed.push(feedCandidates[i]);
    organicCountSinceLastAd++;

    // Inject sponsored ad every 5 posts if eligible
    if (organicCountSinceLastAd >= 5 && adIndex < sponsoredAds.length) {
      blendedFeed.push(sponsoredAds[adIndex++]);
      organicCountSinceLastAd = 0;
    }
  }

  // Record impressions asynchronously for feedback learning
  if (!live && blendedFeed.length > 0) {
    void recordImpressions(userId, blendedFeed.slice(0, limit));
  }

  return {
    posts: blendedFeed.slice(0, limit),
    boostedAccounts,
    tab,
  };
}

/**
 * Recommendations for the "My Recommendation Assistant" interface
 */
async function getAssistantRecommendations(userId) {
  const [userProfile, interestProfile, recProfile, bizProfile, bizOpportunities] = await Promise.all([
    db.getOne('SELECT fullname, username, bio, interests FROM users WHERE id = ?', [userId]),
    loadInterestProfile(db, userId),
    getOrCreateRecProfile(userId),
    getBusinessProfile(userId),
    getBusinessOpportunities(userId, { limit: 6 }),
  ]);

  const declaredInterests = parseInterestList(userProfile?.interests);
  const activeInterests = declaredInterests.length > 0 ? declaredInterests : [...interestProfile.keys()];

  // 1. Top Recommended Posts for Assistant
  const feedResult = await getRecommendedFeed(userId, { limit: 10 });

  // 2. People & Mentors recommendation
  const people = await db.query(
    `SELECT u.id, u.fullname, u.username, u.bio, u.interests, u.avatar_url, u.picture, u.verified,
            (SELECT COUNT(*) FROM follows f WHERE f.followed_id = u.id) AS follower_count
       FROM users u
      WHERE u.id <> ?
        AND NOT EXISTS (SELECT 1 FROM follows mine WHERE mine.follower_id = ? AND mine.followed_id = u.id)
      ORDER BY follower_count DESC LIMIT 20`,
    [userId, userId]
  );

  const recommendedPeople = people.slice(0, 5).map((p) => ({
    id: p.id,
    name: p.fullname,
    username: p.username,
    handle: p.username?.startsWith('@') ? p.username : `@${p.username}`,
    bio: p.bio || '',
    picture: p.avatar_url || p.picture || null,
    verified: Boolean(Number(p.verified || 0)),
    followers: Number(p.follower_count || 0),
    matchReason: activeInterests.length ? `Shares interest in ${activeInterests[0]}` : 'Popular creator on QuickChat',
  }));

  // 3. Recommended Communities
  const communities = await db.query(
    `SELECT c.id, c.slug, c.name, c.description, c.category,
            (SELECT COUNT(*) FROM community_members cm WHERE cm.community_id = c.id) AS members
       FROM communities c
      WHERE NOT EXISTS (SELECT 1 FROM community_members mine WHERE mine.community_id = c.id AND mine.user_id = ?)
      ORDER BY members DESC LIMIT 4`,
    [userId]
  );

  return {
    botProfile: {
      ownerName: userProfile?.fullname || 'You',
      totalTrackedInterests: activeInterests.length,
      topInterests: activeInterests.slice(0, 6),
      learnedPreferencesCount: Object.keys(recProfile.personalWeights).length,
      businessModeActive: Boolean(bizProfile?.businessName),
      businessName: bizProfile?.businessName || null,
      businessCategory: bizProfile?.businessCategory || null,
    },
    suggestedPosts: feedResult.posts.slice(0, 6),
    suggestedPeople: recommendedPeople,
    suggestedCommunities: communities.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      category: c.category,
      description: c.description || '',
      members: Number(c.members || 0),
    })),
    businessOpportunities: bizOpportunities,
    preferences: recProfile.preferences,
  };
}

module.exports = {
  CONFIGURABLE_WEIGHTS,
  calculateTrendingScore,
  getRecommendedFeed,
  getAssistantRecommendations,
};
