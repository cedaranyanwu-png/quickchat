const crypto = require('node:crypto');
const db = require('./database');
const { flutterwaveRequest, moneyString, parseMoney, splitMoney, webhookSignature, safeEqual, getAccountForUser, createCreatorPayout } = require('./flutterwave');
const { creditPoints } = require('./wallet');

async function verifyPointsPurchase(verifiedRef, payment) {
  const purchase = await db.getOne('SELECT * FROM point_purchases WHERE flw_tx_ref = ?', [verifiedRef]);
  if (!purchase) return false;

  const currency = String(payment.currency || '').toUpperCase();
  if (currency !== String(purchase.currency || 'NGN').toUpperCase()) {
    const error = new Error('Flutterwave transaction currency did not match the points purchase.');
    error.status = 400;
    throw error;
  }
  const chargedCents = parseMoney(payment.amount);
  const expectedCents = parseMoney(purchase.amount);
  if (!chargedCents || chargedCents !== expectedCents) {
    const error = new Error('Flutterwave transaction amount did not match the points purchase.');
    error.status = 400;
    throw error;
  }

  if (String(purchase.status) !== 'paid') {
    const credited = await creditPoints(purchase.user_id, purchase.points, {
      kind: 'purchase',
      reference: `purchase_${verifiedRef}`,
    });
    if (!credited.ok && credited.reason !== 'duplicate') {
      const error = new Error('The points wallet could not be credited for this purchase.');
      error.status = 500;
      throw error;
    }
    await db.update('UPDATE point_purchases SET status = ? WHERE id = ?', ['paid', purchase.id]);
  }
  return true;
}

async function handleFlutterwaveWebhook(event, headers = {}, rawBody = null) {
  const secret = String(process.env.FLW_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    const error = new Error('Flutterwave v4 webhook secret is not configured.');
    error.status = 503;
    throw error;
  }

  const suppliedSignature = String(headers['flutterwave-signature'] || '').trim();
  if (!rawBody || !suppliedSignature || !safeEqual(
    suppliedSignature,
    webhookSignature(rawBody, secret),
  )) {
    const error = new Error('Invalid Flutterwave v4 webhook signature.');
    error.status = 401;
    throw error;
  }

  const eventType = String(event?.type || '').toLowerCase();
  if (!['charge.completed', 'charge.failed'].includes(eventType)) return;

  const data = event?.data || {};
  const chargeId = String(data.id || '').trim();
  const reference = String(data.reference || '').trim();
  if (!chargeId || !reference) {
    const error = new Error('Flutterwave v4 webhook is missing its charge ID or payment reference.');
    error.status = 400;
    throw error;
  }

  const rawEventId = String(event?.webhook_id || event?.id || `flw4_${chargeId}_${eventType}`);
  const eventId = rawEventId.length <= 100
    ? rawEventId
    : `flw4_${crypto.createHash('sha256').update(rawEventId).digest('hex')}`;
  const prior = await db.getOne('SELECT processed FROM payment_webhook_events WHERE event_id = ?', [eventId]);
  if (Number(prior?.processed) === 1) return;
  if (prior) {
    const error = new Error('This Flutterwave webhook event is already being processed.');
    error.status = 503;
    throw error;
  }

  try {
    await db.insert('INSERT INTO payment_webhook_events (event_id, processed) VALUES (?, 0)', [eventId]);
  } catch (_error) {
    const duplicate = await db.getOne('SELECT processed FROM payment_webhook_events WHERE event_id = ?', [eventId]);
    if (Number(duplicate?.processed) === 1) return;
    const retry = new Error('This Flutterwave webhook event is already being processed.');
    retry.status = 503;
    throw retry;
  }

  try {
    if (eventType === 'charge.completed') {
      await verifyAndProcessPayment({ chargeId, txRef: reference });
    }
    await db.update('UPDATE payment_webhook_events SET processed = 1 WHERE event_id = ?', [eventId]);
  } catch (error) {
    await db.delete('DELETE FROM payment_webhook_events WHERE event_id = ? AND processed = 0', [eventId]);
    throw error;
  }
}

