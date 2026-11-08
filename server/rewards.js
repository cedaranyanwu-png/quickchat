const db = require('./database');

const POINTS_PER_NAIRA = 100;
const PURCHASED_POINTS_PER_NAIRA = 10;
const REFERRAL_REWARD_POINTS = 10;
const DEFAULT_VERIFICATION_REWARD_POINTS = 1000;
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


async function recordRewardCommission(sourceType, sourceReference, grossPoints, commissionPoints, recipientPoints) {
  try {
    await db.insert(
      'INSERT INTO reward_platform_commissions (source_type, source_reference, gross_points, commission_points, recipient_points) VALUES (?, ?, ?, ?, ?)',
      [sourceType, String(sourceReference).slice(0, 160), grossPoints, commissionPoints, recipientPoints],
    );
    return true;
  } catch (error) {
    if (uniqueError(error)) return false;
    throw error;
  }
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
  // Insert the unique ledger row before crediting the spendable wallet. This avoids
  // duplicate startup backfills increasing a balance more than once.
  const { ensureWallet, currentBalance } = require('./wallet');
  await ensureWallet(userId);
  try {
    await db.insert(
      'INSERT INTO point_transactions (user_id, amount, kind, reference) VALUES (?, ?, ?, ?)',
      [userId, DEFAULT_VERIFICATION_REWARD_POINTS, 'verification_bonus', `verification_bonus_${userId}`],
    );
  } catch (error) {
    if (uniqueError(error)) return { ok: false, reason: 'duplicate', points: 0, method };
    throw error;
  }
  const updated = await db.update(
    'UPDATE point_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
    [DEFAULT_VERIFICATION_REWARD_POINTS, userId],
  );
  if (!updated) {
    await db.delete('DELETE FROM point_transactions WHERE reference = ?', [`verification_bonus_${userId}`]);
    return { ok: false, reason: 'missing-wallet', points: 0, method };
  }
  return { ok: true, balance: await currentBalance(userId), points: DEFAULT_VERIFICATION_REWARD_POINTS, method };
}

async function convertibleRewardBalance(userId) {
  const row = await db.getOne(
    `SELECT COALESCE(SUM(amount), 0) AS balance
       FROM reward_point_transactions
      WHERE user_id = ?
        AND kind IN ('paid_chat_earning', 'paid_post_earning', 'paid_group_earning', 'paid_community_earning', 'conversion', 'conversion_rollback')`,
    [userId],
  );
  return Math.max(0, Number(row?.balance || 0));
}

async function convertRewardPoints(userId, points) {
  const amount = Math.trunc(Number(points));
  if (!Number.isSafeInteger(amount) || amount < POINTS_PER_NAIRA || amount % POINTS_PER_NAIRA !== 0) {
    return { ok: false, reason: 'minimum', required: POINTS_PER_NAIRA };
  }
  const eligibleBalance = await convertibleRewardBalance(userId);
  if (eligibleBalance < amount) return { ok: false, reason: 'insufficient', balance: eligibleBalance, eligibleBalance };
  const reference = `reward_conversion_${userId}_${Date.now()}_${require('node:crypto').randomUUID()}`;
  const debited = await debitRewardPoints(userId, amount, { kind: 'conversion', reference: `${reference}_points` });
  if (!debited.ok) return debited;
  const naira = amount / POINTS_PER_NAIRA;
  let credited;
  try {
    credited = await creditCash(userId, naira * 100, { reference: `${reference}_cash` });
  } catch (error) {
    await creditRewardPoints(userId, amount, { kind: 'conversion_rollback', reference: `${reference}_rollback` });
    throw error;
  }
  if (!credited.ok) {
    await creditRewardPoints(userId, amount, { kind: 'conversion_rollback', reference: `${reference}_rollback` });
    return credited;
  }
  return { ok: true, points: amount, naira, rewardBalance: debited.balance, cashBalanceKobo: await cashBalance(userId) };
}


async function initializeRewardTables() {
  const idColumn = db.type === 'postgres'
    ? 'INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY'
    : db.type === 'mysql'
      ? 'INTEGER AUTO_INCREMENT PRIMARY KEY'
      : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const dateType = db.type === 'sqlite' ? 'DATETIME' : 'TIMESTAMP';
  const statements = [
    `CREATE TABLE IF NOT EXISTS reward_wallets (
      user_id INTEGER PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0,
      updated_at ${dateType} DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS reward_point_transactions (
      id ${idColumn}, user_id INTEGER NOT NULL, amount INTEGER NOT NULL,
      kind VARCHAR(40) NOT NULL, reference VARCHAR(160) NOT NULL UNIQUE,
      created_at ${dateType} DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS reward_cash_wallets (
      user_id INTEGER PRIMARY KEY, balance_kobo BIGINT NOT NULL DEFAULT 0,
      updated_at ${dateType} DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS reward_cash_transactions (
      id ${idColumn}, user_id INTEGER NOT NULL, amount_kobo BIGINT NOT NULL,
      kind VARCHAR(40) NOT NULL, reference VARCHAR(160) NOT NULL UNIQUE,
      created_at ${dateType} DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS reward_platform_commissions (\n      id ${idColumn}, source_type VARCHAR(40) NOT NULL, source_reference VARCHAR(160) NOT NULL UNIQUE,\n      gross_points INTEGER NOT NULL, commission_points INTEGER NOT NULL, recipient_points INTEGER NOT NULL,\n      created_at ${dateType} DEFAULT CURRENT_TIMESTAMP\n    )`,
    `CREATE TABLE IF NOT EXISTS user_referrals (
      id ${idColumn}, referrer_id INTEGER NOT NULL, referred_user_id INTEGER NOT NULL UNIQUE,
      reward_points INTEGER NOT NULL DEFAULT 10, created_at ${dateType} DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS reward_withdrawals (
      id ${idColumn}, user_id INTEGER NOT NULL, amount_kobo BIGINT NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'NGN', bank_name VARCHAR(120) NOT NULL,
      account_name VARCHAR(120) NOT NULL, account_masked VARCHAR(32) NOT NULL,
      reference VARCHAR(120) NOT NULL UNIQUE, status VARCHAR(20) NOT NULL DEFAULT 'pending',
      admin_note TEXT, reviewed_by INTEGER, reviewed_at ${dateType},
      created_at ${dateType} DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
  for (const statement of statements) await db.query(statement);
}

module.exports = {
  initializeRewardTables,
  POINTS_PER_NAIRA, PURCHASED_POINTS_PER_NAIRA, REFERRAL_REWARD_POINTS, DEFAULT_VERIFICATION_REWARD_POINTS,
  PLATFORM_COMMISSION_PERCENT, awardReferral, awardVerification, cashBalance,
  convertRewardPoints, creditCash, creditRewardPoints, ensureRewardWallet,
  rewardBalance, convertibleRewardBalance, recordRewardCommission,
};
