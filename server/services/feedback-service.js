const db = require('../database');

const ACTION_WEIGHTS = {
  'like': 2.0,
  'bookmark': 2.5,
  'share': 3.0,
  'follow': 3.5,
  'show_more': 4.0,
  'skip': -0.5,
  'not_interested': -4.0,
  'hide': -5.0,
  'report': -10.0,
};

async function getOrCreateRecProfile(userId) {
  let profile = await db.getOne('SELECT * FROM recommendation_profiles WHERE user_id = ?', [userId]);
  if (!profile) {
    const defaultPrefs = JSON.stringify({
      personalized_ads: true,
      ad_frequency: 'standard', // low, standard, high
      business_mode: false,
      opportunity_notifications: true,
    });
    try {
      await db.insert(
        'INSERT INTO recommendation_profiles (user_id, personal_weights, business_weights, preferences) VALUES (?, ?, ?, ?)',
        [userId, '{}', '{}', defaultPrefs]
      );
    } catch (_err) {}
    profile = await db.getOne('SELECT * FROM recommendation_profiles WHERE user_id = ?', [userId]);
  }

  let personalWeights = {};
  let businessWeights = {};
  let preferences = {
    personalized_ads: true,
    ad_frequency: 'standard',
    business_mode: false,
    opportunity_notifications: true,
  };

  try { personalWeights = JSON.parse(profile?.personal_weights || '{}'); } catch {}
  try { businessWeights = JSON.parse(profile?.business_weights || '{}'); } catch {}
  try { preferences = { ...preferences, ...JSON.parse(profile?.preferences || '{}') }; } catch {}

  return {
    userId,
    personalWeights,
    businessWeights,
    preferences,
    lastActive: profile?.last_active,
  };
}

async function recordFeedback(userId, { itemType = 'post', itemId, action, reason = '', category = null }) {
  if (!itemId || !action) throw new Error('Item ID and action are required');

  const weightDelta = ACTION_WEIGHTS[action] ?? 0;

  // Insert feedback event
  await db.insert(
    'INSERT INTO recommendation_feedback (user_id, item_type, item_id, action, reason) VALUES (?, ?, ?, ?, ?)',
    [userId, itemType, String(itemId), action, reason ? String(reason).slice(0, 255) : null]
  );

  // Update recommendation profile weights
  if (weightDelta !== 0) {
    const recProfile = await getOrCreateRecProfile(userId);
    const weights = recProfile.personalWeights;

    // Determine target category if not provided
    let targetCategory = category;
    if (!targetCategory && itemType === 'post') {
      const post = await db.getOne('SELECT category, target_interests FROM posts WHERE id = ?', [itemId]);
      targetCategory = post?.category;
    }

    if (targetCategory) {
      const currentScore = Number(weights[targetCategory] || 1.0);
      weights[targetCategory] = Math.max(0.05, Math.min(10.0, currentScore + weightDelta * 0.2));

      await db.update(
        'UPDATE recommendation_profiles SET personal_weights = ?, last_active = CURRENT_TIMESTAMP WHERE user_id = ?',
        [JSON.stringify(weights), userId]
      );
    }
  }

  return { success: true, action, itemId };
}

async function updatePreferences(userId, newPrefs) {
  const current = await getOrCreateRecProfile(userId);
  const merged = { ...current.preferences, ...newPrefs };

  await db.update(
    'UPDATE recommendation_profiles SET preferences = ?, last_active = CURRENT_TIMESTAMP WHERE user_id = ?',
    [JSON.stringify(merged), userId]
  );

  return merged;
}

async function getUserNegativeFilters(userId) {
  // Items marked as hide, not_interested, or report
  const rows = await db.query(
    `SELECT item_type, item_id FROM recommendation_feedback
      WHERE user_id = ? AND action IN ('hide', 'not_interested', 'report')`,
    [userId]
  );

  const hiddenPostIds = new Set();
  const hiddenAdIds = new Set();
  const hiddenUserIds = new Set();

  for (const row of rows) {
    if (row.item_type === 'post') hiddenPostIds.add(Number(row.item_id));
    else if (row.item_type === 'ad') hiddenAdIds.add(Number(row.item_id));
    else if (row.item_type === 'person') hiddenUserIds.add(Number(row.item_id));
  }

  return { hiddenPostIds, hiddenAdIds, hiddenUserIds };
}

async function recordImpressions(userId, items = [], sessionId = '') {
  if (!items.length) return;
  for (const item of items) {
    try {
      await db.insert(
        'INSERT INTO recommendation_impressions (user_id, item_type, item_id, session_id) VALUES (?, ?, ?, ?)',
        [userId, item.itemType || 'post', String(item.id), sessionId || null]
      );
    } catch (_err) {}
  }
}

module.exports = {
  ACTION_WEIGHTS,
  getOrCreateRecProfile,
  recordFeedback,
  updatePreferences,
  getUserNegativeFilters,
  recordImpressions,
};
