const crypto = require('node:crypto');
const express = require('express');
const { db, asyncRoute, clampLimit, notFound, uniqueConstraint } = require('./utils');
const { notifyUser } = require('../notify');

const router = express.Router();
const PRESENCE_TTL_MS = 45_000;
const TYPING_TTL_MS = 5_000;
const onlineSessions = new Map();
const typingSignals = new Map();

router.post('/messages/presence', asyncRoute(async (req, res) => {
  const sessionId = validSessionId(req.body?.sessionId);
  if (!sessionId) return res.status(400).json({ message: 'A valid presence session is required.' });
  const now = Date.now();
  purgeExpiredPresence(now);
  const userId = String(req.user.id);
  let sessions = onlineSessions.get(userId);
  if (!sessions) {
    sessions = new Map();
    onlineSessions.set(userId, sessions);
  }
  sessions.set(sessionId, now);
  res.json({ online: true, expiresInMs: PRESENCE_TTL_MS });
}));

router.delete('/messages/presence', asyncRoute(async (req, res) => {
  const sessionId = validSessionId(req.body?.sessionId);
  if (!sessionId) return res.status(400).json({ message: 'A valid presence session is required.' });
  const userId = String(req.user.id);
  const sessions = onlineSessions.get(userId);
  sessions?.delete(sessionId);
  if (sessions?.size === 0) onlineSessions.delete(userId);
  res.json({ online: isUserOnline(req.user.id) });
}));

router.get('/messages/contacts', asyncRoute(async (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 100);
  const searchFilter = query ? 'AND (LOWER(u.fullname) LIKE LOWER(?) OR LOWER(u.username) LIKE LOWER(?))' : '';
  const limit = clampLimit(req.query.limit, 100, 200);
  const offset = Math.max(0, Math.min(100000, Number.parseInt(req.query.offset, 10) || 0));
  const rows = await db.query(
    `SELECT u.id, u.fullname, u.username, u.avatar_url, u.picture, u.is_synthetic,
            u.automation_status, u.typing_until, u.typing_conversation_id,
            EXISTS(SELECT 1 FROM follows outgoing WHERE outgoing.follower_id = ? AND outgoing.followed_id = u.id) AS following,
            EXISTS(SELECT 1 FROM follows incoming WHERE incoming.follower_id = u.id AND incoming.followed_id = ?) AS follower
       FROM users u
      WHERE u.id <> ? ${searchFilter}
        AND (EXISTS(SELECT 1 FROM follows outgoing WHERE outgoing.follower_id = ? AND outgoing.followed_id = u.id)
          OR EXISTS(SELECT 1 FROM follows incoming WHERE incoming.follower_id = u.id AND incoming.followed_id = ?))
      ORDER BY LOWER(u.fullname), u.id LIMIT ? OFFSET ?`,
    // The first two placeholders belong to relationship labels; then the optional name search and account filters.
    query
      ? [req.user.id, req.user.id, req.user.id, `%${query}%`, `%${query}%`, req.user.id, req.user.id, limit + 1, offset]
      : [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, limit + 1, offset],
  );
  const hasMore = rows.length > limit;
  const contacts = rows.slice(0, limit).map((user) => ({
    id: user.id,
    name: user.fullname || '',
    username: user.username || '',
    handle: user.username?.startsWith('@') ? user.username : `@${user.username || ''}`,
    picture: user.avatar_url || user.picture || null,
    isAutomated: Boolean(Number(user.is_synthetic || 0)),
    online: isAccountOnline(user),
    following: Boolean(user.following),
    follower: Boolean(user.follower),
  }));
  res.json({ contacts, hasMore, nextOffset: offset + contacts.length });
}));

router.get('/messages/unread-count', asyncRoute(async (req, res) => {
  const unread = await db.getCount(
    `SELECT COUNT(*) AS count FROM messages m
       JOIN conversation_members mine ON mine.conversation_id = m.conversation_id AND mine.user_id = ?
      WHERE m.sender_id <> ? AND m.is_read = 0`,
    [req.user.id, req.user.id],
  );
  res.json({ unread });
}));

