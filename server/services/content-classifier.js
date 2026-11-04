const { INTERESTS } = require('../algorithm');
const db = require('../database');

// Standard stop words for keyword extraction
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'can\'t', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing',
  'don\'t', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t',
  'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers',
  'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if',
  'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t',
  'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our',
  'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s',
  'should', 'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re',
  'they\'ve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t',
  'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s',
  'where', 'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t',
  'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself',
  'yourselves', 'just', 'also', 'will', 'like', 'get', 'make', 'one', 'use', 'really', 'much', 'know'
]);

// Topic mapping dictionary with audience definitions
const TOPIC_MAPPINGS = [
  {
    topic: 'Web Development',
    keywords: ['website', 'websites', 'web dev', 'frontend', 'backend', 'fullstack', 'css', 'html', 'javascript', 'react', 'api'],
    interest: 'programming',
    audiences: ['Small business owners', 'Entrepreneurs', 'Startup founders', 'Web developers']
  },
  {
    topic: 'Software Engineering',
    keywords: ['software', 'code', 'coding', 'git', 'github', 'architecture', 'devops', 'cloud', 'aws', 'docker'],
    interest: 'programming',
    audiences: ['Software engineers', 'Tech leaders', 'Developers', 'Tech enthusiasts']
  },
  {
    topic: 'Artificial Intelligence',
    keywords: ['ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning', 'neural', 'llm', 'chatgpt', 'gpt', 'models'],
    interest: 'artificial-intelligence',
    audiences: ['AI researchers', 'Tech enthusiasts', 'Founders', 'Data scientists', 'Innovators']
  },
  {
    topic: 'Small Business & Startups',
    keywords: ['small business', 'startup', 'startups', 'founder', 'business', 'entrepreneur', 'bootstrapping', 'clients', 'revenue', 'customers'],
    interest: 'entrepreneurship',
    audiences: ['Small business owners', 'Entrepreneurs', 'Startup founders', 'Freelancers']
  },
  {
    topic: 'Digital Marketing & Growth',
    keywords: ['marketing', 'seo', 'ads', 'advertising', 'growth', 'sales', 'conversion', 'social media', 'content marketing', 'branding'],
    interest: 'digital-marketing',
    audiences: ['Marketers', 'Business owners', 'E-commerce sellers', 'Content creators']
  },
  {
    topic: 'UI/UX & Product Design',
    keywords: ['design', 'designer', 'ui', 'ux', 'figma', 'branding', 'visual', 'prototype', 'graphic design', 'logo'],
    interest: 'design',
    audiences: ['Designers', 'Product managers', 'Creative directors', 'Business owners']
  },
  {
    topic: 'Finance & Investing',
    keywords: ['finance', 'money', 'investment', 'investing', 'crypto', 'stocks', 'wealth', 'budget', 'trading', 'banking', 'fintech'],
    interest: 'finance',
    audiences: ['Investors', 'Financial planners', 'Entrepreneurs', 'Young professionals']
  },
  {
    topic: 'Health & Wellness',
    keywords: ['health', 'wellness', 'fitness', 'diet', 'workout', 'mental health', 'gym', 'exercise', 'nutrition', 'medicine'],
    interest: 'health',
    audiences: ['Fitness enthusiasts', 'Health-conscious individuals', 'Athletes']
  },
  {
    topic: 'Education & Career',
    keywords: ['learn', 'learning', 'education', 'course', 'tutorial', 'career', 'job', 'skills', 'student', 'study', 'teaching'],
    interest: 'education',
    audiences: ['Students', 'Career switchers', 'Lifelong learners', 'Professionals']
  },
  {
    topic: 'Entertainment & Culture',
    keywords: ['movie', 'movies', 'music', 'song', 'film', 'cinema', 'game', 'gaming', 'show', 'comedy', 'funny', 'actor'],
    interest: 'entertainment',
    audiences: ['Pop culture fans', 'Gamers', 'Music lovers', 'Movie buffs']
  },
];

function normalizeText(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9#\s_-]/g, ' ')
    .trim();
}

function extractKeywords(text, max = 8) {
  const words = normalizeText(text)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !w.startsWith('#'));

  // Count word frequencies
  const freq = new Map();
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  // Also check common 2-word phrases
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    freq.set(bigram, (freq.get(bigram) || 0) + 1.5);
  }

  const sorted = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([phrase]) => phrase);

  return sorted.slice(0, max);
}

