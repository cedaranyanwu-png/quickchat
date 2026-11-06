const crypto = require('node:crypto');
const db = require('./database');

const PLATFORM_FEE_PERCENT = 10;
const FLUTTERWAVE_API = 'https://api.flutterwave.com/v3';
const WEBHOOK_PATH = '/api/webhooks/flutterwave';

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

function isFlutterwaveSecretConfigured() {
  return /^FLWSECK_(?:TEST|LIVE)-\S+$/i.test(String(process.env.FLW_SECRET_KEY || '').trim());
}

function isFlutterwaveWebhookSecretConfigured() {
  return Boolean(String(process.env.FLW_SECRET_HASH || '').trim());
}

function publicAppUrl() {
  const configured = String(process.env.PUBLIC_APP_URL || '').trim();
  let parsed;
  try { parsed = new URL(configured); } catch (_error) { parsed = null; }
  const isLocal = process.env.APP_ENV === 'local' || process.env.NODE_ENV !== 'production';
  if (isLocal && parsed && /^https?:$/i.test(parsed.protocol)) {
    return parsed.origin;
  }
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
  if (isLocal && parsed && /^https?:$/i.test(parsed.protocol)) {
    return parsed.href;
  }
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
  return isFlutterwaveSecretConfigured() && isFlutterwaveWebhookSecretConfigured() &&
    isFlutterwaveWebhookUrlConfigured() && isPublicAppUrlConfigured();
}

async function flutterwaveRequest(method, resource, body) {
  if (!isFlutterwaveSecretConfigured()) {
    const error = new Error('Set FLW_SECRET_KEY in server/.env to enable Flutterwave payments.');
    error.status = 503;
    throw error;
  }

  let response;
  try {
    response = await fetch(`${FLUTTERWAVE_API}/${String(resource).replace(/^\/+/, '')}`, {
      method,
      headers: {
        Authorization: `Bearer ${String(process.env.FLW_SECRET_KEY).trim()}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
  } catch (_error) {
    const error = new Error('Flutterwave could not be reached. Please try again shortly.');
    error.status = 502;
    error.outcomeUnknown = method !== 'GET';
    throw error;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || String(payload?.status || '').toLowerCase() === 'error') {
    const error = new Error(payload?.message || payload?.error?.message || 'Flutterwave rejected the request.');
    error.status = response.status >= 400 && response.status < 500 ? response.status : 502;
    error.providerCode = payload?.code || payload?.error?.code || null;
    error.providerRequestId = response.headers.get('x-request-id') || null;
    error.outcomeUnknown = response.status >= 500;
    throw error;
  }
  return payload;
}

async function getAccountForUser(userId) {
  const account = await db.getOne(
    `SELECT flw_id, flw_subaccount_id, payout_country, bank_code, bank_name,
            account_name, account_masked, status
       FROM flutterwave_creator_accounts WHERE user_id = ?`,
    [userId],
  );
  return account ? { ...account, ready: account.status === 'active' } : null;
}

async function createHostedCheckout({ buyer, sellerId, itemType, itemId, amount, currency = 'NGN', productName, productDescription }) {
  const amountCents = parseMoney(amount);
  if (!amountCents || String(currency).toUpperCase() !== 'NGN') {
    const error = new Error('Flutterwave creator checkouts currently require a valid NGN amount.');
    error.status = 400;
    throw error;
  }
  if (!isFlutterwaveWebhookSecretConfigured()) {
    const error = new Error('Set FLW_SECRET_HASH in server/.env and Flutterwave before accepting payments.');
    error.status = 503;
    throw error;
  }
  flutterwaveWebhookUrl();
  const account = await getAccountForUser(sellerId);
  if (!account?.ready || !account.flw_subaccount_id) {
    const error = new Error('The creator must add and confirm a Nigerian bank account in Settings before this can be purchased.');
    error.status = 409;
    throw error;
  }

  const split = splitMoney(amountCents);
  const existing = await db.getOne(
    `SELECT id, flutterwave_tx_ref, checkout_url, status FROM payment_checkouts
      WHERE buyer_id = ? AND seller_id = ? AND item_type = ? AND item_id = ?
        AND amount = ? AND currency = ? AND status IN ('creating', 'open')
      ORDER BY created_at DESC LIMIT 1`,
    [buyer.id, sellerId, itemType, itemId, moneyString(amountCents), currency],
  );
  if (existing?.status === 'open' && existing.checkout_url && existing.flutterwave_tx_ref) {
    return { checkoutUrl: existing.checkout_url, checkoutId: existing.id };
  }
  if (existing?.status === 'creating' && existing.flutterwave_tx_ref) {
    const error = new Error('This checkout is still being created. Please wait a moment before trying again.');
    error.status = 409;
    throw error;
  }

  const checkoutId = existing?.id || crypto.randomUUID();
  const txRef = `qc_${checkoutId}`;
  if (!existing) {
    await db.insert(
      `INSERT INTO payment_checkouts
       (id, flutterwave_tx_ref, buyer_id, seller_id, item_type, item_id, amount, currency, platform_fee, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'creating')`,
      [checkoutId, txRef, buyer.id, sellerId, itemType, itemId, moneyString(amountCents), currency, split.platformFee],
    );
  } else {
    await db.update(
      'UPDATE payment_checkouts SET flutterwave_tx_ref = ?, status = ?, platform_fee = ? WHERE id = ?',
      [txRef, 'creating', split.platformFee, checkoutId],
    );
  }

  try {
    const origin = publicAppUrl();
    const checkout = await flutterwaveRequest('POST', 'payments', {
      tx_ref: txRef,
      amount: moneyString(amountCents),
      currency,
      redirect_url: `${origin}/api/payments/flutterwave/callback`,
      customer: {
        email: buyer.email,
        name: buyer.fullname || buyer.name || 'QuickChat member',
      },
      customizations: {
        title: 'QuickChat',
        description: String(productDescription || productName || 'QuickChat payment').slice(0, 120),
      },
      meta: { quickchat_checkout_id: checkoutId, quickchat_kind: itemType, quickchat_item_id: String(itemId) },
      subaccounts: [{
        id: account.flw_subaccount_id,
        transaction_charge_type: 'percentage',
        transaction_charge: PLATFORM_FEE_PERCENT / 100,
      }],
    });
    const checkoutUrl = checkout?.data?.link;
    if (!checkoutUrl) {
      const error = new Error('Flutterwave returned no hosted checkout URL. Please retry shortly.');
      error.status = 502;
      error.outcomeUnknown = true;
      throw error;
    }
    await db.update(
      `UPDATE payment_checkouts SET flutterwave_tx_ref = ?, checkout_url = ?, status = 'open' WHERE id = ?`,
      [txRef, checkoutUrl, checkoutId],
    );
    return { checkoutUrl, checkoutId };
  } catch (error) {
    if (!error.outcomeUnknown) await db.update('UPDATE payment_checkouts SET status = ? WHERE id = ?', ['failed', checkoutId]);
    throw error;
  }
}

module.exports = {
  PLATFORM_FEE_PERCENT,
  createHostedCheckout,
  flutterwaveRequest,
  flutterwaveWebhookUrl,
  getAccountForUser,
  isFlutterwaveSecretConfigured,
  isFlutterwavePaymentsConfigured,
  isFlutterwaveWebhookSecretConfigured,
  isFlutterwaveWebhookUrlConfigured,
  isPublicAppUrlConfigured,
  moneyString,
  parseMoney,
  publicAppUrl,
  splitMoney,
};