router.get('/messages/conversations', asyncRoute(async (req, res) => {
  const conversations = await db.query(
    `SELECT c.id, u.id AS user_id, u.fullname, u.username, u.avatar_url, u.picture, u.is_synthetic,
            u.automation_status, u.typing_until, u.typing_conversation_id,
            (SELECT CASE WHEN COALESCE(m.media_type, '') = 'image' THEN '📷 Photo' WHEN COALESCE(m.media_type, '') = 'audio' THEN '🎤 Voice message' WHEN COALESCE(m.media_type, '') = 'video' THEN '🎬 Video' ELSE m.text END FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
            (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message_at,
            (SELECT COUNT(*) FROM messages unread WHERE unread.conversation_id = c.id
               AND unread.sender_id <> ? AND unread.is_read = 0) AS unread
       FROM conversations c
       JOIN conversation_members mine ON mine.conversation_id = c.id AND mine.user_id = ?
       JOIN conversation_members other_member ON other_member.conversation_id = c.id AND other_member.user_id <> ?
       JOIN users u ON u.id = other_member.user_id
      ORDER BY last_message_at DESC, c.id DESC LIMIT ?`,
    [req.user.id, req.user.id, req.user.id, clampLimit(req.query.limit, 50, 100)],
  );
  const query = String(req.query.q || '').trim().toLowerCase();
  const result = conversations
    .map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.fullname,
      username: row.username,
      handle: row.username?.startsWith('@') ? row.username : `@${row.username || ''}`,
      picture: row.avatar_url || row.picture || null,
      isAutomated: Boolean(Number(row.is_synthetic || 0)),
      online: isAccountOnline(row),
      typing: isAccountTyping(row, row.id),
      lastMessage: row.last_message || '',
      time: relativeTime(row.last_message_at),
      unread: Number(row.unread || 0),
    }))
    .filter((row) => !query || `${row.name} ${row.handle} ${row.lastMessage}`.toLowerCase().includes(query));
  res.json({ conversations: result });
}));

router.post('/messages/conversations', asyncRoute(async (req, res) => {
  const otherUserId = positiveId(req.body?.userId);
  if (!otherUserId) return res.status(400).json({ message: 'A valid user ID is required.' });
  if (otherUserId === req.user.id) return res.status(400).json({ message: 'You cannot start a conversation with yourself.' });
  if (!await db.getOne('SELECT id FROM users WHERE id = ?', [otherUserId])) return notFound(res, 'User not found.');

  const lowId = Math.min(req.user.id, otherUserId);
  const highId = Math.max(req.user.id, otherUserId);
  const pairKey = `${lowId}:${highId}`;
  let conversation = await db.getOne('SELECT id FROM conversations WHERE pair_key = ?', [pairKey]);
  if (!conversation) {
    try {
      conversation = await db.insert('INSERT INTO conversations (pair_key) VALUES (?)', [pairKey]);
      await db.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [conversation.id, lowId]);
      await db.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [conversation.id, highId]);
    } catch (error) {
      if (!uniqueConstraint(error)) throw error;
      conversation = await db.getOne('SELECT id FROM conversations WHERE pair_key = ?', [pairKey]);
    }
  }
  res.status(201).json({ conversationId: conversation.id });
}));

router.get('/messages/conversations/:conversationId/messages', asyncRoute(async (req, res) => {
  const conversationId = positiveId(req.params.conversationId);
  if (!conversationId || !await isMember(conversationId, req.user.id)) return notFound(res, 'Conversation not found.');

  const messages = await db.query(
    `SELECT m.id, m.conversation_id, m.sender_id, m.text, m.is_read, m.created_at,
            m.reply_to_message_id, m.media_type, m.media_url,
            replied.id AS replied_id, replied.sender_id AS replied_sender_id, replied.text AS replied_text
       FROM messages m
       LEFT JOIN messages replied ON replied.id = m.reply_to_message_id
      WHERE m.conversation_id = ? ORDER BY m.id DESC LIMIT ?`,
    [conversationId, clampLimit(req.query.limit, 100, 200)],
  );
  await db.update(
    'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id <> ?',
    [conversationId, req.user.id],
  );
  res.json({
    messages: messages.reverse().map((message) => ({
      id: message.id,
      senderId: message.sender_id,
      sender: Number(message.sender_id) === req.user.id ? 'me' : 'them',
      text: message.text,
      mediaType: message.media_type || null,
      mediaUrl: message.media_url || null,
      time: new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: message.created_at,
      replyTo: message.replied_id ? {
        id: message.replied_id,
        senderId: message.replied_sender_id,
        sender: Number(message.replied_sender_id) === req.user.id ? 'me' : 'them',
        text: message.replied_text,
      } : null,
    })),
  });
}));

