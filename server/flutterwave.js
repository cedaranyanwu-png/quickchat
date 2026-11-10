const crypto = require('node:crypto');
const db = require('./database');

const PLATFORM_FEE_PERCENT = 10;
const FLUTTERWAVE_ENV = String(process.env.FLW_ENV || (process.env.NODE_ENV === 'production' ? 'live' : 'test')).toLowerCase();
const FLUTTERWAVE_API = String(
  process.env.FLW_API_BASE_URL ||
  (FLUTTERWAVE_ENV === 'live'
    ? 'https://f4bexperience.flutterwave.com'
    : 'https://developersandbox-api.flutterwave.com')
).replace(/\/$/, '');
const FLUTTERWAVE_IDP = 'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token';
const WEBHOOK_PATH = '/api/webhooks/flutterwave';

let accessToken = null;
let accessTokenExpiresAt = 0;

function parseMoney(value) {
  const input = String(value ?? '').trim();
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(input)) return null;
  const [whole, decimal = ''] = input.split('.');
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents >= 100 && cents <= 100000000 ? cents : null;
}

function moneyString(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function splitMoney(cents) {
  const platformCents = Math.round(cents * PLATFORM_FEE_PERCENT / 100);
  return { platformFee: moneyString(platformCents), creatorShare: moneyString(cents - platformCents) };
}

function isFlutterwaveConfigured() {
  return Boolean(
    String(process.env.FLW_CLIENT_ID || '').trim() &&
    String(process.env.FLW_CLIENT_SECRET || '').trim() &&
    String(process.env.FLW_ENCRYPTION_KEY || '').trim()
  );
}

function isFlutterwaveSecretConfigured() {
  return Boolean(String(process.env.FLW_CLIENT_ID || '').trim() && String(process.env.FLW_CLIENT_SECRET || '').trim());
}

function isFlutterwaveEncryptionKeyConfigured() {
  return Boolean(String(process.env.FLW_ENCRYPTION_KEY || '').trim());
}

function isFlutterwaveWebhookSecretConfigured() {
  return Boolean(String(process.env.FLW_WEBHOOK_SECRET || '').trim());
}

function publicAppUrl() {
  const configured = String(process.env.PUBLIC_APP_URL || '').trim();
  let parsed;
  try { parsed = new URL(configured); } catch (_error) { parsed = null; }
  const isLocal = process.env.APP_ENV === 'local' || process.env.NODE_ENV !== 'production';
  if (isLocal && parsed && /^https?:$/i.test(parsed.protocol)) return parsed.origin;
  if (!parsed || parsed.protocol !== 'https:' || /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(parsed.hostname)) {
    const error = new Error('Set PUBLIC_APP_URL to the public HTTPS address of this app before accepting payments.');
    error.status = 503;
    throw error;
  }
  return parsed.origin;
}

function isPublicAppUrlConfigured() {
  try { publicAppUrl(); return true; } catch (_error) { return false; }
}

function flutterwaveWebhookUrl() {
  const configured = String(process.env.FLW_WEBHOOK_URL || '').trim();
  let parsed;
  try { parsed = new URL(configured); } catch (_error) { parsed = null; }
  const isLocal = process.env.APP_ENV === 'local' || process.env.NODE_ENV !== 'production';
  if (isLocal && parsed && /^https?:$/i.test(parsed.protocol)) return parsed.href;
  const appOrigin = isPublicAppUrlConfigured() ? publicAppUrl() : null;
  if (!parsed || parsed.protocol !== 'https:' || parsed.origin !== appOrigin ||
      parsed.pathname.replace(/\/$/, '') !== WEBHOOK_PATH || parsed.search || parsed.hash) {
    const error = new Error(`Set FLW_WEBHOOK_URL to the public HTTPS URL ending in ${WEBHOOK_PATH}.`);
    error.status = 503;
    throw error;
  }
  return parsed.href;
}

function isFlutterwaveWebhookUrlConfigured() {
  try { flutterwaveWebhookUrl(); return true; } catch (_error) { return false; }
}

function isFlutterwavePaymentsConfigured() {
  return isFlutterwaveConfigured() && isFlutterwaveWebhookSecretConfigured() &&
    isFlutterwaveWebhookUrlConfigured() && isPublicAppUrlConfigured();
}

function isV4Production() {
  return FLUTTERWAVE_ENV === 'live';
}

function randomHeaderValue(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function getAccessToken() {
  if (!isFlutterwaveSecretConfigured()) {
    const error = new Error('Set FLW_CLIENT_ID and FLW_CLIENT_SECRET in server/.env to enable Flutterwave v4 payments.');
    error.status = 503;
    throw error;
  }
  if (accessToken && Date.now() < accessTokenExpiresAt - 60_000) return accessToken;

  let response;
  try {
    response = await fetch(FLUTTERWAVE_IDP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: String(process.env.FLW_CLIENT_ID).trim(),
        client_secret: String(process.env.FLW_CLIENT_SECRET).trim(),
        grant_type: 'client_credentials',
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (_error) {
    const error = new Error('Flutterwave authentication service could not be reached. Please try again shortly.');
    error.status = 502;
    throw error;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    const error = new Error(payload?.error_description || payload?.message || 'Flutterwave v4 authentication failed.');
    error.status = response.status >= 400 && response.status < 500 ? response.status : 502;
    throw error;
  }

  accessToken = String(payload.access_token);
  accessTokenExpiresAt = Date.now() + Number(payload.expires_in || 600) * 1000;
  return accessToken;
}

async function flutterwaveRequest(method, resource, body, options = {}) {
  const token = await getAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    'X-Trace-Id': options.traceId || randomHeaderValue('qc-trace'),
    'X-Idempotency-Key': options.idempotencyKey || randomHeaderValue('qc-idem'),
    ...(options.headers || {}),
  };

  let response;
  try {
    response = await fetch(`${FLUTTERWAVE_API}/${String(resource).replace(/^\/+/, '')}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
  } catch (_error) {
    const error = new Error('Flutterwave v4 could not be reached. Please try again shortly.');
    error.status = 502;
    error.outcomeUnknown = method !== 'GET';
    throw error;
  }

  if (response.status === 401) {
    accessToken = null;
    accessTokenExpiresAt = 0;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || String(payload?.status || '').toLowerCase() === 'failed' || payload?.error) {
    const error = new Error(
      payload?.error?.message ||
      payload?.message ||
      'Flutterwave v4 rejected the request.'
    );
    error.status = response.status >= 400 && response.status < 500 ? response.status : 502;
    error.providerCode = payload?.error?.code || payload?.code || null;
    error.providerRequestId = response.headers.get('x-request-id') || null;
    error.outcomeUnknown = response.status >= 500;
    throw error;
  }
  return payload;
}

function webhookSignature(rawBody, secret) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function getAccountForUser(userId) {
  const account = await db.getOne(
    `SELECT flw_id, flw_subaccount_id, flw_recipient_id, payout_country, bank_code, bank_name,
            account_name, account_masked, status
       FROM flutterwave_creator_accounts WHERE user_id = ?`,
    [userId],
  );
  return account ? { ...account, ready: account.status === 'active' && Boolean(account.flw_recipient_id) } : null;
}

async function createHostedCheckout({ buyer, sellerId, itemType, itemId, amount, currency = 'NGN', productName, productDescription }) {
  const amountCents = parseMoney(amount);
  if (!amountCents || String(currency).toUpperCase() !== 'NGN') {
    const error = new Error('Flutterwave v4 creator checkouts currently require a valid NGN amount.');
    error.status = 400;
    throw error;
  }
  if (!isFlutterwaveConfigured() || !isFlutterwaveWebhookSecretConfigured()) {
    const error = new Error('Set the Flutterwave v4 credentials and webhook secret in server/.env before accepting payments.');
    error.status = 503;
    throw error;
  }
  flutterwaveWebhookUrl();

  const account = sellerId ? await getAccountForUser(sellerId) : null;
  if (sellerId && (!account?.ready)) {
    const error = new Error('The creator must add and confirm a Nigerian bank account in Settings before this can be purchased.');
    error.status = 409;
    throw error;
  }

  const split = splitMoney(amountCents);
  const existing = await db.getOne(
    `SELECT id, checkout_url, flutterwave_tx_ref, status FROM payment_checkouts
      WHERE buyer_id = ? AND seller_id = ? AND item_type = ? AND item_id = ?
        AND amount = ? AND currency = ? AND status IN ('creating', 'open')
      ORDER BY created_at DESC LIMIT 1`,
    [buyer.id, sellerId, itemType, itemId, moneyString(amountCents), currency],
  );

  if (existing?.status === 'open' && existing.checkout_url && existing.flutterwave_tx_ref) {
    return { checkoutUrl: existing.checkout_url, checkoutId: existing.id, amount: moneyString(amountCents), currency };
  }

  const checkoutId = existing?.id || crypto.randomUUID();
  const reference = `QC-${checkoutId.replace(/[^A-Za-z0-9-]/g, '').slice(0, 34)}`;
  if (!existing) {
    await db.insert(
      `INSERT INTO payment_checkouts
       (id, flutterwave_tx_ref, buyer_id, seller_id, item_type, item_id, amount, currency, platform_fee, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'creating')`,
      [checkoutId, reference, buyer.id, sellerId, itemType, itemId, moneyString(amountCents), currency, split.platformFee],
    );
  } else {
    await db.update(
      'UPDATE payment_checkouts SET flutterwave_tx_ref = ?, status = ?, platform_fee = ?, checkout_url = NULL WHERE id = ?',
      [reference, 'creating', split.platformFee, checkoutId],
    );
  }

  const checkoutUrl = `${publicAppUrl()}/api/payments/flutterwave/v4-checkout/${encodeURIComponent(checkoutId)}`;
  await db.update(
    'UPDATE payment_checkouts SET checkout_url = ?, status = ? WHERE id = ?',
    [checkoutUrl, 'open', checkoutId],
  );

  return {
    checkoutUrl,
    checkoutId,
    amount: moneyString(amountCents),
    currency,
    productName: String(productName || 'QuickChat payment').slice(0, 120),
    productDescription: String(productDescription || productName || 'QuickChat payment').slice(0, 500),
  };
}

async function createV4CardOrder({ checkoutId, encryptedCard }) {
  const checkout = await db.getOne('SELECT * FROM payment_checkouts WHERE id = ?', [checkoutId]);
  if (!checkout) {
    const error = new Error('Payment checkout not found.');
    error.status = 404;
    throw error;
  }
  if (!['creating', 'open'].includes(String(checkout.status))) {
    const error = new Error('This payment checkout is no longer available.');
    error.status = 409;
    throw error;
  }
  if (!encryptedCard || typeof encryptedCard !== 'object') {
    const error = new Error('Secure card payment details are required.');
    error.status = 400;
    throw error;
  }

  const buyer = await db.getOne('SELECT id, fullname, username, email FROM users WHERE id = ?', [checkout.buyer_id]);
  if (!buyer?.email) {
    const error = new Error('The buyer account could not be loaded.');
    error.status = 400;
    throw error;
  }

  const amount = Number(checkout.amount);
  const customerName = String(buyer.fullname || buyer.username || 'QuickChat member').trim();
  const nameParts = customerName.split(/\s+/).filter(Boolean);
  const customer = {
    email: buyer.email,
    name: {
      first: nameParts[0] || 'QuickChat',
      middle: nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '',
      last: nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'Member',
    },
  };

  const result = await flutterwaveRequest('POST', 'orchestration/direct-orders', {
    amount,
    currency: String(checkout.currency).toUpperCase(),
    reference: String(checkout.flutterwave_tx_ref),
    customer,
    payment_method: {
      type: 'card',
      card: {
        nonce: String(encryptedCard.nonce || ''),
        encrypted_card_number: String(encryptedCard.encrypted_card_number || ''),
        encrypted_expiry_month: String(encryptedCard.encrypted_expiry_month || ''),
        encrypted_expiry_year: String(encryptedCard.encrypted_expiry_year || ''),
        encrypted_cvv: String(encryptedCard.encrypted_cvv || ''),
      },
    },
    redirect_url: `${publicAppUrl()}/api/payments/flutterwave/callback`,
    meta: {
      quickchat_checkout_id: checkout.id,
      quickchat_kind: checkout.item_type,
      quickchat_item_id: String(checkout.item_id),
    },
  }, { idempotencyKey: `qc-order-${checkout.id}` });

  const order = result?.data || {};
  const providerId = String(order.id || '').trim();
  const nextAction = order.next_action?.redirect_url?.url || '';
  if (!providerId) {
    const error = new Error('Flutterwave v4 did not return an order ID.');
    error.status = 502;
    throw error;
  }

  await db.update(
    'UPDATE payment_checkouts SET flutterwave_tx_ref = ?, checkout_url = ?, status = ? WHERE id = ?',
    [String(order.reference || checkout.flutterwave_tx_ref), nextAction || checkout.checkout_url, 'open', checkout.id],
  );
  if (nextAction) {
    await db.update(
      'UPDATE payment_transactions SET flutterwave_transaction_id = ? WHERE checkout_id = ? AND status = ?',
      [providerId, checkout.id, 'pending'],
    ).catch(() => {});
  }
  return {
    orderId: providerId,
    status: String(order.status || 'pending'),
    nextAction: nextAction || null,
    redirectUrl: nextAction || null,
  };
}

async function createCreatorPayout({ recipientId, amount, reference, checkoutId }) {
  const cents = parseMoney(amount);
  if (!recipientId || !cents || cents < 100) return null;
  const result = await flutterwaveRequest('POST', 'transfers', {
    action: 'instant',
    reference: String(reference).slice(0, 42),
    narration: `QuickChat creator payout ${String(checkoutId || '').slice(0, 24)}`,
    meta: { quickchat_checkout_id: String(checkoutId || '') },
    payment_instruction: {
      source_currency: 'NGN',
      destination_currency: 'NGN',
      amount: { applies_to: 'destination_currency', value: Number(moneyString(cents)) },
      recipient_id: String(recipientId),
    },
  }, { idempotencyKey: `qc-payout-${String(checkoutId || reference)}` });
  return result?.data || null;
}

async function getFlutterwaveEncryptionKey() {
  if (!isFlutterwaveEncryptionKeyConfigured()) {
    const error = new Error('Set FLW_ENCRYPTION_KEY in server/.env to enable secure v4 card payments.');
    error.status = 503;
    throw error;
  }
  return String(process.env.FLW_ENCRYPTION_KEY).trim();
}

module.exports = {
  PLATFORM_FEE_PERCENT,
  createHostedCheckout,
  createV4CardOrder,
  createCreatorPayout,
  flutterwaveRequest,
  flutterwaveWebhookUrl,
  getAccountForUser,
  getFlutterwaveEncryptionKey,
  isFlutterwaveConfigured,
  isFlutterwavePaymentsConfigured,
  isFlutterwaveSecretConfigured,
  isFlutterwaveEncryptionKeyConfigured,
  isFlutterwaveWebhookSecretConfigured,
  isFlutterwaveWebhookUrlConfigured,
  isPublicAppUrlConfigured,
  moneyString,
  parseMoney,
  publicAppUrl,
  splitMoney,
  webhookSignature,
  safeEqual,
  isV4Production,
};
