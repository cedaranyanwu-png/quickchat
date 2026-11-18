const { score, noul, TypeSafeClient } = require('@typesafe-ai/sdk');
const { getSetting } = require('../platform-settings');

let client = null;

async function loadConfig() {
  const enabled = String(await getSetting('typesafe_jev_enabled', process.env.TYPESAFE_JEV_ENABLED || 'true')).toLowerCase() !== 'false';
  const apiKey = String(await getSetting('typesafe_api_key', process.env.TYPESAFE_API_KEY || '')).trim();
  const model = String(await getSetting('typesafe_jev_model', process.env.TYPESAFE_JEV_MODEL || 'jev-latest')).trim() || 'jev-latest';
  const candidates = Math.max(4, Math.min(20, Number(await getSetting('jev_recommendation_candidates', process.env.JEV_RECOMMENDATION_CANDIDATES || 12)) || 12));
  const minConfidence = Math.max(0, Math.min(1, Number(await getSetting('jev_recommendation_min_confidence', process.env.JEV_RECOMMENDATION_MIN_CONFIDENCE || 0.55)) || 0.55));
  const scoreWeight = Math.max(0, Number(await getSetting('jev_recommendation_score_weight', process.env.JEV_RECOMMENDATION_SCORE_WEIGHT || 2)) || 2);
  return { enabled, apiKey, model, candidates, minConfidence, scoreWeight };
}

function compactText(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function getClient(apiKey) {
  if (!client || process.env.TYPESAFE_API_KEY !== apiKey) {
    process.env.TYPESAFE_API_KEY = apiKey;
    client = new TypeSafeClient();
  }
  return client;
}

function buildState(user, posts) {
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
        likes: Number(post.likes || 0),
        replies: Number(post.replies || 0),
        shares: Number(post.shares || 0),
      },
    })),
  };
}

function questions(posts) {
  const result = {};
  posts.forEach((post, index) => {
    result[`post_${index}`] = score(
      'How strongly should this post be recommended to this user based on relevance, likely interest, usefulness, freshness and profile fit?',
      [
        'Not relevant; exclude from personalized ranking.',
        'Weak relevance; only include when better choices are unavailable.',
        'Relevant; reasonable recommendation.',
        'Strong relevance; rank near the top.',
        'Excellent match; highly valuable to this user.',
      ],
    );
  });
  result.diversify = noul('Would a diverse mix of topics improve this recommendation list instead of concentrating on one topic?');
  return result;
}

async function rerankCandidates({ user, posts }) {
  const config = await loadConfig();
  if (!config.enabled || !config.apiKey || !Array.isArray(posts) || !posts.length) {
    return { posts, enabled: false };
  }

  const candidates = posts.slice(0, config.candidates);
  try {
    const { answers, model } = await getClient(config.apiKey).systemOne({
      state: buildState(user, candidates),
      questions: questions(candidates),
      model: config.model,
    });

    const reranked = posts.map((post, index) => {
      if (index >= candidates.length) return post;
      const answer = answers[`post_${index}`];
      const confidence = Number(answer?.confidence || 0);
      const jevScore = Number(answer?.score || 0);
      if (confidence < config.minConfidence || !Number.isFinite(jevScore)) return post;
      return {
        ...post,
        relevanceScore: Number(post.relevanceScore || 0) + jevScore * config.scoreWeight * confidence,
        jevRecommendationScore: jevScore,
        jevRecommendationConfidence: confidence,
        recommendationModel: model,
        recommendationSource: 'quickchat-jev',
      };
    });

    reranked.sort((a, b) => Number(b.relevanceScore || 0) - Number(a.relevanceScore || 0));
    return { posts: reranked, enabled: true, model, diversified: Boolean(answers.diversify?.noul) };
  } catch (error) {
    console.warn('[Jev] Recommendation rerank failed; retaining deterministic ranking:', error.message);
    return { posts, enabled: false };
  }
}

module.exports = { rerankCandidates };