router.get('/messages/conversations/:conversationId/status', asyncRoute(async (req, res) => {
  const conversationId = positiveId(req.params.conversationId);
  if (!conversationId || !await isMember(conversationId, req.user.id)) return notFound(res, 'Conversation not found.');

  const participants = await db.query(
    `SELECT u.id, u.fullname, u.is_synthetic, u.automation_status, u.typing_until, u.typing_conversation_id
       FROM conversation_members members
       JOIN users u ON u.id = members.user_id
      WHERE members.conversation_id = ? AND members.user_id <> ?`,
    [conversationId, req.user.id],
  );
  const users = participants.map((user) => {
    const automated = Boolean(Number(user.is_synthetic || 0));
    return {
      userId: user.id,
      name: user.fullname || 'User',
      online: automated ? user.automation_status === 'active' : isUserOnline(user.id),
      typing: automated ? isAccountTyping(user) : isUserTyping(conversationId, user.id),
    };
  });
  res.json({ users });
}));

router.post('/messages/conversations/:conversationId/typing', asyncRoute(async (req, res) => {
  const conversationId = positiveId(req.params.conversationId);
  if (!conversationId || !await isMember(conversationId, req.user.id)) return notFound(res, 'Conversation not found.');
  const key = `${conversationId}:${req.user.id}`;
  purgeExpiredTyping(Date.now());
  if (req.body?.typing === true) typingSignals.set(key, Date.now() + TYPING_TTL_MS);
  else typingSignals.delete(key);
  res.json({ typing: req.body?.typing === true });
}));

