const crypto = require('node:crypto');
const db = require('./database');
const {
  flutterwaveRequest, isFlutterwaveSecretConfigured, isFlutterwaveWebhookSecretConfigured,
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
  if (!isFlutterwaveSecretConfigured() || !isFlutterwaveWebhookSecretConfigured()) {
    const error = new Error('Points top-ups need Flutterwave keys in server/.env before they can be purchased.');
    error.status = 503;
    throw error;
  }
  const origin = publicAppUrl();
  const purchaseId = crypto.randomUUID();
  const txRef = `qcpts_${purchaseId}`;
  await db.insert(
    `INSERT INTO point_purchases (id, user_id, pack_key, points, amount, currency, flw_tx_ref, status)
     VALUES (?, ?, ?, ?, ?, 'NGN', ?, 'creating')`,
    [purchaseId, user.id, pack.key, pack.points, pack.amount, txRef],
  );

  try {
    const checkout = await flutterwaveRequest('POST', 'payments', {
      tx_ref: txRef,
      amount: pack.amount,
      currency: 'NGN',
      redirect_url: `${origin}/api/payments/flutterwave/callback`,
      customer: {
        email: user.email,
        name: user.fullname || user.username || 'QuickChat member',
      },
      customizations: {
        title: 'QuickChat points',
        description: `${pack.points.toLocaleString('en-NG')} live gift points`,
      },
      meta: {
        quickchat_kind: 'points',
        quickchat_purchase_id: purchaseId,
        quickchat_points: String(pack.points),
      },
    });
    const checkoutUrl = checkout?.data?.link;
    if (!checkoutUrl) {
      const error = new Error('Flutterwave did not return a checkout link. Please try again.');
      error.status = 502;
      throw error;
    }
    await db.update(
      'UPDATE point_purchases SET checkout_url = ?, status = ? WHERE id = ?',
      [checkoutUrl, 'open', purchaseId],
    );
    return { checkoutUrl, purchaseId, points: pack.points, amount: pack.amount };
  } catch (error) {
    if (!error.outcomeUnknown) {
      await db.update('UPDATE point_purchases SET status = ? WHERE id = ?', ['failed', purchaseId]);
    } else {
      await db.update('UPDATE point_purchases SET status = ? WHERE id = ?', ['open', purchaseId]);
    }
    throw error;
  }
}

module.exports = { createPointsCheckout, topUpAvailable, topUpMissingConfig };
