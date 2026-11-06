const express = require('express');
const { db, asyncRoute, notFound } = require('./utils');
const {
  PLATFORM_FEE_PERCENT, createHostedCheckout, flutterwaveRequest, getAccountForUser,
  isFlutterwavePaymentsConfigured, isFlutterwaveSecretConfigured, isFlutterwaveWebhookSecretConfigured,
  isFlutterwaveWebhookUrlConfigured, isPublicAppUrlConfigured, parseMoney,
} = require('../flutterwave');

const router = express.Router();
const DEFAULT_FAN_PASS_NGN = '3000.00';
let cachedBanks = [];
let banksFetchedAt = 0;

router.get('/payments/me', asyncRoute(async (req, res) => {
  const user = await getHumanUser(req.user.id);
  if (!user) return notFound(res, 'Your account was not found.');
  const account = await getAccountForUser(user.id);
  const transactions = await db.query(
    `SELECT gross_amount, platform_fee, transfer_amount, currency, status, created_at
       FROM payment_transactions WHERE seller_id = ? ORDER BY created_at DESC LIMIT 50`,
    [user.id],
  );
  const totals = {};
  for (const row of transactions) {
    if (!['paid', 'pending'].includes(String(row.status || '').toLowerCase())) continue;
    const currency = String(row.currency || 'NGN').toUpperCase();
    totals[currency] ||= { creator: 0, platform: 0, gross: 0 };
    totals[currency].creator += parseMoney(row.transfer_amount) || 0;
    totals[currency].platform += parseMoney(row.platform_fee) || 0;
    totals[currency].gross += parseMoney(row.gross_amount) || 0;
  }
  res.json({
    feePercent: PLATFORM_FEE_PERCENT,
    gatewayConfigured: isFlutterwaveSecretConfigured() && isFlutterwaveWebhookSecretConfigured(),
    publicUrlConfigured: isPublicAppUrlConfigured(),
    webhookUrlConfigured: isFlutterwaveWebhookUrlConfigured(),
    webhookUrl: isFlutterwaveWebhookUrlConfigured() ? String(process.env.FLW_WEBHOOK_URL).trim() : null,
    missingConfig: [
      ...(!isFlutterwaveSecretConfigured() ? ['FLW_SECRET_KEY'] : []),
      ...(!isFlutterwaveWebhookSecretConfigured() ? ['FLW_SECRET_HASH'] : []),
      ...(!isFlutterwaveWebhookUrlConfigured() ? ['FLW_WEBHOOK_URL'] : []),
      ...(!isPublicAppUrlConfigured() ? ['PUBLIC_APP_URL'] : []),
    ],
    payoutAccount: account ? {
      country: account.payout_country, status: account.status, ready: Boolean(account.ready),
      bankName: account.bank_name, accountName: account.account_name, accountMasked: account.account_masked,
    } : null,
    creatorMembership: user.creator_membership_price ? {
      price: user.creator_membership_price,
      currency: user.creator_membership_currency || 'NGN',
      passDays: 30,
    } : null,
    earnings: Object.entries(totals).map(([currency, value]) => ({
      currency,
      gross: centsToAmount(value.gross),
      platformFee: centsToAmount(value.platform),
      creatorShare: centsToAmount(value.creator),
    })),
  });
}));

router.get('/payments/banks', asyncRoute(async (_req, res) => {
  const banks = await getNigerianBanks();
  res.json({ banks });
}));

router.post('/payments/resolve-bank-account', asyncRoute(async (req, res) => {
  const { bankCode, accountNumber } = bankDetails(req.body);
  await ensureBankExists(bankCode);
  const resolved = await resolveNigerianAccount(bankCode, accountNumber);
  res.json({ accountName: resolved.accountName, accountNumber: resolved.accountNumber });
}));

