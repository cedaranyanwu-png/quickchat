const db = require('./database');

const POINTS_PER_NAIRA = 100;
const REFERRAL_REWARD_POINTS = 10;
const DEFAULT_VERIFICATION_REWARD_POINTS = 2000;
const PLATFORM_COMMISSION_PERCENT = 10;

function uniqueError(error) {
  return ['23505', 'SQLITE_CONSTRAINT', 'ER_DUP_ENTRY'].includes(error?.code) ||
    /unique constraint|duplicate key/i.test(String(error?.message || ''));
}

async function ensureRewardWallet(userId) {
  await db.query(
    'INSERT INTO reward_wallets (user_id, balance) VALUES (?, 0) ' +
    (db.type === 'mysql'
      ? 'ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)'
      : 'ON CONFLICT(user_id) DO NOTHING'),
    [userId],
  );
  return db.getOne('SELECT user_id, balance FROM reward_wallets WHERE user_id = ?', [userId]);
}

async function rewardBalance(userId) {
  const wallet = await ensureRewardWallet(userId);
  return Number(wallet?.balance || 0);
}

async function creditRewardPoints(userId, amount, { kind = 'reward', reference } = {}) {
  const points = Math.trunc(Number(amount));
  if (!Number.isSafeInteger(points) || points <= 0 || !reference) return { ok: false, reason: 'invalid' };
  await ensureRewardWallet(userId);
  try {
    await db.insert(
      'INSERT INTO reward_point_transactions (user_id, amount, kind, reference) VALUES (?, ?, ?, ?)',
      [userId, points, kind, String(reference).slice(0, 160)],
    );
  } catch (error) {
    if (uniqueError(error)) return { ok: false, reason: 'duplicate' };
    throw error;
  }
  await db.update(
    'UPDATE reward_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
    [points, userId],
  );
  return { ok: true, balance: await rewardBalance(userId) };
}

async function debitRewardPoints(userId, amount, { kind = 'conversion', reference } = {}) {
  const points = Math.trunc(Number(amount));
  if (!Number.isSafeInteger(points) || points <= 0 || !reference) return { ok: false, reason: 'invalid' };
  await ensureRewardWallet(userId);
  const changed = await db.update(
    'UPDATE reward_wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND balance >= ?',
    [points, userId, points],
  );
  if (!changed) return { ok: false, reason: 'insufficient', balance: await rewardBalance(userId) };
  try {
    await db.insert(
      'INSERT INTO reward_point_transactions (user_id, amount, kind, reference) VALUES (?, ?, ?, ?)',
      [userId, -points, kind, String(reference).slice(0, 160)],
    );
  } catch (error) {
    await db.update('UPDATE reward_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [points, userId]);
    if (uniqueError(error)) return { ok: false, reason: 'duplicate' };
    throw error;
  }
  return { ok: true, balance: await rewardBalance(userId) };
}

async function creditCash(userId, amountKobo, { kind = 'reward_conversion', reference } = {}) {
  const kobo = Math.trunc(Number(amountKobo));
  if (!Number.isSafeInteger(kobo) || kobo <= 0 || !reference) return { ok: false, reason: 'invalid' };
  await db.query(
    'INSERT INTO reward_cash_wallets (user_id, balance_kobo) VALUES (?, 0) ' +
    (db.type === 'mysql'
      ? 'ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)'
      : 'ON CONFLICT(user_id) DO NOTHING'),
    [userId],
  );
  try {
    await db.insert(
      'INSERT INTO reward_cash_transactions (user_id, amount_kobo, kind, reference) VALUES (?, ?, ?, ?)',
      [userId, kobo, kind, String(reference).slice(0, 160)],
    );
  } catch (error) {
    if (uniqueError(error)) return { ok: false, reason: 'duplicate' };
    throw error;
  }
  await db.update(
    'UPDATE reward_cash_wallets SET balance_kobo = balance_kobo + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
    [kobo, userId],
  );
  return { ok: true };
}

async function cashBalance(userId) {
  await db.query(
    'INSERT INTO reward_cash_wallets (user_id, balance_kobo) VALUES (?, 0) ' +
    (db.type === 'mysql'
      ? 'ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)'
      : 'ON CONFLICT(user_id) DO NOTHING'),
    [userId],
  );
  const wallet = await db.getOne('SELECT balance_kobo FROM reward_cash_wallets WHERE user_id = ?', [userId]);
  return Number(wallet?.balance_kobo || 0);
}

async function awardReferral(referrerId, referredUserId) {
  if (!referrerId || !referredUserId || Number(referrerId) === Number(referredUserId)) return false;
  const referral = await db.getOne('SELECT id FROM users WHERE id = ?', [referrerId]);
  if (!referral) return false;
  try {
    await db.insert(
      'INSERT INTO user_referrals (referrer_id, referred_user_id, reward_points) VALUES (?, ?, ?)',
      [referrerId, referredUserId, REFERRAL_REWARD_POINTS],
    );
  } catch (error) {
    if (uniqueError(error)) return false;
    throw error;
  }
  await creditRewardPoints(referrerId, REFERRAL_REWARD_POINTS, {
    kind: 'referral',
    reference: `referral_${referredUserId}`,
  });
  return true;
}

async function awardVerification(userId, method) {
  const setting = await db.getOne("SELECT setting_value FROM platform_settings WHERE setting_key = 'verification_reward_points'");
  const configured = Number.parseInt(setting?.setting_value || '', 10);
  const points = Number.isInteger(configured) && configured >= 0
    ? Math.min(configured, 1000000)
    : DEFAULT_VERIFICATION_REWARD_POINTS;
  if (!points) return { ok: true, balance: await rewardBalance(userId), points: 0 };
  const result = await creditRewardPoints(userId, points, {
    kind: 'verification',
    reference: `verification_reward_${userId}`,
  });
  return { ...result, points, method };
}

async function convertRewardPoints(userId, points) {
  const amount = Math.trunc(Number(points));
  if (!Number.isSafeInteger(amount) || amount < POINTS_PER_NAIRA || amount % POINTS_PER_NAIRA !== 0) {
    return { ok: false, reason: 'minimum', required: POINTS_PER_NAIRA };
  }
  const reference = `reward_conversion_${userId}_${Date.now()}_${require('node:crypto').randomUUID()}`;
  const debited = await debitRewardPoints(userId, amount, { kind: 'conversion', reference: `${reference}_points` });
  if (!debited.ok) return debited;
  const naira = amount / POINTS_PER_NAIRA;
  const credited = await creditCash(userId, naira * 100, { reference: `${reference}_cash` });
  if (!credited.ok) {
    await creditRewardPoints(userId, amount, { kind: 'conversion_rollback', reference: `${reference}_rollback` });
    return credited;
  }
  return { ok: true, points: amount, naira, rewardBalance: debited.balance - amount, cashBalanceKobo: await cashBalance(userId) };
}

module.exports = {
  POINTS_PER_NAIRA, REFERRAL_REWARD_POINTS, DEFAULT_VERIFICATION_REWARD_POINTS,
  PLATFORM_COMMISSION_PERCENT, awardReferral, awardVerification, cashBalance,
  convertRewardPoints, creditCash, creditRewardPoints, ensureRewardWallet,
  rewardBalance,
};
