const db = require('../database');
const { currentBalance, spendPoints } = require('../wallet');

async function boostPost(userId, { postId, objective = 'reach', targetQuantity = 1000, targetInterests = [], targetAudiences = [], budgetPoints = 500, durationDays = 7 }) {
  const points = Math.max(100, Math.trunc(Number(budgetPoints) || 500));
  const quantityFloor = objective === 'reach' ? 1000 : 100;
  const quantity = Math.max(quantityFloor, Math.min(1000000, Math.trunc(Number(targetQuantity) || quantityFloor)));
  const days = Math.max(1, Math.min(30, Math.trunc(Number(durationDays) || 7)));

  // Validate ownership
  const post = await db.getOne('SELECT id, author_id, body FROM posts WHERE id = ?', [postId]);
  if (!post) throw new Error('Post not found');
  if (post.author_id !== userId) throw new Error('You can only boost posts that you authored.');

  // Check balance and spend points
  const spendResult = await spendPoints(userId, points, {
    kind: 'boost_post',
    reference: `boost_post_${postId}_${Date.now()}`,
  });

  if (!spendResult.ok) {
    throw new Error(spendResult.reason === 'insufficient'
      ? `Insufficient points. You need ${points} points to boost this post.`
      : 'Could not process points transaction.');
  }

  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 19).replace('T', ' ');

  const result = await db.insert(
    `INSERT INTO boosted_promotions (
      user_id, item_type, post_id, objective, target_interests, target_audiences,
      target_quantity, delivered_quantity, budget_points, spent_points, daily_budget_points, status, expires_at
    ) VALUES (?, 'post', ?, ?, ?, ?, ?, 0, ?, 0, ?, 'active', ?)`,
    [
      userId,
      postId,
      objective,
      JSON.stringify(targetInterests),
      JSON.stringify(targetAudiences),
      quantity,
      points,
      Math.ceil(points / days),
      expiresAt,
    ]
  );

  return { id: result?.id, postId, targetQuantity: quantity, budgetPoints: points, deliveredQuantity: 0, expiresAt };
}

async function boostProfile(userId, { objective = 'followers', targetQuantity = 500, targetInterests = [], targetAudiences = [], budgetPoints = 1000, durationDays = 7 }) {
  const points = Math.max(200, Math.trunc(Number(budgetPoints) || 1000));
  const quantity = Math.max(100, Math.min(1000000, Math.trunc(Number(targetQuantity) || 500)));
  const days = Math.max(1, Math.min(30, Math.trunc(Number(durationDays) || 7)));

  const spendResult = await spendPoints(userId, points, {
    kind: 'boost_profile',
    reference: `boost_profile_${userId}_${Date.now()}`,
  });

  if (!spendResult.ok) {
    throw new Error(spendResult.reason === 'insufficient'
      ? `Insufficient points. You need ${points} points to promote your profile.`
      : 'Could not process points transaction.');
  }

  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 19).replace('T', ' ');

  const result = await db.insert(
    `INSERT INTO boosted_promotions (
      user_id, item_type, promoted_profile_id, objective, target_interests, target_audiences,
      target_quantity, delivered_quantity, budget_points, spent_points, daily_budget_points, status, expires_at
    ) VALUES (?, 'profile', ?, ?, ?, ?, ?, 0, ?, 0, ?, 'active', ?)`,
    [
      userId,
      userId,
      objective,
      JSON.stringify(targetInterests),
      JSON.stringify(targetAudiences),
      quantity,
      points,
      Math.ceil(points / days),
      expiresAt,
    ]
  );

  return { id: result?.id, profileId: userId, targetQuantity: quantity, budgetPoints: points, deliveredQuantity: 0, expiresAt };
}