router.post('/payments/payout-account', asyncRoute(async (req, res) => {
  const user = await getHumanUser(req.user.id);
  if (!user) return notFound(res, 'Your account was not found.');
  if (await getAccountForUser(user.id)) return res.status(409).json({ message: 'A payout bank account is already connected. Contact support to change it.' });

  const { bankCode, accountNumber } = bankDetails(req.body);
  const mobile = normalizePhone(req.body?.mobile);
  const confirmedName = normalizeAccountName(req.body?.confirmedAccountName);
  if (!mobile) return res.status(400).json({ message: 'Enter a valid phone number for your payout account.' });
  if (!confirmedName) return res.status(400).json({ message: 'Resolve and confirm your bank account name before saving it.' });

  await ensureBankExists(bankCode);
  const resolved = await resolveNigerianAccount(bankCode, accountNumber);
  if (normalizeAccountName(resolved.accountName) !== confirmedName) {
    return res.status(409).json({ message: 'The bank account name changed. Resolve the account again before saving it.' });
  }
  const created = await flutterwaveRequest('POST', 'subaccounts', {
    account_bank: bankCode,
    account_number: accountNumber,
    business_name: resolved.accountName.slice(0, 100),
    business_mobile: mobile,
    business_email: user.email,
    business_contact: String(user.fullname || user.username || 'QuickChat creator').slice(0, 100),
    business_contact_mobile: mobile,
    country: 'NG',
    split_type: 'percentage',
    split_value: 0.9,
  });
  const subaccount = created?.data || {};
  if (!subaccount.id || !subaccount.subaccount_id) {
    const error = new Error('Flutterwave did not return a complete creator subaccount. Please contact support before retrying.');
    error.status = 502;
    error.outcomeUnknown = true;
    throw error;
  }
  const bank = (await getNigerianBanks()).find((entry) => String(entry.code) === bankCode);
  const maskedAccount = `${accountNumber.slice(0, 2)}••••••${accountNumber.slice(-2)}`;
  await db.query(
    `INSERT INTO flutterwave_creator_accounts
     (user_id, flw_id, flw_subaccount_id, payout_country, bank_code, bank_name, account_name, account_masked, status)
     VALUES (?, ?, ?, 'NG', ?, ?, ?, ?, 'active')`,
    [user.id, String(subaccount.id), String(subaccount.subaccount_id), bankCode,
      String(subaccount.bank_name || bank?.name || 'Nigerian bank').slice(0, 120),
      resolved.accountName.slice(0, 120), maskedAccount],
  );
  await db.update('UPDATE users SET payout_country = ? WHERE id = ?', ['NG', user.id]);
  res.json({
    payoutAccount: {
      country: 'NG', status: 'active', ready: true,
      bankName: String(subaccount.bank_name || bank?.name || 'Nigerian bank'),
      accountName: resolved.accountName, accountMasked: maskedAccount,
    },
  });
}));

router.patch('/payments/creator-membership', asyncRoute(async (req, res) => {
  const user = await getHumanUser(req.user.id);
  if (!user) return notFound(res, 'Your account was not found.');
  if (req.body?.enabled === false) {
    await db.update(
      'UPDATE users SET creator_membership_price = NULL, creator_membership_currency = NULL, creator_membership_product_id = NULL WHERE id = ?',
      [user.id],
    );
    return res.json({ creatorMembership: null });
  }
  if (!isFlutterwavePaymentsConfigured()) return res.status(503).json({ message: 'Flutterwave payments are not fully configured yet.' });
  const cents = parseMoney(req.body?.price ?? DEFAULT_FAN_PASS_NGN);
  if (!cents || cents < 300000) return res.status(400).json({ message: 'Set a 30-day fan pass price from ₦3,000 to ₦1,000,000.' });
  const account = await getAccountForUser(user.id);
  if (!account?.ready) return res.status(409).json({ message: 'Add your Flutterwave payout bank account in Settings before enabling paid fans.' });

  const amount = centsToAmount(cents);
  await db.update(
    'UPDATE users SET creator_membership_price = ?, creator_membership_currency = ? WHERE id = ?',
    [amount, 'NGN', user.id],
  );
  res.json({ creatorMembership: { price: amount, currency: 'NGN', passDays: 30 } });
}));

