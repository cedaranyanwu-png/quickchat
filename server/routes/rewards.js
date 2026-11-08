const express = require('express');
const crypto = require('node:crypto');
const { db, asyncRoute, notFound } = require('./utils');
const {
  POINTS_PER_NAIRA, REFERRAL_REWARD_POINTS, awardVerification, cashBalance,
  convertRewardPoints, rewardBalance,
} = require('../rewards');
const { requirePermission, audit } = require('./admin');

const router = express.Router();

router.get('/rewards/me', asyncRoute(async (req, res) => {
  const [points, cashKobo, referrals, pointTransactions, cashTransactions, payoutAccount] = await Promise.all([
    rewardBalance(req.user.id),
    cashBalance(req.user.id),
    db.getCount('SELECT COUNT(*) AS count FROM user_referrals WHERE referrer_id = ?', [req.user.id]),
    db.query('SELECT id, amount, kind, created_at FROM reward_point_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 30', [req.user.id]),
    db.query('SELECT id, amount_kobo, kind, created_at FROM reward_cash_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 30', [req.user.id]),
    db.getOne('SELECT bank_name, account_name, account_masked, status FROM flutterwave_creator_accounts WHERE user_id = ?', [req.user.id]),
  ]);
  res.json({
    rewardPoints: points,
    cashBalance: (cashKobo / 100).toFixed(2),
    currency: 'NGN',
    conversionRate: { points: POINTS_PER_NAIRA, naira: 1 },
    referralRewardPoints: REFERRAL_REWARD_POINTS,
    referralCode: `QC${req.user.id}`,
    referralLink: `${String(process.env.PUBLIC_APP_URL || '').replace(/\/$/, '')}/register?ref=QC${req.user.id}`,
    referrals,
    payoutAccount: payoutAccount ? {
      bankName: payoutAccount.bank_name, accountName: payoutAccount.account_name,
      accountMasked: payoutAccount.account_masked, status: payoutAccount.status,
    } : null,
    pointTransactions,
    cashTransactions: cashTransactions.map((row) => ({ ...row, amount: (Number(row.amount_kobo) / 100).toFixed(2) })),
  });
}));

router.post('/rewards/convert', asyncRoute(async (req, res) => {
  const result = await convertRewardPoints(req.user.id, req.body?.points);
  if (!result.ok) {
    const status = result.reason === 'insufficient' ? 402 : result.reason === 'minimum' ? 400 : 409;
    return res.status(status).json({
      message: result.reason === 'insufficient'
        ? 'You do not have enough reward points.'
        : `Convert at least ${POINTS_PER_NAIRA} points in multiples of ${POINTS_PER_NAIRA}.`,
      ...result,
    });
  }
  res.json({ message: `₦${result.naira.toLocaleString('en-NG')} added to your withdrawable wallet.`, ...result });
}));

router.post('/rewards/withdrawals', asyncRoute(async (req, res) => {
  const amount = Math.round(Number(req.body?.amount) * 100);
  if (!Number.isSafeInteger(amount) || amount < 10000) {
    return res.status(400).json({ message: 'The minimum withdrawal request is ₦100.' });
  }
  const account = await db.getOne(
    "SELECT user_id, bank_name, account_name, account_masked FROM flutterwave_creator_accounts WHERE user_id = ? AND status = 'active'",
    [req.user.id],
  );
  if (!account) return res.status(409).json({ message: 'Connect and verify your payout bank account in Settings before requesting a withdrawal.' });
  const pending = await db.getOne("SELECT id FROM reward_withdrawals WHERE user_id = ? AND status = 'pending'", [req.user.id]);
  if (pending) return res.status(409).json({ message: 'You already have a pending withdrawal request.' });
  const balance = await cashBalance(req.user.id);
  if (balance < amount) return res.status(402).json({ message: 'Your withdrawable balance is insufficient.', balance: (balance / 100).toFixed(2) });
  const reference = `withdraw_${req.user.id}_${crypto.randomUUID()}`;
  const debited = await db.update(
    'UPDATE reward_cash_wallets SET balance_kobo = balance_kobo - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND balance_kobo >= ?',
    [amount, req.user.id, amount],
  );
  if (!debited) return res.status(402).json({ message: 'Your withdrawable balance is insufficient.' });
  try {
    const row = await db.insert(
      'INSERT INTO reward_withdrawals (user_id, amount_kobo, currency, bank_name, account_name, account_masked, reference, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, amount, 'NGN', account.bank_name, account.account_name, account.account_masked, reference, 'pending'],
    );
    await db.insert(
      'INSERT INTO reward_cash_transactions (user_id, amount_kobo, kind, reference) VALUES (?, ?, ?, ?)',
      [req.user.id, -amount, 'withdrawal_hold', `${reference}_hold`],
    );
    return res.status(201).json({ message: 'Withdrawal request submitted for admin review.', withdrawal: row });
  } catch (error) {
    await db.update('UPDATE reward_cash_wallets SET balance_kobo = balance_kobo + ? WHERE user_id = ?', [amount, req.user.id]);
    throw error;
  }
}));