async function getEligibleBoostedPosts({ userInterests = [], limit = 3 }) {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const rows = await db.query(
    `SELECT bp.id AS boost_id, bp.post_id, bp.objective, bp.target_interests,
            bp.budget_points, bp.spent_points, bp.created_at AS boost_created_at
       FROM boosted_promotions bp
      WHERE bp.item_type = 'post'
        AND bp.status = 'active'
        AND bp.expires_at > ?
      ORDER BY bp.created_at DESC LIMIT 20`,
    [now]
  );

  if (!rows.length) return [];

  const interestSet = new Set(userInterests.map((i) => String(i).toLowerCase()));
  const scored = rows.map((b) => {
    let targetInterests = [];
    try { targetInterests = JSON.parse(b.target_interests || '[]'); } catch {}

    let score = 1.0;
    if (targetInterests.length > 0) {
      const matchCount = targetInterests.filter((t) => interestSet.has(String(t).toLowerCase())).length;
      if (matchCount > 0) score += matchCount * 1.5;
    }
    return { boost: b, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.boost);
}

async function getEligibleBoostedProfiles({ userInterests = [], currentUserId, limit = 3 }) {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const rows = await db.query(
    `SELECT bp.id AS boost_id, bp.promoted_profile_id, bp.objective, bp.target_interests,
            u.fullname, u.username, u.bio, u.avatar_url, u.picture, u.verified,
            (SELECT COUNT(*) FROM follows f WHERE f.followed_id = u.id) AS follower_count
       FROM boosted_promotions bp
       JOIN users u ON u.id = bp.promoted_profile_id
      WHERE bp.item_type = 'profile'
        AND bp.status = 'active'
        AND bp.expires_at > ?
        AND bp.promoted_profile_id <> ?
        AND NOT EXISTS (SELECT 1 FROM follows mine WHERE mine.follower_id = ? AND mine.followed_id = u.id)
      ORDER BY bp.created_at DESC LIMIT 20`,
    [now, currentUserId, currentUserId]
  );

  if (!rows.length) return [];

  const interestSet = new Set(userInterests.map((i) => String(i).toLowerCase()));
  const scored = rows.map((row) => {
    let targetInterests = [];
    try { targetInterests = JSON.parse(row.target_interests || '[]'); } catch {}
    let score = 1.0;
    if (targetInterests.length > 0) {
      const matchCount = targetInterests.filter((t) => interestSet.has(String(t).toLowerCase())).length;
      if (matchCount > 0) score += matchCount * 1.5;
    }
    return { row, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ row }) => ({
    id: row.promoted_profile_id,
    boostId: row.boost_id,
    name: row.fullname || '',
    username: row.username || '',
    handle: row.username?.startsWith('@') ? row.username : `@${row.username || ''}`,
    bio: row.bio || '',
    picture: row.avatar_url || row.picture || null,
    verified: Boolean(Number(row.verified || 0)),
    followers: Number(row.follower_count || 0),
    isPromoted: true,
    itemType: 'boosted_profile',
  }));
}

async function getUserBoosts(userId) {
  const boosts = await db.query(
    `SELECT bp.*, p.body AS post_body, p.category AS post_category
       FROM boosted_promotions bp
  LEFT JOIN posts p ON p.id = bp.post_id
      WHERE bp.user_id = ?
      ORDER BY bp.created_at DESC`,
    [userId]
  );

  return boosts.map((b) => ({
    id: b.id,
    itemType: b.item_type,
    postId: b.post_id,
    postSnippet: b.post_body ? b.post_body.slice(0, 100) : null,
    postCategory: b.post_category,
    promotedProfileId: b.promoted_profile_id,
    objective: b.objective,
    targetQuantity: Number(b.target_quantity || 0),
    deliveredQuantity: Number(b.delivered_quantity || 0),
    budgetPoints: b.budget_points,
    spentPoints: b.spent_points,
    status: b.status,
    createdAt: b.created_at,
    expiresAt: b.expires_at,
  }));
}

module.exports = {
  boostPost,
  boostProfile,
  getEligibleBoostedPosts,
  getEligibleBoostedProfiles,
  getUserBoosts,
};
