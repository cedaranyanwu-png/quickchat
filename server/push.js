const db = require('./database');

let webpush = null;
let publicKey = '';
let ready = false;
let initPromise = null;

const ICON = '/favicon/android-chrome-192x192.png';
const BADGE = '/favicon/favicon-32x32.png';

function vapidSubject() {
  const configured = String(process.env.VAPID_SUBJECT || '').trim();
  if (configured) return configured;
  const appUrl = String(process.env.PUBLIC_APP_URL || '').trim();
  if (/^https?:\/\//i.test(appUrl)) return appUrl.replace(/\/$/, '');
  return 'mailto:hello@quickchat.app';
}

async function readSetting(key) {
  const row = await db.getOne('SELECT setting_value FROM app_settings WHERE setting_key = ?', [key]);
  return row?.setting_value ? String(row.setting_value) : '';
}

async function writeSetting(key, value) {
  try {
    await db.insert(
      'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)',
      [key, value],
    );
  } catch (_error) {
    await db.update(
      'UPDATE app_settings SET setting_value = ? WHERE setting_key = ?',
      [value, key],
    );
  }
}

// VAPID keys are read from the environment first. When they are absent, a pair
// is generated once and persisted so browser subscriptions survive restarts.
async function resolveKeys() {
  let pub = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  let priv = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  if (pub && priv) return { pub, priv, generated: false };

  pub = await readSetting('vapid_public_key');
  priv = await readSetting('vapid_private_key');
  if (pub && priv) return { pub, priv, generated: false };

  try {
    webpush ||= require('web-push');
    const generated = webpush.generateVAPIDKeys();
    await writeSetting('vapid_public_key', generated.publicKey);
    await writeSetting('vapid_private_key', generated.privateKey);
    console.log('[Push] Generated a new VAPID key pair and saved it in app_settings.');
    return { pub: generated.publicKey, priv: generated.privateKey, generated: true };
  } catch (error) {
    console.error('[Push] Could not generate VAPID keys:', error.message);
    return { pub: '', priv: '', generated: false };
  }
}

function initializePush() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      webpush = require('web-push');
    } catch (error) {
      console.warn('[Push] web-push is not installed; browser push notifications are disabled.', error.message);
      ready = false;
      return;
    }
    const keys = await resolveKeys();
    if (!keys.pub || !keys.priv) {
      ready = false;
      return;
    }
    try {
      webpush.setVapidDetails(vapidSubject(), keys.pub, keys.priv);
      publicKey = keys.pub;
      ready = true;
      console.log('[Push] Web push is ready.');
    } catch (error) {
      ready = false;
      console.error('[Push] Invalid VAPID configuration:', error.message);
    }
  })();
  return initPromise;
}

function isPushReady() {
  return ready;
}

function getPublicKey() {
  return publicKey;
}

function normalizeSubscription(subscription) {
  const endpoint = String(subscription?.endpoint || '').trim();
  const p256dh = String(subscription?.keys?.p256dh || subscription?.p256dh || '').trim();
  const auth = String(subscription?.keys?.auth || subscription?.auth || '').trim();
  if (!/^https:\/\//i.test(endpoint) || endpoint.length > 500 || !p256dh || !auth) return null;
  if (p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint, p256dh, auth };
}

async function saveSubscription(userId, subscription, userAgent = '') {
  const normalized = normalizeSubscription(subscription);
  if (!normalized) {
    const error = new Error('This browser did not return a valid push subscription.');
    error.status = 400;
    throw error;
  }
  const existing = await db.getOne('SELECT id FROM push_subscriptions WHERE endpoint = ?', [normalized.endpoint]);
  if (existing) {
    await db.update(
      `UPDATE push_subscriptions SET user_id = ?, p256dh = ?, auth = ?, user_agent = ?,
       last_used_at = ? WHERE endpoint = ?`,
      [userId, normalized.p256dh, normalized.auth, String(userAgent || '').slice(0, 255), Date.now(), normalized.endpoint],
    );
    return;
  }
  try {
    await db.insert(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, normalized.endpoint, normalized.p256dh, normalized.auth, String(userAgent || '').slice(0, 255), Date.now()],
    );
  } catch (error) {
    // A parallel request can insert the same endpoint first; the update keeps it current.
    const duplicate = await db.getOne('SELECT id FROM push_subscriptions WHERE endpoint = ?', [normalized.endpoint]);
    if (!duplicate) throw error;
    await db.update(
      'UPDATE push_subscriptions SET user_id = ?, p256dh = ?, auth = ?, user_agent = ? WHERE endpoint = ?',
      [userId, normalized.p256dh, normalized.auth, String(userAgent || '').slice(0, 255), normalized.endpoint],
    );
  }
}

async function removeSubscription(userId, endpoint) {
  const trimmed = String(endpoint || '').trim();
  if (!trimmed) return;
  await db.delete('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', [userId, trimmed]);
}

async function subscriptionCount(userId) {
  return db.getCount('SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id = ?', [userId]);
}

async function sendPushToUser(userId, payload = {}) {
  if (!ready) return { sent: 0, skipped: true };
  const subscriptions = await db.query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
    [userId],
  );
  if (!subscriptions.length) return { sent: 0, skipped: false };

  const body = JSON.stringify({
    title: String(payload.title || 'QuickChat').slice(0, 120),
    body: String(payload.body || '').slice(0, 240),
    url: String(payload.url || '/home').slice(0, 300),
    tag: String(payload.tag || `quickchat-${Date.now()}`).slice(0, 120),
    icon: payload.icon || ICON,
    badge: payload.badge || BADGE,
    type: String(payload.type || 'activity').slice(0, 40),
  });

  let sent = 0;
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        body,
        { TTL: 60 * 60 * 24, urgency: 'high', topic: String(payload.type || 'quickchat') },
      );
      sent += 1;
      await db.update('UPDATE push_subscriptions SET last_used_at = ? WHERE id = ?', [Date.now(), subscription.id]);
    } catch (error) {
      // 404/410 mean the browser dropped the subscription; prune it.
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await db.delete('DELETE FROM push_subscriptions WHERE id = ?', [subscription.id]);
        return;
      }
      console.warn('[Push] Delivery failed:', error?.statusCode || '', error?.message || error);
    }
  }));
  return { sent, skipped: false };
}

// Push delivery is a side effect: a failure must never fail the request that
// produced the notification.
function pushQuietly(userId, payload) {
  sendPushToUser(userId, payload).catch((error) => {
    console.warn('[Push] Could not send a notification:', error.message);
  });
}

module.exports = {
  getPublicKey,
  initializePush,
  isPushReady,
  pushQuietly,
  removeSubscription,
  saveSubscription,
  sendPushToUser,
  subscriptionCount,
};
