// These are the interests users can choose in profile settings.
const INTERESTS = [
  { key: 'technology', label: 'Technology', terms: ['tech', 'technology', 'gadgets', 'hardware', 'it'] },
  { key: 'programming', label: 'Programming', terms: ['programming', 'coding', 'code', 'software', 'developer', 'web dev', 'frontend', 'backend', 'fullstack', 'python', 'javascript', 'react', 'node'] },
  { key: 'artificial-intelligence', label: 'Artificial Intelligence', terms: ['artificial intelligence', 'ai', 'machine learning', 'ml', 'deep learning', 'llm', 'neural network', 'chatgpt', 'generative ai'] },
  { key: 'business', label: 'Business', terms: ['business', 'commerce', 'corporate', 'management', 'b2b', 'enterprise'] },
  { key: 'entrepreneurship', label: 'Entrepreneurship', terms: ['entrepreneurship', 'entrepreneur', 'startup', 'startups', 'founder', 'founders', 'small business', 'venture', 'bootstrapping'] },
  { key: 'education', label: 'Education', terms: ['education', 'learning', 'teaching', 'school', 'university', 'college', 'course', 'tutorial', 'students'] },
  { key: 'comedy', label: 'Comedy', terms: ['comedy', 'humor', 'funny', 'jokes', 'meme', 'memes', 'satire', 'standup'] },
  { key: 'music', label: 'Music', terms: ['music', 'song', 'songs', 'album', 'singer', 'musician', 'instrument', 'hip hop', 'afrobeats', 'rock', 'pop', 'guitar'] },
  { key: 'gaming', label: 'Gaming', terms: ['gaming', 'game', 'games', 'video games', 'esports', 'playstation', 'xbox', 'pc gaming', 'streamer'] },
  { key: 'sports', label: 'Sports', terms: ['sports', 'sport', 'football', 'soccer', 'basketball', 'athletics', 'tennis', 'fitness', 'premier league', 'nba'] },
  { key: 'fashion', label: 'Fashion', terms: ['fashion', 'style', 'clothing', 'beauty', 'outfit', 'wardrobe', 'wear', 'shoes', 'cosmetics'] },
  { key: 'science', label: 'Science', terms: ['science', 'research', 'physics', 'astronomy', 'biology', 'chemistry', 'space', 'scientific', 'discovery'] },
  { key: 'digital-marketing', label: 'Digital Marketing', terms: ['digital marketing', 'marketing', 'advertising', 'growth', 'seo', 'content marketing', 'social media marketing', 'branding', 'copywriting', 'conversion'] },
  { key: 'design', label: 'Design', terms: ['design', 'designer', 'ux', 'ui', 'illustration', 'graphic design', 'web design', 'product design', 'figma'] },
  { key: 'photography', label: 'Photography', terms: ['photography', 'photograph', 'photographer', 'photo', 'camera', 'videography', 'portrait', 'lens'] },
  { key: 'entertainment', label: 'Entertainment', terms: ['entertainment', 'film', 'movie', 'movies', 'cinema', 'television', 'tv', 'show', 'series', 'celebrity', 'hollywood', 'nollywood'] },
  { key: 'health', label: 'Health and Fitness', terms: ['health', 'fitness', 'wellness', 'medicine', 'mental health', 'workout', 'gym', 'exercise', 'nutrition', 'diet'] },
  { key: 'finance', label: 'Finance', terms: ['finance', 'financial', 'investing', 'investment', 'money', 'wealth', 'crypto', 'stocks', 'trading', 'banking', 'personal finance', 'fintech'] },
  { key: 'news', label: 'News', terms: ['news', 'politics', 'current affairs', 'journalism', 'world events'] },
  { key: 'travel', label: 'Travel', terms: ['travel', 'tourism', 'adventure', 'vacation', 'trip', 'destination', 'explore'] },
  { key: 'food', label: 'Food', terms: ['food', 'cooking', 'recipes', 'cuisine', 'restaurant', 'baking', 'chef', 'dining'] },
  { key: 'books', label: 'Books', terms: ['books', 'reading', 'literature', 'novels', 'author', 'book club', 'writing'] },
  { key: 'nature', label: 'Nature', terms: ['nature', 'environment', 'climate', 'animals', 'outdoors', 'wildlife'] },
  { key: 'parenting', label: 'Parenting', terms: ['parenting', 'family', 'babies', 'children', 'kids', 'motherhood', 'fatherhood'] },
];

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findInterest(value) {
  const normalized = normalize(value);
  if (!normalized) return null;
  for (const interest of INTERESTS) {
    if (normalized === interest.key || normalized === normalize(interest.label) ||
      interest.terms.some((term) => normalized === normalize(term))) return interest.key;
  }
  return null;
}

function normalizeSelectedInterests(value) {
  if (!Array.isArray(value) || value.length > 24) return null;
  const normalized = value.map(findInterest);
  if (normalized.some((interest) => !interest)) return null;
  return [...new Set(normalized)];
}

function parseInterestList(value) {
  if (Array.isArray(value)) return normalizeSelectedInterests(value) || [];
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return normalizeSelectedInterests(parsed) || [];
  } catch (_error) {
    return [];
  }
}

function parseStringList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : [];
  } catch (_error) {
    return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  }
}

