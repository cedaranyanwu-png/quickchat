const { choice, score, noul, TypeSafeClient } = require('@typesafe-ai/sdk');

const DEFAULT_MODEL = process.env.TYPESAFE_JEV_MODEL || 'jev-latest';
const MAX_CANDIDATES = Math.max(4, Math.min(20, Number(process.env.JEV_RECOMMENDATION_CANDIDATES || 12)));
const MIN_CONFIDENCE = Math.max(0, Math.min(1, Number(process.env.JEV_RECOMMENDATION_MIN_CONFIDENCE || 0.55)));
const SCORE_WEIGHT = Math.max(0, Number(process.env.JEV_RECOMMENDATION_SCORE_WEIGHT || 2));

let client;

function isEnabled() {
  return String(process.env.TYPESAFE_JEV_ENABLED || 'true').toLowerCase() !== 'false'
    && Boolean(String(process.env.TYPESAFE_API_KEY || '').trim());
}

function getClient() {
  if (!client) client = new TypeSafeClient();
  return client;
}

function compactText(value, max = 500) {
  return String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max);
}

function buildCandidateState(user, posts) {
  return {
    user: {
      interests: user.interests || [],
      location: compactText(user.location, 100),
      businessCategory: compactText(user.businessCategory, 100),
      preferredCategories: user.preferredCategories || [],
    },
    candidates: posts.map((post) => ({
      id: String(post.id),
      category: compactText(post.category, 80),
      topics: Array.isArray(post.topics) ? post.topics.slice(0, 8) : [],
      hashtags: Array.isArray(post.hashtags) ? post.hashtags.slice(0, 8) : [],
      authorInterests: Array.isArray(post.authorInterests) ? post.authorInterests.slice(0, 8) : [],
      text: compactText(post.text, 600),
      ageHours: Math.round(Math.max(0, (Date.now() - new Date(post.createdAt || 0).getTime()) / 3600000)),
      engagement: {
        likes: Number(post.likeCount || 0),
        replies: Number(post.replyCount || 0),
        shares: Number(post.shareCount || 0),
      },
    })),
  };
}

function buildQuestions(posts) {
  const questions = {};

  posts.forEach((post, index) => {
    questions[`post_${index}`] = score(
      'How strongly should this post be recommended to this user based on relevance, likely interest, useful engagement, freshness, and fit with the user profile?',
      [
        'Not relevant; should normally be excluded from personalized recommendations.',
        'Weak relevance; only include when there are few better choices.',
        'Relevant; reasonable personalized recommendation.',
        'Strong relevance; should rank near the top.',
        'Excellent match; highly likely to be valuable to this user.',
      ],
    );
  });

  questions.diversify = noul(
    'Would showing a mix of topics from these candidates improve the user experience rather than showing only one narrow topic?',
  );

  return questions;
}

async function rerankCandidates({ user, posts }) {
  if (!isEnabled() || !Array.isArray(posts) || posts.length === 0) {
    return { posts, enabled: false };
  }

  const candidates = posts.slice(0, MAX_CANDIDATES);
  const state = buildCandidateState(user, candidates);

  try {
    const { answers, model } = await getClient().systemOne({
      state,
      questions: buildQuestions(candidates),
      model: DEFAULT_MODEL,
    });

    const reranked = posts.map((post, index) => {
      if (index >= candidates.length) return post;

      const answer = answers[`post_${index}`];
      const confidence = Number(answer?.confidence || 0);
      const jevScore = Number(answer?.score || 0);
      const usable = confidence >= MIN_CONFIDENCE && Number.isFinite(jevScore);
      const bonus = usable ? jevScore * SCORE_WEIGHT * confidence : 0;

      return {
        ...post,
        relevanceScore: Number(post.relevanceScore || 0) + bonus,
        jevRecommendationScore: usable ? jevScore : null,
        jevRecommendationConfidence: usable ? confidence : null,
        recommendationModel: usable ? model : null,
        recommendationSource: usable ? 'quickchat-jev' : 'quickchat-rules',
      };
    });

    reranked.sort((a, b) => {
      const scoreDifference = Number(b.relevanceScore || 0) - Number(a.relevanceScore || 0);
      if (scoreDifference) return scoreDifference;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    return {
      posts: reranked,
      enabled: true,
      model,
      diversified: Boolean(answers.diversify?.noul),
    };
  } catch (error) {
    console.warn('[Jev] Recommendation rerank failed; keeping deterministic ranking:', error.message);
    return { posts, enabled: false, error: error.message };
  }
}

module.exports = {
  isEnabled,
  rerankCandidates,
};