router.post('/messages/conversations/:conversationId/messages', asyncRoute(async (req, res) => {
  const conversationId = positiveId(req.params.conversationId);
  const text = String(req.body?.text || '').trim();
  const mediaUploadId = positiveId(req.body?.mediaUploadId);
  const replyToMessageId = positiveId(req.body?.replyToMessageId);
  if (!conversationId || !await isMember(conversationId, req.user.id)) return notFound(res, 'Conversation not found.');
  if (text.length > 5000 || (!text && !mediaUploadId)) return res.status(400).json({ message: 'Add a message or attach a supported media file.' });

  let upload = null;
  if (mediaUploadId) {
    upload = await db.getOne('SELECT id, filename, mime_type FROM media_uploads WHERE id = ? AND owner_id = ?', [mediaUploadId, req.user.id]);
    if (!upload) return res.status(404).json({ message: 'The uploaded attachment was not found.' });
  }
  if (replyToMessageId) {
    const repliedMessage = await db.getOne('SELECT id FROM messages WHERE id = ? AND conversation_id = ?', [replyToMessageId, conversationId]);
    if (!repliedMessage) return res.status(400).json({ message: 'The message you are replying to is no longer available.' });
  }

  const mediaType = upload ? (upload.mime_type.startsWith('image/') ? 'image' : upload.mime_type.startsWith('audio/') ? 'audio' : 'video') : null;
  const publicOrigin = (process.env.PUBLIC_API_ORIGIN || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const mediaUrl = upload ? `${publicOrigin}/uploads/${upload.filename}` : null;
  const message = await db.insert(
    'INSERT INTO messages (conversation_id, sender_id, text, reply_to_message_id, media_upload_id, media_type, media_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [conversationId, req.user.id, text, replyToMessageId, mediaUploadId, mediaType, mediaUrl],
  );
  const recipients = await db.query('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id <> ?', [conversationId, req.user.id]);
  const notificationBody = text || (mediaType === 'image' ? 'Sent a photo' : mediaType === 'audio' ? 'Sent a voice message' : mediaType === 'video' ? 'Sent a video' : 'Sent an attachment');
  for (const recipient of recipients) {
    await notifyUser({
      userId: recipient.user_id,
      actorId: req.user.id,
      type: 'message',
      text: 'sent you a message',
      push: {
        title: `New message from ${req.user.fullname || 'a QuickChat member'}`,
        body: notificationBody.length > 140 ? `${notificationBody.slice(0, 137)}…` : notificationBody,
        url: `/messages?userId=${encodeURIComponent(req.user.id)}`,
        tag: `message-${conversationId}`,
      },
    });
  }
  res.status(201).json({ message: { ...message, text, media_type: mediaType, media_url: mediaUrl, sender: 'me' } });
}));

router.post('/messages/calls/start', asyncRoute(async (req, res) => {
  const conversationId = positiveId(req.body?.conversationId);
  const mediaType = req.body?.mediaType === 'video' ? 'video' : req.body?.mediaType === 'audio' ? 'audio' : null;
  if (!conversationId || !mediaType || !await isMember(conversationId, req.user.id)) return res.status(400).json({ message: 'A valid conversation and call type are required.' });
  const other = await db.getOne(
    'SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id <> ?',
    [conversationId, req.user.id],
  );
  if (!other) return res.status(404).json({ message: 'The other participant could not be found.' });
  const existing = await db.getOne(
    "SELECT id FROM message_calls WHERE (caller_id = ? OR callee_id = ? OR caller_id = ? OR callee_id = ?) AND status IN ('ringing', 'active') AND updated_at_ms > ?",
    [req.user.id, req.user.id, other.user_id, other.user_id, Date.now() - 120000],
  );
  if (existing) return res.status(409).json({ message: 'One of the participants is already in another call.' });
  const callId = crypto.randomUUID();
  const now = Date.now();
  await db.insert(
    'INSERT INTO message_calls (id, conversation_id, caller_id, callee_id, media_type, status, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [callId, conversationId, req.user.id, other.user_id, mediaType, 'ringing', now, now],
  );
  await db.insert(
    'INSERT INTO message_call_signals (call_id, from_user_id, to_user_id, kind, payload, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)',
    [callId, req.user.id, other.user_id, 'invite', JSON.stringify({ conversationId, mediaType, callerId: req.user.id, callerName: req.user.fullname || 'QuickChat member' }), now],
  );
  res.status(201).json({ callId, to: other.user_id, mediaType, iceServers: iceServers() });
}));

router.post('/messages/calls/:callId/signals', asyncRoute(async (req, res) => {
  const callId = String(req.params.callId || '');
  const call = await db.getOne('SELECT * FROM message_calls WHERE id = ?', [callId]);
  if (!call || ![Number(call.caller_id), Number(call.callee_id)].includes(Number(req.user.id))) return notFound(res, 'Call not found.');
  if (['ended', 'rejected', 'missed'].includes(call.status)) return res.status(409).json({ message: 'This call has already ended.' });
  const to = Number(req.body?.to);
  const expected = Number(call.caller_id) === Number(req.user.id) ? Number(call.callee_id) : Number(call.caller_id);
  const kind = String(req.body?.kind || '');
  if (to !== expected || !['accept', 'reject', 'offer', 'answer', 'ice', 'end'].includes(kind)) return res.status(400).json({ message: 'Invalid call signal.' });
  if (['accept', 'reject', 'answer'].includes(kind) && Number(req.user.id) !== Number(call.callee_id)) {
    return res.status(403).json({ message: 'Only the receiving participant can answer or reject a call.' });
  }
  if (kind === 'offer' && Number(req.user.id) !== Number(call.caller_id)) {
    return res.status(403).json({ message: 'Only the caller can initiate the call offer.' });
  }
  const payload = req.body?.payload === undefined ? null : JSON.stringify(req.body.payload);
  if (payload && payload.length > 16000) return res.status(413).json({ message: 'Call signal is too large.' });
  const now = Date.now();
  if (kind === 'accept') await db.update("UPDATE message_calls SET status = 'active', updated_at_ms = ? WHERE id = ?", [now, callId]);
  if (kind === 'reject') await db.update("UPDATE message_calls SET status = 'rejected', updated_at_ms = ? WHERE id = ?", [now, callId]);
  if (kind === 'end') await db.update("UPDATE message_calls SET status = 'ended', updated_at_ms = ? WHERE id = ?", [now, callId]);
  await db.insert(
    'INSERT INTO message_call_signals (call_id, from_user_id, to_user_id, kind, payload, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)',
    [callId, req.user.id, to, kind, payload, now],
  );
  res.status(201).json({ sent: true });
}));

router.post('/messages/calls/:callId/heartbeat', asyncRoute(async (req, res) => {
  const callId = String(req.params.callId || '');
  const call = await db.getOne('SELECT id, caller_id, callee_id, status FROM message_calls WHERE id = ?', [callId]);
  if (!call || ![Number(call.caller_id), Number(call.callee_id)].includes(Number(req.user.id))) return notFound(res, 'Call not found.');
  if (!['ringing', 'active'].includes(call.status)) return res.status(409).json({ message: 'This call is no longer active.' });
  await db.update('UPDATE message_calls SET updated_at_ms = ? WHERE id = ?', [Date.now(), callId]);
  res.json({ active: true });
}));

router.post('/messages/calls/poll', asyncRoute(async (req, res) => {
  const afterId = Math.max(0, Number.parseInt(req.body?.afterId, 10) || 0);
  const now = Date.now();
  const expiredCalls = await db.query("SELECT id, caller_id, callee_id FROM message_calls WHERE status = 'ringing' AND updated_at_ms < ?", [now - 60000]);
  for (const expired of expiredCalls) {
    const claimed = await db.update("UPDATE message_calls SET status = 'missed', updated_at_ms = ? WHERE id = ? AND status = 'ringing' AND updated_at_ms < ?", [now, expired.id, now - 60000]);
    if (!claimed) continue;
    await db.insert(
      'INSERT INTO message_call_signals (call_id, from_user_id, to_user_id, kind, payload, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)',
      [expired.id, 0, expired.caller_id, 'missed', null, now],
    );
    await db.insert(
      'INSERT INTO message_call_signals (call_id, from_user_id, to_user_id, kind, payload, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)',
      [expired.id, 0, expired.callee_id, 'missed', null, now],
    );
    await db.delete("DELETE FROM message_call_signals WHERE call_id = ? AND to_user_id = ? AND kind = 'invite'", [expired.id, expired.callee_id]);
  }
  const rows = await db.query(
    'SELECT s.id, s.call_id, s.from_user_id, s.kind, s.payload, c.conversation_id, c.caller_id, c.callee_id, c.media_type, c.status FROM message_call_signals s JOIN message_calls c ON c.id = s.call_id WHERE s.to_user_id = ? AND s.id > ? ORDER BY s.id ASC LIMIT 100',
    [req.user.id, afterId],
  );
  if (rows.length) {
    const maxId = Math.max(...rows.map((row) => Number(row.id)));
    await db.delete('DELETE FROM message_call_signals WHERE to_user_id = ? AND id <= ?', [req.user.id, maxId]);
  }
  await db.delete('DELETE FROM message_call_signals WHERE created_at_ms < ?', [now - 86400000]);
  await db.delete('DELETE FROM message_calls WHERE created_at_ms < ?', [now - 1209600000]);
  res.json({ iceServers: iceServers(), signals: rows.map((row) => ({
    id: row.id, callId: row.call_id, from: row.from_user_id, kind: row.kind,
    payload: row.payload ? safeParse(row.payload) : null,
    conversationId: row.conversation_id, callerId: row.caller_id, calleeId: row.callee_id,
    mediaType: row.media_type, status: row.status,
  })) });
}));

function iceServers() {
  const stun = String(process.env.WEBRTC_STUN_URLS || 'stun:stun.l.google.com:19302,stun:global.stun.twilio.com:3478').split(',').map((url) => url.trim()).filter(Boolean);
  const servers = stun.length ? [{ urls: stun }] : [];
  const turnUrl = String(process.env.WEBRTC_TURN_URL || '').trim();
  if (turnUrl) servers.push({ urls: turnUrl, username: process.env.WEBRTC_TURN_USERNAME || undefined, credential: process.env.WEBRTC_TURN_CREDENTIAL || undefined });
  return servers;
}

function safeParse(value) {
  try { return JSON.parse(value); } catch (_error) { return null; }
}

async function isMember(conversationId, userId) {
  return Boolean(await db.getOne(
    'SELECT conversation_id FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
    [conversationId, userId],
  ));
}

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validSessionId(value) {
  const sessionId = String(value || '');
  return /^[a-zA-Z0-9_-]{8,128}$/.test(sessionId) ? sessionId : null;
}

function purgeExpiredPresence(now = Date.now()) {
  for (const [userId, sessions] of onlineSessions) {
    for (const [sessionId, lastSeenAt] of sessions) {
      if (now - lastSeenAt > PRESENCE_TTL_MS) sessions.delete(sessionId);
    }
    if (sessions.size === 0) onlineSessions.delete(userId);
  }
}

function isUserOnline(userId) {
  const sessions = onlineSessions.get(String(userId));
  if (!sessions) return false;
  const now = Date.now();
  for (const [sessionId, lastSeenAt] of sessions) {
    if (now - lastSeenAt > PRESENCE_TTL_MS) sessions.delete(sessionId);
  }
  if (sessions.size === 0) {
    onlineSessions.delete(String(userId));
    return false;
  }
  return true;
}

function purgeExpiredTyping(now = Date.now()) {
  for (const [key, expiresAt] of typingSignals) {
    if (expiresAt <= now) typingSignals.delete(key);
  }
}

function isUserTyping(conversationId, userId) {
  const key = `${conversationId}:${userId}`;
  const expiresAt = typingSignals.get(key);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    typingSignals.delete(key);
    return false;
  }
  return true;
}

function isAccountOnline(user) {
  return Number(user.is_synthetic || 0) === 1
    ? user.automation_status === 'active'
    : isUserOnline(user.user_id || user.id);
}

function isAccountTyping(user, conversationId) {
  if (Number(user.is_synthetic || 0) === 1) {
    return Number(user.typing_until || 0) > Date.now() &&
      Number(user.typing_conversation_id) === Number(conversationId);
  }
  return isUserTyping(conversationId, user.user_id || user.id);
}

function relativeTime(value) {
  if (!value) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

module.exports = router;
