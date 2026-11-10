const crypto = require('node:crypto');
const db = require('./database');
const {
  isFlutterwaveSecretConfigured, isFlutterwaveEncryptionKeyConfigured, isFlutterwaveWebhookSecretConfigured,
  isPublicAppUrlConfigured, publicAppUrl,
} = require('./flutterwave');
const { packFor } = require('./gifts');

// Points are sold by the platform itself (no creator subaccount), so they use
// their own checkout table and a `qcpts_` transaction reference that the shared
// Flutterwave callback/webhook recognises.
function topUpAvailable() {
  return isFlutterwaveSecretConfigured() && isFlutterwaveWebhookSecretConfigured() && isPublicAppUrlConfigured();
}

function topUpMissingConfig() {
  return [
    ...(!isFlutterwaveSecretConfigured() ? ['FLW_SECRET_KEY'] : []),
    ...(!isFlutterwaveWebhookSecretConfigured() ? ['FLW_SECRET_HASH'] : []),
    ...(!isPublicAppUrlConfigured() ? ['PUBLIC_APP_URL'] : []),
  ];
}

async function createPointsCheckout({ user, packKey }) {
  const pack = packFor(packKey);
  if (!pack) {
    const error = new Error('Choose a valid points pack.');
    error.status = 400;
    throw error;
  }
  if (!isFlutterwaveSecretConfigured() || !isFlutterwaveEncryptionKeyConfigured() || !isFlutterwaveWebhookSecretConfigured()) {
    const error = new Error('Points top-ups need the Flutterwave v4 credentials, encryption key and webhook secret before they can be purchased.');
    error.status = 503;
    throw error;
  }

  const origin = publicAppUrl();
  const purchaseId = crypto.randomUUID();
  const txRef = `QCPTS-${purchaseId.replace(/[^A-Za-z0-9-]/g, '').slice(0, 34)}`;
  await db.insert(
    `INSERT INTO point_purchases (id, user_id, pack_key, points, amount, currency, flw_tx_ref, status)
     VALUES (?, ?, ?, ?, ?, 'NGN', ?, 'creating')`,
    [purchaseId, user.id, pack.key, pack.points, pack.amount, txRef],
  );

  try {
    await db.insert(
      `INSERT INTO payment_checkouts
       (id, flutterwave_tx_ref, buyer_id, seller_id, item_type, item_id, amount, currency, platform_fee, status)
       VALUES (?, ?, ?, ?, 'points', 0, ?, 'NGN', '0.00', 'open')`,
      [purchaseId, txRef, user.id, user.id, pack.amount],
    );
    const checkoutUrl = `${origin}/api/payments/flutterwave/v4-checkout/${encodeURIComponent(purchaseId)}`;
    return { checkoutUrl, purchaseId, points: pack.points, amount: pack.amount };
  } catch (error) {
    await db.update('UPDATE point_purchases SET status = ? WHERE id = ?', ['failed', purchaseId]).catch(() => {});
    await db.delete('DELETE FROM payment_checkouts WHERE id = ?', [purchaseId]).catch(() => {});
    throw error;
  }
}


module.exports = { createPointsCheckout, topUpAvailable, topUpMissingConfig };
