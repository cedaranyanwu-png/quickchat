function parseTimestamp(value) {
  if (!value) return Number.NaN;
  if (value instanceof Date) return value.getTime();
  const text = String(value);
  // SQLite returns UTC "YYYY-MM-DD HH:MM:SS" strings without a zone marker.
  const withZone = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text;
  return new Date(withZone).getTime();
}

// Older posts accumulate a deterministic historical reaction baseline. This is
// display-only: real likes and replies still add on top, and the values stay
// stable for a given post and age tier. Set AI_POSTER_LEGACY_ENGAGEMENT=false to
// show only recorded interactions.
function legacyEngagementFor(post) {
  if (['false', '0', 'off', 'no'].includes(String(process.env.AI_POSTER_LEGACY_ENGAGEMENT || 'true').toLowerCase())) {
    return { likes: 0, comments: 0 };
  }
  const timestamp = parseTimestamp(post?.created_at || post?.createdAt);
  if (!Number.isFinite(timestamp)) return { likes: 0, comments: 0 };
  const ageHours = Math.max(0, (Date.now() - timestamp) / 3_600_000);
  if (ageHours < 1) return { likes: 0, comments: 0 };

  const seed = Math.abs(Number(post?.id) || 1);
  if (ageHours < 6) {
    return { likes: 12 + (seed * 7) % 58, comments: 1 + (seed * 3) % 5 };
  }
  if (ageHours < 24) {
    return { likes: 70 + (seed * 13) % 230, comments: 4 + (seed * 5) % 14 };
  }
  if (ageHours < 24 * 7) {
    return { likes: 320 + (seed * 17) % 980, comments: 18 + (seed * 11) % 72 };
  }
  return { likes: 1200 + (seed * 19) % 3800, comments: 90 + (seed * 13) % 410 };
}

module.exports = { legacyEngagementFor };