function extractHashtags(text, existingTags = []) {
  const inlineTags = (String(text).match(/#([a-zA-Z0-9_]{2,30})/g) || [])
    .map((tag) => tag.slice(1).toLowerCase());

  const combined = new Set([...existingTags.map((t) => t.replace(/^#/, '').toLowerCase()), ...inlineTags]);
  return [...combined];
}

async function analyzeContent({ title = '', text = '', caption = '', hashtags = [] }) {
  const combinedText = `${title} ${caption || text}`.trim();
  const normalized = normalizeText(combinedText);
  const words = normalized.split(/\s+/).filter(Boolean);

  // 1. Topic Identification
  const matchedTopics = new Set();
  const matchedInterests = new Set();
  const audienceSet = new Set();
  const suggestedHashtags = new Set(extractHashtags(combinedText, hashtags));

  for (const mapping of TOPIC_MAPPINGS) {
    const matchesKeyword = mapping.keywords.some((kw) => {
      const kwNorm = normalizeText(kw);
      return normalized.includes(` ${kwNorm} `) || normalized.startsWith(`${kwNorm} `) || normalized.endsWith(` ${kwNorm}`) || normalized === kwNorm;
    });

    if (matchesKeyword) {
      matchedTopics.add(mapping.topic);
      matchedInterests.add(mapping.interest);
      mapping.audiences.forEach((aud) => audienceSet.add(aud));
      mapping.keywords.slice(0, 2).forEach((kw) => suggestedHashtags.add(kw.replace(/\s+/g, '')));
    }
  }

  // 2. Direct Interest matching with algorithm taxonomy
  for (const interest of INTERESTS) {
    const terms = [interest.key, interest.label, ...(interest.terms || [])];
    const match = terms.some((term) => {
      const termNorm = normalizeText(term);
      return normalized.includes(` ${termNorm} `) || normalized.includes(termNorm);
    });
    if (match) {
      matchedInterests.add(interest.key);
      suggestedHashtags.add(interest.key.replace(/-/g, ''));
    }
  }

  // Default fallback if no specific topics matched
  if (matchedTopics.size === 0) {
    matchedTopics.add('General Discussion');
    matchedInterests.add('technology');
    audienceSet.add('General audience');
  }

  // 3. Keywords extraction
  const keywords = extractKeywords(combinedText, 6);
  keywords.forEach((kw) => {
    if (kw.length <= 15 && !kw.includes(' ')) {
      suggestedHashtags.add(kw);
    }
  });

  // 4. Community recommendations (lookup existing communities matching topics or interests)
  let recommendedCommunities = [];
  try {
    const searchTerms = [...matchedInterests, ...matchedTopics].slice(0, 5);
    if (searchTerms.length > 0) {
      const placeholders = searchTerms.map(() => 'LOWER(category) LIKE ? OR LOWER(name) LIKE ?').join(' OR ');
      const params = searchTerms.flatMap((term) => [`%${term.toLowerCase()}%`, `%${term.toLowerCase()}%`]);
      params.push(4);
      recommendedCommunities = await db.query(
        `SELECT id, slug, name, category, description,
                (SELECT COUNT(*) FROM community_members cm WHERE cm.community_id = communities.id) AS members
           FROM communities
          WHERE ${placeholders}
          ORDER BY members DESC LIMIT ?`,
        params
      );
    }
  } catch (_err) {
    recommendedCommunities = [];
  }

  // 5. Optimization & Readability Suggestions
  const optimizationTips = [];
  const charCount = combinedText.length;
  const wordCount = words.length;

  let readabilityScore = 85;

  if (wordCount < 10) {
    optimizationTips.push({
      type: 'content_length',
      severity: 'info',
      message: 'Adding more context or details (30+ words) can increase audience discovery and engagement.'
    });
    readabilityScore -= 10;
  } else if (wordCount > 300) {
    optimizationTips.push({
      type: 'readability',
      severity: 'info',
      message: 'Consider breaking your post into shorter paragraphs or bullet points for easier mobile reading.'
    });
    readabilityScore -= 5;
  }

  if (suggestedHashtags.size === 0) {
    optimizationTips.push({
      type: 'hashtags',
      severity: 'suggestion',
      message: 'Adding 2-4 relevant hashtags helps QuickChat recommend your post to interested readers.'
    });
    readabilityScore -= 10;
  } else if (suggestedHashtags.size > 8) {
    optimizationTips.push({
      type: 'hashtags',
      severity: 'suggestion',
      message: 'Using more than 8 hashtags may look cluttered. 3 to 5 targeted tags works best.'
    });
    readabilityScore -= 5;
  }

  if (!/[?!.]$/.test(combinedText.trim()) && wordCount > 5) {
    optimizationTips.push({
      type: 'engagement',
      severity: 'tip',
      message: 'Asking a question or including a clear call to action at the end boosts reply rates.'
    });
  }

  return {
    topics: [...matchedTopics].slice(0, 6),
    interests: [...matchedInterests].slice(0, 8),
    hashtags: [...suggestedHashtags].map((t) => (t.startsWith('#') ? t : `#${t}`)).slice(0, 8),
    keywords: keywords.slice(0, 6),
    audiences: [...audienceSet].slice(0, 6),
    communities: (recommendedCommunities || []).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      category: c.category,
      members: Number(c.members || 0),
    })),
    optimization: {
      score: Math.max(50, Math.min(100, readabilityScore)),
      readability: readabilityScore >= 80 ? 'High' : readabilityScore >= 65 ? 'Moderate' : 'Needs attention',
      charCount,
      wordCount,
      tips: optimizationTips,
    },
  };
}

module.exports = {
  analyzeContent,
  extractKeywords,
  extractHashtags,
};
