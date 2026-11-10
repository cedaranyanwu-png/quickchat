const db = require('../database');
const { classifyAdultSource } = require('../adult-content');
const { legacyEngagementFor } = require('../engagement');

function clampLimit(value, fallback = 20, maximum = 100) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function parseJSON(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function toPost(row) {
  const fields = lowerKeys(row);
  const contentSafety = classifyAdultSource(fields.source_link);
  const visibility = fields.visibility || 'public';
  const canView = fields.can_view === undefined ? true : Boolean(Number(fields.can_view));
  const isPaywalled = visibility !== 'public' && !canView;
  if (contentSafety.isUnavailable) {
    return {
      id: fields.id,
      text: '',
      type: 'text',
      category: null,
      sourceLink: null,
      media: [],
      hashtags: [],
      targetInterests: [],
      authorInterests: [],
      name: '',
      username: '',
      handle: '',
      picture: null,
      isAdult: true,
      isUnavailable: true,
      replies: 0,
      shares: 0,
      likes: 0,
      liked: false,
      bookmarked: false,
      reposted: false,
    };
  }
  const legacy = legacyEngagementFor(fields);
  return {
    id: fields.id,
    authorId: fields.author_id,
    aiCharacter: Boolean(fields.author_character_id) || String(fields.source_link || '').startsWith('quickchat://ai-character/'),
    text: isPaywalled ? '' : fields.body || '',
    type: fields.kind || 'text',
    category: fields.category || null,
    sourceLink: isPaywalled ? null : fields.source_link || null,
    linkedArticle: !isPaywalled && fields.rss_article_id ? {
      id: Number(fields.rss_article_id),
      title: fields.rss_article_title || '',
      publisher: fields.rss_article_publisher || '',
      url: fields.rss_article_url || '',
      imageUrl: fields.rss_article_image_url || null,
    } : null,
    visibility,
    isPaywalled,
    paywallType: isPaywalled ? visibility : null,
    priceAmount: fields.price_amount || (visibility === 'fans' ? fields.author_fan_price : null) || null,
    priceCurrency: fields.price_currency || (visibility === 'fans' ? fields.author_fan_currency : null) || null,
    isAdult: contentSafety.isAdult,
    media: isPaywalled ? [] : parseJSON(fields.media, []),
    hashtags: parseJSON(fields.hashtags, []),
    targetInterests: parseJSON(fields.target_interests, []),
    topics: parseJSON(fields.topics, []),
    keywords: parseJSON(fields.keywords, []),
    audienceSignals: parseJSON(fields.audience_signals, []),
    communityId: fields.community_id || null,
    communityName: fields.community_name || null,
    videoId: fields.video_id || null,
    name: fields.name || fields.fullname || '',
    username: fields.username || '',
    handle: formatHandle(fields.username || ''),
    picture: fields.avatar_url || fields.picture || null,
    verified: Boolean(Number(fields.verified || 0)),
    authorInterests: parseInterestArray(fields.author_interests),
    time: relativeTime(fields.created_at),
    createdAt: fields.created_at,
    replies: Number(fields.reply_count || 0) + legacy.comments,
    shares: Number(fields.share_count || 0),
    likes: Number(fields.like_count || 0) + legacy.likes,
    liked: Boolean(fields.liked),
    bookmarked: Boolean(fields.bookmarked),
    reposted: Boolean(fields.reposted),
  };
}

function parseInterestArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function toProfile(row) {
  if (!row) return null;
  const fields = lowerKeys(row);
  const storedInterests = parseJSON(fields.interests, []);
  return {
    id: fields.id,
    aiCharacter: Boolean(fields.character_id),
    fullName: fields.fullname || fields.name || '',
    username: fields.username || '',
    handle: formatHandle(fields.username || ''),
    bio: fields.bio || '',
    location: fields.location || '',
    website: fields.website || '',
    payoutCountry: fields.payout_country || 'NG',
    creatorMembershipPrice: fields.creator_membership_price || null,
    creatorMembershipCurrency: fields.creator_membership_currency || null,
    interests: Array.isArray(storedInterests) ? storedInterests : [],
    picture: fields.avatar_url || fields.picture || null,
    coverImage: fields.cover_url || null,
    verified: Boolean(Number(fields.verified || 0)),
    verifiedAt: fields.verified_at || null,
    verificationMethod: fields.verification_method || null,
    businessEnabled: Boolean(Number(fields.business_enabled || 0)),
    recommendationPreferences: parseJSON(fields.recommendation_preferences, null),
    createdAt: fields.created_at || fields.createdat,
    followerCount: Number(fields.follower_count || 0),
    followingCount: Number(fields.following_count || 0),
    postCount: Number(fields.post_count || 0),
    isFollowing: Boolean(fields.is_following),
  };
}

function formatHandle(username) {
  const clean = String(username || '').trim();
  return clean.startsWith('@') ? clean : `@${clean}`;
}

function relativeTime(dateValue) {
  if (!dateValue) return '';
  let timestamp;
  if (dateValue instanceof Date) {
    timestamp = dateValue.getTime();
  } else {
    // SQLite and MySQL adapters return zone-less timestamps. Treat that shape as
    // UTC so a just-created post reads "now" instead of an hour old in UTC+1.
    const text = String(dateValue);
    const withZone = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)
      ? `${text.replace(' ', 'T')}Z`
      : text;
    timestamp = new Date(withZone).getTime();
  }
  if (!Number.isFinite(timestamp)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(timestamp).toLocaleDateString();
}

function lowerKeys(row) {
  return Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key.toLowerCase(), value]));
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function notFound(res, message = 'The requested item was not found.') {
  return res.status(404).json({ message });
}

function uniqueConstraint(error) {
  return ['23505', 'SQLITE_CONSTRAINT', 'ER_DUP_ENTRY'].includes(error?.code) ||
    String(error?.message || '').toLowerCase().includes('unique constraint');
}

module.exports = {
  db,
  asyncRoute,
  clampLimit,
  formatHandle,
  lowerKeys,
  notFound,
  parseJSON,
  relativeTime,
  toPost,
  toProfile,
  uniqueConstraint,
};