async function verifyAndProcessPayment({ chargeId, txRef }) {
  let verified;
  if (chargeId && String(chargeId).startsWith('chg_')) {
    verified = await flutterwaveRequest('GET', `charges/${encodeURIComponent(chargeId)}`);
  } else {
    return false;
  }

  const payment = verified?.data || {};
  if (!['succeeded', 'completed'].includes(String(payment.status || '').toLowerCase())) return false;

  const verifiedId = String(payment.id || '').trim();
  const verifiedRef = String(payment.reference || '').trim();
  if (!verifiedId || !verifiedId.startsWith('chg_')) {
    const error = new Error('Flutterwave v4 verification did not return a valid charge ID.');
    error.status = 502;
    throw error;
  }
  if (!verifiedRef || (txRef && verifiedRef !== String(txRef))) {
    const error = new Error('Flutterwave v4 payment reference did not match the QuickChat checkout.');
    error.status = 400;
    throw error;
  }
  if (chargeId && verifiedId !== String(chargeId)) {
    const error = new Error('Flutterwave v4 charge ID did not match the payment event.');
    error.status = 400;
    throw error;
  }

  const checkout = await db.getOne('SELECT * FROM payment_checkouts WHERE flutterwave_tx_ref = ?', [verifiedRef]);
  if (!checkout) {
    return verifyPointsPurchase(verifiedRef, payment);
  }
  if (checkout.item_type === 'points') return verifyPointsPurchase(verifiedRef, payment);
  if (!['post', 'creator', 'community'].includes(checkout.item_type)) return false;

  const currency = String(payment.currency || '').toUpperCase();
  if (currency !== String(checkout.currency || '').toUpperCase()) {
    const error = new Error('Flutterwave v4 transaction currency did not match the stored checkout.');
    error.status = 400;
    throw error;
  }
  const chargedCents = parseMoney(payment.amount);
  const expectedCents = parseMoney(checkout.amount);
  if (!chargedCents || chargedCents !== expectedCents) {
    const error = new Error('Flutterwave v4 transaction amount did not match the stored checkout.');
    error.status = 400;
    throw error;
  }

  const feeCents = parseMoney(checkout.platform_fee);
  const expectedFeeCents = splitMoney(chargedCents).platformFee;
  if (!feeCents || feeCents !== parseMoney(expectedFeeCents)) {
    const error = new Error('Stored platform fee did not match the configured 10% fee.');
    error.status = 500;
    throw error;
  }

  await recordPayment(checkout, verifiedId, chargedCents, feeCents, currency);
  if (checkout.item_type !== 'points') {
    const transaction = await db.getOne('SELECT id, flutterwave_transfer_id FROM payment_transactions WHERE checkout_id = ?', [checkout.id]);
    const account = await getAccountForUser(checkout.seller_id);
    if (transaction && !transaction.flutterwave_transfer_id && account?.flw_recipient_id) {
      try {
        const payout = await createCreatorPayout({
          recipientId: account.flw_recipient_id,
          amount: moneyString(chargedCents - feeCents),
          reference: `QCPAYOUT-${String(checkout.id).replace(/[^A-Za-z0-9-]/g, '').slice(0, 28)}`,
          checkoutId: checkout.id,
        });
        if (payout?.id) await db.update('UPDATE payment_transactions SET flutterwave_transfer_id = ? WHERE id = ?', [String(payout.id), transaction.id]);
      } catch (payoutError) {
        console.error('[Flutterwave v4] Creator payout could not be initiated:', payoutError.message);
      }
    }
  }
  if (checkout.item_type === 'post') await unlockPost(checkout);
  else await activateThirtyDayPass(checkout);
  await db.update('UPDATE payment_checkouts SET status = ? WHERE id = ?', ['paid', checkout.id]);
  return true;
}

async function recordPayment(checkout, transactionId, grossCents, feeCents, currency) {
  const existing = await db.getOne('SELECT id, flutterwave_transaction_id FROM payment_transactions WHERE checkout_id = ?', [checkout.id]);
  if (existing) {
    if (existing.flutterwave_transaction_id && String(existing.flutterwave_transaction_id) !== transactionId) {
      const error = new Error('A different Flutterwave transaction is already recorded for this checkout.');
      error.status = 409;
      throw error;
    }
    if (!existing.flutterwave_transaction_id) {
      await db.update(
        'UPDATE payment_transactions SET flutterwave_transaction_id = ?, status = ? WHERE id = ?',
        [transactionId, 'paid', existing.id],
      );
    }
    return;
  }

  const creatorShare = grossCents - feeCents;
  try {
    await db.insert(
      `INSERT INTO payment_transactions
       (checkout_id, invoice_id, seller_id, gross_amount, platform_fee, transfer_amount, currency,
        flutterwave_transaction_id, status)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'paid')`,
      [checkout.id, checkout.seller_id, amountString(grossCents), amountString(feeCents),
        amountString(creatorShare), currency, transactionId],
    );
  } catch (error) {
    if (!isUniqueConstraint(error)) throw error;
    const duplicate = await db.getOne('SELECT id, flutterwave_transaction_id FROM payment_transactions WHERE checkout_id = ?', [checkout.id]);
    if (!duplicate || String(duplicate.flutterwave_transaction_id || '') !== transactionId) throw error;
  }
}