router.post('/payments/posts/:postId/checkout', asyncRoute(async (req, res) => {
  const buyer = await getHumanUser(req.user.id);
  if (!buyer) return notFound(res, 'Your account was not found.');
  const postId = positiveId(req.params.postId);
  if (!postId) return res.status(400).json({ message: 'Invalid post ID.' });
  const post = await db.getOne(
    `SELECT p.id, p.author_id, p.visibility, p.price_amount, p.price_currency,
            u.fullname, u.username, u.is_synthetic
       FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?`,
    [postId],
  );
  if (!post) return notFound(res, 'Post not found.');
  if (Number(post.author_id) === Number(buyer.id)) return res.status(400).json({ message: 'You already own this post.' });
  if (post.visibility !== 'premium') return res.status(400).json({ message: 'This post does not have a one-time price.' });
  if (Number(post.is_synthetic || 0) === 1) return res.status(403).json({ message: 'Automated accounts cannot sell paid content.' });
  const purchased = await db.getOne('SELECT post_id FROM content_purchases WHERE post_id = ? AND user_id = ?', [postId, buyer.id]);
  if (purchased) return res.status(409).json({ message: 'You have already unlocked this post.' });
  const result = await startCheckout({
    buyer, sellerId: Number(post.author_id), itemType: 'post', itemId: postId,
    amount: post.price_amount, currency: post.price_currency || 'NGN',
    productName: `QuickChat post by ${post.fullname || post.username}`,
    productDescription: String(post.body || '').slice(0, 500) || 'Premium QuickChat post',
    billingCycle: 'one_time',
  });
  res.json(result);
}));

router.post('/payments/creators/:creatorId/checkout', asyncRoute(async (req, res) => {
  const buyer = await getHumanUser(req.user.id);
  if (!buyer) return notFound(res, 'Your account was not found.');
  const creatorId = positiveId(req.params.creatorId);
  if (!creatorId || creatorId === Number(buyer.id)) return res.status(400).json({ message: 'Choose another creator to support.' });
  const creator = await db.getOne('SELECT id, fullname, username, creator_membership_price, is_synthetic FROM users WHERE id = ?', [creatorId]);
  if (!creator) return notFound(res, 'Creator not found.');
  if (Number(creator.is_synthetic || 0) === 1) return res.status(403).json({ message: 'Automated accounts cannot sell paid content.' });
  if (!creator.creator_membership_price) return res.status(404).json({ message: 'This creator has not enabled paid fans.' });
  if (await activeEntitlement('creator', creatorId, buyer.id)) return res.status(409).json({ message: 'Your 30-day fan pass is already active.' });
  const result = await startCheckout({
    buyer, sellerId: creatorId, itemType: 'creator', itemId: creatorId,
    amount: creator.creator_membership_price, currency: 'NGN',
    productName: `${creator.fullname || creator.username} · 30-day fan pass`,
    productDescription: `30 days of fans-only posts from ${creator.fullname || creator.username}.`,
    billingCycle: 'one_time',
  });
  res.json(result);
}));

router.post('/payments/communities/:communityId/checkout', asyncRoute(async (req, res) => {
  const buyer = await getHumanUser(req.user.id);
  if (!buyer) return notFound(res, 'Your account was not found.');
  const communityId = positiveId(req.params.communityId);
  const community = communityId ? await db.getOne(
    `SELECT c.id, c.name, c.created_by, c.monthly_price, c.price_currency, u.is_synthetic
       FROM communities c LEFT JOIN users u ON u.id = c.created_by WHERE c.id = ?`,
    [communityId],
  ) : null;
  if (!community) return notFound(res, 'Community not found.');
  if (Number(community.created_by) === Number(buyer.id)) return res.status(400).json({ message: 'You already own this community.' });
  if (!community.monthly_price) return res.status(400).json({ message: 'This community is free to join.' });
  if (Number(community.is_synthetic || 0) === 1) return res.status(403).json({ message: 'Automated accounts cannot sell paid communities.' });
  if (await activeEntitlement('community', communityId, buyer.id)) return res.status(409).json({ message: 'Your 30-day community pass is already active.' });
  const result = await startCheckout({
    buyer, sellerId: Number(community.created_by), itemType: 'community', itemId: communityId,
    amount: community.monthly_price, currency: community.price_currency || 'NGN',
    productName: `${community.name} · 30-day community pass`,
    productDescription: `30 days of membership in ${community.name}.`,
    billingCycle: 'one_time',
  });
  res.json(result);
}));