router.get('/rewards/withdrawals', asyncRoute(async (req, res) => {
  const rows = await db.query(
    'SELECT id, amount_kobo, currency, bank_name, account_name, account_masked, status, admin_note, created_at, reviewed_at FROM reward_withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 30',
    [req.user.id],
  );
  res.json({ withdrawals: rows.map((row) => ({ ...row, amount: (Number(row.amount_kobo) / 100).toFixed(2) })) });
}));

router.get('/admin/rewards/withdrawals', requirePermission('rewards.manage'), asyncRoute(async (req, res) => {
  const status = ['pending', 'approved', 'paid', 'rejected'].includes(String(req.query.status)) ? String(req.query.status) : 'pending';
  const rows = await db.query(
    'SELECT w.*, u.fullname, u.username, u.email FROM reward_withdrawals w JOIN users u ON u.id = w.user_id WHERE w.status = ? ORDER BY w.id ASC LIMIT 100',
    [status],
  );
  res.json({ withdrawals: rows.map((row) => ({ ...row, amount: (Number(row.amount_kobo) / 100).toFixed(2) })) });
}));

router.post('/admin/rewards/withdrawals/:id/review', requirePermission('rewards.manage'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const action = String(req.body?.action || '');
  const note = String(req.body?.note || '').trim().slice(0, 1000);
  if (!Number.isSafeInteger(id) || id < 1 || !['approve', 'reject', 'mark_paid'].includes(action)) {
    return res.status(400).json({ message: 'Choose a valid withdrawal and action.' });
  }
  const withdrawal = await db.getOne('SELECT * FROM reward_withdrawals WHERE id = ?', [id]);
  if (!withdrawal) return notFound(res, 'Withdrawal request not found.');
  if (action === 'approve' && withdrawal.status !== 'pending') return res.status(409).json({ message: 'Only pending withdrawals can be approved.' });
  if (action === 'reject' && withdrawal.status !== 'pending') return res.status(409).json({ message: 'Only pending withdrawals can be rejected.' });
  if (action === 'mark_paid' && withdrawal.status !== 'approved') return res.status(409).json({ message: 'Only approved withdrawals can be marked paid.' });
  const next = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'paid';
  if (action === 'reject') {
    await db.update('UPDATE reward_cash_wallets SET balance_kobo = balance_kobo + ? WHERE user_id = ?', [withdrawal.amount_kobo, withdrawal.user_id]);
    await db.insert(
      'INSERT INTO reward_cash_transactions (user_id, amount_kobo, kind, reference) VALUES (?, ?, ?, ?)',
      [withdrawal.user_id, withdrawal.amount_kobo, 'withdrawal_refund', `withdrawal_${id}_refund`],
    );
  }
  await db.update(
    'UPDATE reward_withdrawals SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?',
    [next, note, req.user.id, id],
  );
  await audit(req, `reward.withdrawal_${next}`, 'reward_withdrawal', id, note || `Withdrawal marked ${next}`, withdrawal, { status: next });
  res.json({ message: action === 'mark_paid' ? 'Withdrawal marked as paid. Confirm the actual bank transfer separately.' : `Withdrawal ${next}.`, status: next });
}));

module.exports = router;
