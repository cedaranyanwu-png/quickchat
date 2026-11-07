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
            (SELECT m.text FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
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
            m.reply_to_message_id,
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
  const replyToMessageId = positiveId(req.body?.replyToMessageId);
  if (!conversationId || !await isMember(conversationId, req.user.id)) return notFound(res, 'Conversation not found.');
  if (!text || text.length > 5000) return res.status(400).json({ message: 'Messages must be 1 to 5,000 characters.' });

  if (replyToMessageId) {
    const repliedMessage = await db.getOne(
      'SELECT id FROM messages WHERE id = ? AND conversation_id = ?',
      [replyToMessageId, conversationId],
    );
    if (!repliedMessage) return res.status(400).json({ message: 'The message you are replying to is no longer available.' });
  }

  const message = await db.insert(
    'INSERT INTO messages (conversation_id, sender_id, text, reply_to_message_id) VALUES (?, ?, ?, ?)',
    [conversationId, req.user.id, text, replyToMessageId],
  );
  const recipients = await db.query(
    'SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id <> ?',
    [conversationId, req.user.id],
  );
  for (const recipient of recipients) {
    await notifyUser({
      userId: recipient.user_id,
      actorId: req.user.id,
      type: 'message',
      text: 'sent you a message',
      push: {
        title: `New message from ${req.user.fullname || 'a QuickChat member'}`,
        body: text.length > 140 ? `${text.slice(0, 137)}…` : text,
        url: `/messages?userId=${encodeURIComponent(req.user.id)}`,
        tag: `message-${conversationId}`,
      },
    });
  }
  res.status(201).json({ message: { ...message, sender: 'me' } });
}));

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