async function startCheckout({ buyer, sellerId, itemType, itemId, amount, currency, productName, productDescription, billingCycle }) {
  const cents = parseMoney(amount);
  const minimum = itemType === 'post' ? 50000 : 300000;
  if (!cents || cents < minimum) {
    const error = new Error(itemType === 'post'
      ? 'Premium posts must cost at least ₦500.'
      : '30-day fan and community passes must cost at least ₦3,000.');
    error.status = 409;
    throw error;
  }
  const account = await getAccountForUser(sellerId);
  if (!account?.ready) {
    const error = new Error('The creator must add a Flutterwave payout bank account before this can be purchased.');
    error.status = 409;
    throw error;
  }
  return createHostedCheckout({
    buyer, sellerId, itemType, itemId, amount: centsToAmount(cents),
    productName, productDescription, currency,
  });
}

async function getNigerianBanks() {
  if (cachedBanks.length && Date.now() - banksFetchedAt < 60 * 60 * 1000) return cachedBanks;
  const result = await flutterwaveRequest('GET', 'banks/NG?include_provider_type=1');
  cachedBanks = (Array.isArray(result?.data) ? result.data : [])
    .map((bank) => ({
      code: String(bank.code ?? bank.id ?? '').trim(),
      name: String(bank.name || '').trim(),
      providerType: String(bank.provider_type || bank.type || '').toLowerCase(),
    }))
    .filter((bank) => bank.code && bank.name && (!bank.providerType || bank.providerType === 'bank'))
    .sort((left, right) => left.name.localeCompare(right.name));
  banksFetchedAt = Date.now();
  return cachedBanks;
}

function bankDetails(body) {
  const bankCode = String(body?.bankCode || '').trim();
  const accountNumber = String(body?.accountNumber || '').replace(/\s+/g, '');
  if (!/^\d{1,12}$/.test(bankCode) || !/^\d{10}$/.test(accountNumber)) {
    const error = new Error('Choose a Nigerian bank and enter its 10-digit account number.');
    error.status = 400;
    throw error;
  }
  return { bankCode, accountNumber };
}

async function ensureBankExists(bankCode) {
  if (!(await getNigerianBanks()).some((bank) => bank.code === bankCode)) {
    const error = new Error('Choose a bank from the Nigerian bank list.');
    error.status = 400;
    throw error;
  }
}

async function resolveNigerianAccount(bankCode, accountNumber) {
  const result = await flutterwaveRequest('POST', 'accounts/resolve', {
    account_bank: bankCode,
    account_number: accountNumber,
  });
  const accountName = String(result?.data?.account_name || '').trim();
  if (!accountName) {
    const error = new Error('Flutterwave could not verify that bank account. Check the number and bank, then try again.');
    error.status = 400;
    throw error;
  }
  return { accountName, accountNumber: String(result.data.account_number || accountNumber) };
}

function normalizeAccountName(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function normalizePhone(value) {
  const phone = String(value || '').trim().replace(/[\s()-]/g, '');
  return /^\+?\d{7,15}$/.test(phone) ? phone : null;
}

async function activeEntitlement(entityType, entityId, userId) {
  return db.getOne(
    `SELECT id FROM content_subscriptions
      WHERE entity_type = ? AND entity_id = ? AND subscriber_id = ?
        AND status = 'active' AND current_period_end > CURRENT_TIMESTAMP`,
    [entityType, entityId, userId],
  );
}

async function getHumanUser(userId) {
  const user = await db.getOne('SELECT id, fullname, username, email, payout_country, creator_membership_price, creator_membership_currency, creator_membership_product_id, is_synthetic FROM users WHERE id = ?', [userId]);
  return user && Number(user.is_synthetic || 0) === 0 ? user : null;
}

function centsToAmount(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

module.exports = router;