function postInterests(post) {
  const interests = new Set();
  const postHashtags = Array.isArray(post?.hashtags)
    ? post.hashtags
    : parseStringList(post?.hashtags);
  const text = `${normalize(post?.category)} ${normalize(post?.text || post?.body)} ${normalize(postHashtags.join(' '))}`;

  // A post also reaches people who share the author's chosen profile interests,
  // even when its text does not repeat the interest name.
  for (const interest of parseInterestList(post?.authorInterests || post?.author_interests)) {
    interests.add(interest);
  }
  for (const interest of parseInterestList(post?.targetInterests || post?.target_interests)) {
    interests.add(interest);
  }

  for (const interest of INTERESTS) {
    const terms = [interest.key, interest.label, ...interest.terms];
    if (terms.some((term) => ` ${text} `.includes(` ${normalize(term)} `))) interests.add(interest.key);
  }

  // Keep uncategorized, specifically tagged posts useful to people who selected that same topic.
  const category = normalize(post?.category);
  if (category && !interests.size) interests.add(category);
  return interests;
}

function detectPostInterests(post) {
  // Content targeting uses explicit audiences first, then the post's topic,
  // caption, and hashtags. It does not treat the author's profile as a tag.
  return [...postInterests({ ...post, authorInterests: [] })];
}

async function loadInterestProfile(db, userId) {
  const account = await db.getOne('SELECT interests FROM users WHERE id = ?', [userId]);
  const selected = parseInterestList(account?.interests);
  if (selected.length) {
    // Explicit profile choices are primary; activity is the fallback when no interests are selected.
    return new Map(selected.map((interest) => [interest, 1]));
  }

  const sources = [
    {
      weight: 3,
      sql: `SELECT p.category, p.body, p.target_interests, p.hashtags FROM post_likes l
              JOIN posts p ON p.id = l.post_id
             WHERE l.user_id = ? ORDER BY l.created_at DESC LIMIT ?`,
    },
    {
      weight: 3.5,
      sql: `SELECT p.category, p.body, p.target_interests, p.hashtags FROM bookmarks b
              JOIN posts p ON p.id = b.post_id
             WHERE b.user_id = ? ORDER BY b.created_at DESC LIMIT ?`,
    },
    {
      weight: 1.5,
      sql: `SELECT category, body, target_interests, hashtags FROM posts WHERE author_id = ? ORDER BY created_at DESC LIMIT ?`,
    },
    {
      weight: 1.75,
      sql: `SELECT p.category, p.body, p.target_interests, p.hashtags FROM posts p
              JOIN follows f ON f.followed_id = p.author_id
             WHERE f.follower_id = ? ORDER BY p.created_at DESC LIMIT ?`,
    },
  ];
  const signals = await Promise.all(sources.map(({ sql }) => db.query(sql, [userId, 200])));
  const profile = new Map();

  signals.forEach((rows, sourceIndex) => {
    const weight = sources[sourceIndex].weight;
    rows.forEach((row, rowIndex) => {
      // Recent interactions contribute more than older ones.
      const recencyWeight = weight / (1 + rowIndex / 100);
      for (const interest of postInterests({ category: row.category, text: row.body, targetInterests: row.target_interests, hashtags: row.hashtags })) {
        profile.set(interest, (profile.get(interest) || 0) + recencyWeight);
      }
    });
  });

  return profile;
}

function ageInHours(post) {
  const timestamp = new Date(post?.createdAt || post?.created_at || 0).getTime();
  return Number.isFinite(timestamp) && timestamp > 0
    ? Math.max(0, (Date.now() - timestamp) / 3600000)
    : 24 * 30;
}

function interestMatch(post, profile) {
  if (!profile?.size) return 0;
  let score = 0;
  for (const interest of postInterests(post)) score += profile.get(interest) || 0;
  const strongestSignal = Math.max(...profile.values());
  return Math.min(2, score / strongestSignal);
}

function filterPostsByInterest(posts, selectedInterest) {
  const interest = findInterest(selectedInterest);
  if (!interest) return posts;
  return posts.filter((post) => postInterests(post).has(interest));
}

function rankPosts(posts, profile) {
  return [...posts]
    .map((post, index) => {
      const freshness = 1 / (1 + ageInHours(post) / 36);
      return {
        post,
        index,
        // Interest match drives recommendations; freshness keeps newer posts visible.
        score: interestMatch(post, profile) * 9 + freshness * 1.2,
      };
    })
    .sort((left, right) => {
      const scoreDifference = right.score - left.score;
      if (scoreDifference) return scoreDifference;
      return ageInHours(left.post) - ageInHours(right.post) || left.index - right.index;
    })
    .map(({ post }) => post);
}

function rankPeople(people, profile, categoryRows) {
  const topicsByPerson = new Map();
  for (const row of categoryRows) {
    const id = String(row.author_id);
    if (!topicsByPerson.has(id)) topicsByPerson.set(id, new Set());
    for (const interest of postInterests({ category: row.category })) topicsByPerson.get(id).add(interest);
  }

  return [...people]
    .map((person, index) => {
      const topics = topicsByPerson.get(String(person.id)) || new Set();
      for (const interest of parseInterestList(person.interests)) topics.add(interest);
      const matchingWeight = [...topics].reduce((total, topic) => total + (profile.get(topic) || 0), 0);
      const totalSignal = [...profile.values()].reduce((total, weight) => total + weight, 0);
      return {
        person,
        index,
        match: totalSignal ? matchingWeight / totalSignal : 0,
        followers: Number(person.follower_count || 0),
      };
    })
    .sort((left, right) => right.match - left.match || right.followers - left.followers || left.index - right.index)
    .map(({ person }) => person);
}

module.exports = {
  INTERESTS,
  detectPostInterests,
  filterPostsByInterest,
  loadInterestProfile,
  normalizeSelectedInterests,
  parseInterestList,
  rankPeople,
  rankPosts,
};