async function unlockPost(checkout) {
  try {
    await db.query(
      'INSERT INTO content_purchases (post_id, user_id, checkout_id) VALUES (?, ?, ?)',
      [checkout.item_id, checkout.buyer_id, checkout.id],
    );
  } catch (error) {
    if (!isUniqueConstraint(error)) throw error;
    const existing = await db.getOne(
      'SELECT checkout_id FROM content_purchases WHERE post_id = ? AND user_id = ?',
      [checkout.item_id, checkout.buyer_id],
    );
    if (!existing) throw error;
  }
}

async function activateThirtyDayPass(checkout) {
  let grant = await db.getOne('SELECT * FROM content_pass_purchases WHERE checkout_id = ?', [checkout.id]);
  if (!grant) {
    const current = await db.getOne(
      `SELECT current_period_end FROM content_subscriptions
        WHERE entity_type = ? AND entity_id = ? AND subscriber_id = ?`,
      [checkout.item_type, checkout.item_id, checkout.buyer_id],
    );
    const currentEnd = current?.current_period_end ? new Date(current.current_period_end).getTime() : 0;
    const baseTime = Number.isFinite(currentEnd) && currentEnd > Date.now() ? currentEnd : Date.now();
    const expiresAt = new Date(baseTime + 30 * 24 * 60 * 60 * 1000).toISOString();
    try {
      await db.query(
        `INSERT INTO content_pass_purchases (checkout_id, entity_type, entity_id, user_id, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        [checkout.id, checkout.item_type, checkout.item_id, checkout.buyer_id, expiresAt],
      );
      grant = await db.getOne('SELECT * FROM content_pass_purchases WHERE checkout_id = ?', [checkout.id]);
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
      grant = await db.getOne('SELECT * FROM content_pass_purchases WHERE checkout_id = ?', [checkout.id]);
      if (!grant) throw error;
    }
  }

  const existing = await db.getOne(
    `SELECT id FROM content_subscriptions
      WHERE entity_type = ? AND entity_id = ? AND subscriber_id = ?`,
    [checkout.item_type, checkout.item_id, checkout.buyer_id],
  );
  if (existing) {
    await db.update(
      `UPDATE content_subscriptions SET status = 'active', current_period_end = ?,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [grant.expires_at, existing.id],
    );
  } else {
    try {
      await db.insert(
        `INSERT INTO content_subscriptions
         (entity_type, entity_id, subscriber_id, status, current_period_end)
         VALUES (?, ?, ?, 'active', ?)`,
        [checkout.item_type, checkout.item_id, checkout.buyer_id, grant.expires_at],
      );
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
      await db.update(
        `UPDATE content_subscriptions SET status = 'active', current_period_end = ?, updated_at = CURRENT_TIMESTAMP
         WHERE entity_type = ? AND entity_id = ? AND subscriber_id = ?`,
        [grant.expires_at, checkout.item_type, checkout.item_id, checkout.buyer_id],
      );
    }
  }

  if (checkout.item_type === 'community') {
    try {
      await db.query('INSERT INTO community_members (community_id, user_id) VALUES (?, ?)', [checkout.item_id, checkout.buyer_id]);
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
      const existingMember = await db.getOne(
        'SELECT user_id FROM community_members WHERE community_id = ? AND user_id = ?',
        [checkout.item_id, checkout.buyer_id],
      );
      if (!existingMember) throw error;
    }
  }
}


function amountString(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function isUniqueConstraint(error) {
  return ['23505', 'SQLITE_CONSTRAINT', 'ER_DUP_ENTRY'].includes(error?.code) ||
    String(error?.message || '').toLowerCase().includes('unique constraint') ||
    String(error?.message || '').toLowerCase().includes('duplicate key');
}

module.exports = { handleFlutterwaveWebhook, verifyAndProcessPayment };
