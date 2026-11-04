const db = require('./database');
const { welcomePoints } = require('./gifts');

// The wallet is created lazily on first use so existing accounts pick up the
// welcome points and new accounts need no extra registration step.
async function ensureWallet(userId) {
  let wallet = await db.getOne('SELECT user_id, balance FROM point_wallets WHERE user_id = ?', [userId]);
  if (wallet) return wallet;

  const bonus = welcomePoints();
  try {
    await db.insert(
      'INSERT INTO point_wallets (user_id, balance) VALUES (?, ?)',
      [userId, bonus],
    );
    wallet = { user_id: userId, balance: bonus };
    if (bonus > 0) {
      await db.query(
        'INSERT INTO point_transactions (user_id, amount, kind, reference) VALUES (?, ?, ?, ?)',
        [userId, bonus, 'welcome', `welcome_${userId}`],
      );
    }
    return wallet;
  } catch (error) {
    // Two parallel requests can race to create the row; the loser reads it back.
    wallet = await db.getOne('SELECT user_id, balance FROM point_wallets WHERE user_id = ?', [userId]);
    if (!wallet) throw error;
    return wallet;
  }
}

async function currentBalance(userId) {
  const wallet = await ensureWallet(userId);
  return Number(wallet?.balance || 0);
}

async function creditPoints(userId, amount, { kind = 'credit', reference = null, sessionId = null } = {}) {
  const points = Math.trunc(Number(amount));
  if (!Number.isSafeInteger(points) || points <= 0) return { ok: false, reason: 'invalid' };
  await ensureWallet(userId);
  const changed = await db.update(
    'UPDATE point_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
    [points, userId],
  );
  if (!changed) return { ok: false, reason: 'missing-wallet' };
  try {
    await db.query(
      'INSERT INTO point_transactions (user_id, amount, kind, reference, session_id) VALUES (?, ?, ?, ?, ?)',
      [userId, points, kind, reference, sessionId],
    );
  } catch (error) {
    // A repeated reference means this credit already landed (webhook retry).
    if (isUniqueConstraint(error) && reference) return { ok: false, reason: 'duplicate' };
    await db.update(
      'UPDATE point_wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [points, userId],
    );
    throw error;
  }
  return { ok: true, balance: await currentBalance(userId) };
}

async function spendPoints(userId, amount, { kind = 'spend', reference = null, sessionId = null } = {}) {
  const points = Math.trunc(Number(amount));
  if (!Number.isSafeInteger(points) || points <= 0) return { ok: false, reason: 'invalid' };
  await ensureWallet(userId);
  // The balance guard lives in the UPDATE so two gifts cannot overdraw a wallet.
  const changed = await db.update(
    'UPDATE point_wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND balance >= ?',
    [points, userId, points],
  );
  if (!changed) return { ok: false, reason: 'insufficient', balance: await currentBalance(userId) };

  try {
    await db.query(
      'INSERT INTO point_transactions (user_id, amount, kind, reference, session_id) VALUES (?, ?, ?, ?, ?)',
      [userId, -points, kind, reference, sessionId],
    );
  } catch (error) {
    await db.update(
      'UPDATE point_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [points, userId],
    );
    throw error;
  }
  return { ok: true, balance: await currentBalance(userId) };
}

async function recentTransactions(userId, limit = 12) {
  return db.query(
    `SELECT id, amount, kind, reference, session_id, created_at
       FROM point_transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
    [userId, Math.min(Math.max(Number(limit) || 12, 1), 50)],
  );
}

function isUniqueConstraint(error) {
  return ['23505', 'SQLITE_CONSTRAINT', 'ER_DUP_ENTRY'].includes(error?.code) ||
    String(error?.message || '').toLowerCase().includes('unique constraint') ||
    String(error?.message || '').toLowerCase().includes('duplicate key');
}

module.exports = {
  creditPoints,
  currentBalance,
  ensureWallet,
  isUniqueConstraint,
  recentTransactions,
  spendPoints,
};
