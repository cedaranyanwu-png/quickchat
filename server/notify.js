const db = require('./database');
const { pushQuietly } = require('./push');

// Every in-app notification is written here so the matching browser push is
// sent from one place. The insert is the source of truth: if it fails the
// caller sees the error, while push delivery stays best-effort.
async function notifyUser({
  userId,
  actorId = null,
  type = 'system',
  postId = null,
  liveSessionId = null,
  text = '',
  push = null,
}) {
  if (userId === null || userId === undefined) return null;
  if (actorId !== null && actorId !== undefined && Number(actorId) === Number(userId)) return null;

  const notification = await db.insert(
    `INSERT INTO notifications (user_id, actor_id, type, post_id, live_session_id, text)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, actorId ?? null, type, postId ?? null, liveSessionId ?? null, String(text).slice(0, 255)],
  );

  const actor = actorId ? await db.getOne('SELECT fullname, username FROM users WHERE id = ?', [actorId]) : null;
  const actorName = actor?.fullname || 'QuickChat';
  const actorHandle = actor?.username ? String(actor.username).replace(/^@/, '') : '';

  let url = '/notifications';
  if (type === 'message' && actorId) url = `/messages?userId=${encodeURIComponent(actorId)}`;
  else if (type === 'follow' && actorHandle) url = `/profile/${encodeURIComponent(actorHandle)}`;
  else if (liveSessionId) url = `/live/${encodeURIComponent(liveSessionId)}`;
  else if (postId) url = '/home';

  pushQuietly(userId, {
    title: push?.title || (type === 'message' ? `New message from ${actorName}` : `QuickChat · ${actorName}`),
    body: push?.body || `${actorName} ${text}`,
    url: push?.url || url,
    tag: push?.tag || `${type}-${liveSessionId || postId || notification?.id || Date.now()}`,
    type,
  });

  return notification;
}

// Used when many recipients get the same notification and a push per row would
// be noisy (for example a post matched a thousand interest feeds).
async function notifyMany({ userIds, actorId, type, postId, text }) {
  const unique = [...new Set((userIds || []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
    .filter((userId) => Number(userId) !== Number(actorId));
  if (!unique.length) return 0;

  const actor = actorId
    ? await db.getOne('SELECT fullname, username FROM users WHERE id = ?', [actorId])
    : null;
  const actorName = actor?.fullname || 'QuickChat';
  const actorHandle = actor?.username ? String(actor.username).replace(/^@/, '') : '';
  const message = String(text || '').slice(0, 255);
  const url = type === 'follow' && actorHandle
    ? `/profile/${encodeURIComponent(actorHandle)}`
    : postId ? '/home' : '/notifications';

  // Keep the in-app record as the source of truth, and trigger the same
  // browser-push path used by single-recipient notifications.
  for (const userId of unique) {
    await db.insert(
      'INSERT INTO notifications (user_id, actor_id, type, post_id, text) VALUES (?, ?, ?, ?, ?)',
      [userId, actorId ?? null, type || 'system', postId ?? null, message],
    );
    pushQuietly(userId, {
      title: type === 'message' ? `New message from ${actorName}` : `QuickChat · ${actorName}`,
      body: `${actorName} ${message}`,
      url,
      tag: `${type || 'activity'}-${postId || Date.now()}-${userId}`,
      type: type || 'activity',
    });
  }
  return unique.length;
}

module.exports = { notifyMany, notifyUser };
