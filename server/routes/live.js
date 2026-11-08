const express = require('express');
const crypto = require('node:crypto');
const { db, asyncRoute, notFound } = require('./utils');
const { GIFTS, POINT_PACKS, giftFor, welcomePoints } = require('../gifts');
const { creditPoints, currentBalance, ensureWallet, recentTransactions, spendPoints } = require('../wallet');
const { createPointsCheckout, topUpAvailable, topUpMissingConfig } = require('../points-purchase');
const { notifyUser } = require('../notify');
const { rewardBalance, cashBalance, POINTS_PER_NAIRA, PURCHASED_POINTS_PER_NAIRA, REFERRAL_REWARD_POINTS } = require('../rewards');
const { creditRewardPoints, recordRewardCommission, PLATFORM_COMMISSION_PERCENT } = require('../rewards');

const router = express.Router();

const VIEWER_TTL_MS = 30_000;
const HOST_TTL_MS = 75_000;
const SIGNAL_TTL_MS = 120_000;
const MAX_SESSION_MS = 6 * 60 * 60 * 1000;
const MAX_SIGNAL_BYTES = 32 * 1024;
const COMMENT_COOLDOWN_MS = 600;
const REACTION_COOLDOWN_MS = 180;
const GIFT_COOLDOWN_MS = 900;

const commentCooldowns = new Map();
const reactionCooldowns = new Map();
const giftCooldowns = new Map();

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function toTimestamp(value) {
  if (!value) return Date.now();
  if (value instanceof Date) return value.getTime();
  const text = String(value);
  const zoned = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text;
  const parsed = new Date(zoned).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function cooldown(map, key, windowMs) {
  const now = Date.now();
  const last = map.get(key) || 0;
  if (now - last < windowMs) return Math.ceil((windowMs - (now - last)) / 1000);
  map.set(key, now);
  if (map.size > 5000) {
    for (const [entry, at] of map) if (now - at > windowMs * 4) map.delete(entry);
  }
  return 0;
}

function iceServers() {
  const servers = [];
  const stun = String(process.env.WEBRTC_STUN_URLS || 'stun:stun.l.google.com:19302,stun:global.stun.twilio.com:3478')
    .split(',').map((url) => url.trim()).filter(Boolean);
  if (stun.length) servers.push({ urls: stun });
  const turnUrl = String(process.env.WEBRTC_TURN_URL || '').trim();
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: process.env.WEBRTC_TURN_USERNAME || undefined,
      credential: process.env.WEBRTC_TURN_CREDENTIAL || undefined,
    });
  }
  return servers;
}

function hostPayload(row) {
  const username = row.username || '';
  return {
    id: row.host_id,
    name: row.fullname || 'QuickChat creator',
    username,
    handle: username ? (username.startsWith('@') ? username : `@${username}`) : '@creator',
    picture: row.avatar_url || row.picture || null,
    verified: Boolean(Number(row.verified || 0)),
  };
}

function sessionPayload(row, { viewers = 0, likes = 0, giftPoints = 0, comments = 0 } = {}) {
  const startedAt = toTimestamp(row.started_at);
  const endedAt = row.ended_at ? toTimestamp(row.ended_at) : null;
  return {
    id: row.id,
    title: row.title || `${hostPayload(row).name} is live`,
    status: row.status,
    hostId: row.host_id,
    host: hostPayload(row),
    startedAt: row.started_at,
    durationSeconds: Math.max(0, Math.round(((endedAt || Date.now()) - startedAt) / 1000)),
    viewers: Number(viewers || 0),
    peakViewers: Number(row.peak_viewers || 0),
    likes: Number(likes || 0),
    giftPoints: Number(giftPoints || 0),
    comments: Number(comments || 0),
  };
}

async function loadSession(id) {
  return db.getOne(
    `SELECT s.*, u.fullname, u.username, u.avatar_url, u.picture, u.verified
       FROM live_sessions s JOIN users u ON u.id = s.host_id WHERE s.id = ?`,
    [id],
  );
}

async function liveSessionOr404(res, id) {
  const session = id ? await loadSession(id) : null;
  if (!session) {
    notFound(res, 'This live session was not found.');
    return null;
  }
  return session;
}

async function viewerCount(sessionId) {
  return db.getCount(
    'SELECT COUNT(*) AS count FROM live_viewers WHERE session_id = ? AND last_seen > ?',
    [sessionId, Date.now() - VIEWER_TTL_MS],
  );
}

async function touchPresence(sessionId, userId, isHost) {
  const now = Date.now();
  if (isHost) {
    await db.update(
      'UPDATE live_sessions SET last_host_seen = ? WHERE id = ?',
      [now, sessionId],
    );
    const viewers = await viewerCount(sessionId);
    const session = await db.getOne('SELECT peak_viewers FROM live_sessions WHERE id = ?', [sessionId]);
    if (viewers > Number(session?.peak_viewers || 0)) {
      await db.update('UPDATE live_sessions SET peak_viewers = ? WHERE id = ?', [viewers, sessionId]);
    }
    return;
  }
  const changed = await db.update(
    'UPDATE live_viewers SET last_seen = ? WHERE session_id = ? AND user_id = ?',
    [now, sessionId, userId],
  );
  if (!changed) {
    try {
      await db.query(
        'INSERT INTO live_viewers (session_id, user_id, last_seen) VALUES (?, ?, ?)',
        [sessionId, userId, now],
      );
    } catch (_error) {
      await db.update(
        'UPDATE live_viewers SET last_seen = ? WHERE session_id = ? AND user_id = ?',
        [now, sessionId, userId],
      );
    }
  }
}

async function endSession(session, reason = 'host') {
  if (!session || session.status !== 'live') {
    return session;
  }
  const viewers = await viewerCount(session.id);
  const peak = Math.max(Number(session.peak_viewers || 0), viewers);
  await db.update(
    `UPDATE live_sessions SET status = 'ended', ended_at = CURRENT_TIMESTAMP, peak_viewers = ? WHERE id = ?`,
    [peak, session.id],
  );
  // Signaling rows and presence are per-session ephemera.
  await db.delete('DELETE FROM live_signals WHERE session_id = ?', [session.id]);
  await db.delete('DELETE FROM live_viewers WHERE session_id = ?', [session.id]);
  console.log(`[Live] Session ${session.id} ended (${reason}).`);
  return loadSession(session.id);
}

// A host that closes the tab without pressing End leaves a live status behind.
// Sessions whose host stopped sending heartbeats are closed on the next read.
async function closeStaleSessions() {
  const stale = await db.query(
    "SELECT id FROM live_sessions WHERE status = 'live' AND last_host_seen < ?",
    [Date.now() - HOST_TTL_MS],
  );
  for (const row of stale) {
    const session = await loadSession(row.id);
    await endSession(session, 'host-timeout');
  }
}

async function summaryCounts(sessionId) {
  const [likes, points, comments] = await Promise.all([
    db.getCount('SELECT COUNT(*) AS count FROM live_reactions WHERE session_id = ?', [sessionId]),
    db.getOne('SELECT COALESCE(SUM(points), 0) AS total FROM live_gifts WHERE session_id = ?', [sessionId]),
    db.getCount('SELECT COUNT(*) AS count FROM live_comments WHERE session_id = ?', [sessionId]),
  ]);
  return { likes, giftPoints: Number(points?.total || 0), comments };
}

function mapComment(row) {
  const username = row.username || '';
  return {
    id: row.id,
    text: row.text,
    createdAt: row.created_at,
    user: {
      id: row.user_id,
      name: row.fullname || 'QuickChat user',
      username,
      handle: username ? (username.startsWith('@') ? username : `@${username}`) : '@user',
      picture: row.avatar_url || row.picture || null,
    },
  };
}

function mapGift(row) {
  const gift = giftFor(row.gift_key);
  const username = row.username || '';
  return {
    id: row.id,
    giftKey: row.gift_key,
    name: gift?.name || 'Gift',
    emoji: gift?.emoji || '🎁',
    accent: gift?.accent || '#f59e0b',
    points: Number(row.points || 0),
    createdAt: row.created_at,
    sender: {
      id: row.sender_id,
      name: row.fullname || 'QuickChat user',
      handle: username ? (username.startsWith('@') ? username : `@${username}`) : '@user',
      picture: row.avatar_url || row.picture || null,
    },
  };
}

// --- Catalogue and wallet -------------------------------------------------

router.get('/live/catalog', asyncRoute(async (req, res) => {
  await ensureWallet(req.user.id);
  res.json({
    gifts: GIFTS,
    pointPacks: POINT_PACKS,
    currency: 'NGN',
    welcomePoints: welcomePoints(),
    topUpAvailable: topUpAvailable(),
  });
}));

router.get('/live/wallet', asyncRoute(async (req, res) => {
  const wallet = await ensureWallet(req.user.id);
  const transactions = await recentTransactions(req.user.id);
  const [earnedRewardPoints, withdrawableKobo] = await Promise.all([
    rewardBalance(req.user.id), cashBalance(req.user.id),
  ]);
  res.json({
    balance: Number(wallet.balance || 0),
    rewardPoints: earnedRewardPoints,
    cashBalance: (withdrawableKobo / 100).toFixed(2),
    conversionRate: { points: POINTS_PER_NAIRA, naira: 1 },
    referralCode: `QC${req.user.id}`,
    referralLink: `${String(process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')}/register?ref=QC${req.user.id}`,
    referralRewardPoints: REFERRAL_REWARD_POINTS,
    currency: 'NGN',
    welcomePoints: welcomePoints(),
    gifts: GIFTS,
    pointPacks: POINT_PACKS,
    topUpAvailable: topUpAvailable(),
    missingConfig: topUpAvailable() ? [] : topUpMissingConfig(),
    transactions: transactions.map((row) => ({
      id: row.id,
      amount: Number(row.amount || 0),
      kind: row.kind,
      sessionId: row.session_id || null,
      createdAt: row.created_at,
    })),
  });
}));

router.post('/live/wallet/topup', asyncRoute(async (req, res) => {
  const user = await db.getOne('SELECT id, email, fullname, username FROM users WHERE id = ?', [req.user.id]);
  if (!user) return notFound(res, 'Your account was not found.');
  const result = await createPointsCheckout({ user, packKey: req.body?.packKey });
  res.status(201).json(result);
}));

// --- Live sessions --------------------------------------------------------

router.get('/live/sessions', asyncRoute(async (req, res) => {
  await closeStaleSessions();
  const now = Date.now();
  const rows = await db.query(
    `SELECT s.id, s.host_id, s.title, s.status, s.started_at, s.peak_viewers,
            u.fullname, u.username, u.avatar_url, u.picture, u.verified,
            (SELECT COUNT(*) FROM live_viewers v WHERE v.session_id = s.id AND v.last_seen > ?) AS viewers,
            (SELECT COUNT(*) FROM live_reactions r WHERE r.session_id = s.id) AS likes,
            (SELECT COALESCE(SUM(g.points), 0) FROM live_gifts g WHERE g.session_id = s.id) AS gift_points,
            (SELECT COUNT(*) FROM live_comments c WHERE c.session_id = s.id) AS comment_count
       FROM live_sessions s JOIN users u ON u.id = s.host_id
      WHERE s.status = 'live'
      ORDER BY viewers DESC, s.id DESC LIMIT 40`,
    [now - VIEWER_TTL_MS],
  );
  res.json({
    sessions: rows
      // Timestamp comparison stays in JS so SQLite, MySQL, and Postgres agree.
      .filter((row) => now - toTimestamp(row.started_at) < MAX_SESSION_MS)
      .map((row) => ({
        ...sessionPayload(row, {
          viewers: row.viewers,
          likes: row.likes,
          giftPoints: row.gift_points,
          comments: row.comment_count,
        }),
        isMine: Number(row.host_id) === Number(req.user.id),
      })),
  });
}));

router.post('/live/sessions', asyncRoute(async (req, res) => {
  const host = await db.getOne(
    'SELECT id, fullname, username, avatar_url, picture, verified, is_synthetic FROM users WHERE id = ?',
    [req.user.id],
  );
  if (!host) return notFound(res, 'Your account was not found.');
  if (Number(host.is_synthetic || 0) === 1) {
    return res.status(403).json({ message: 'Automated accounts cannot start live streams.' });
  }

  // One live stream per host: the previous one is closed when a new one starts.
  const active = await db.query("SELECT * FROM live_sessions WHERE host_id = ? AND status = 'live'", [req.user.id]);
  for (const previous of active) await endSession(previous, 'replaced');

  const title = String(req.body?.title || '').trim().slice(0, 200)
    || `${host.fullname || 'A creator'} is live on QuickChat`;
  const row = await db.insert(
    "INSERT INTO live_sessions (host_id, title, status, last_host_seen, started_at) VALUES (?, ?, 'live', ?, CURRENT_TIMESTAMP)",
    [req.user.id, title, Date.now()],
  );
  const session = await loadSession(row.id);

  // Followers are told their creator went live. Delivery happens off the response.
  void announceLive(host, session, title);

  res.status(201).json({
    session: sessionPayload(session, { viewers: 0 }),
    iceServers: iceServers(),
  });
}));

async function announceLive(host, session, title) {
  try {
    const followers = await db.query(
      'SELECT follower_id FROM follows WHERE followed_id = ? LIMIT 300',
      [host.id],
    );
    for (const follower of followers) {
      try {
        await notifyUser({
          userId: follower.follower_id,
          actorId: host.id,
          type: 'live',
          liveSessionId: session.id,
          text: 'is live now',
          push: {
            title: `${host.fullname || 'Someone you follow'} is live`,
            body: title,
            url: `/live/${session.id}`,
            tag: `live-${session.id}`,
          },
        });
      } catch (_error) {
        // One failed follower should not stop the rest of the announcement.
      }
    }
  } catch (error) {
    console.warn('[Live] Could not announce the stream:', error.message);
  }
}

router.get('/live/sessions/:sessionId', asyncRoute(async (req, res) => {
  const sessionId = positiveId(req.params.sessionId);
  const session = await liveSessionOr404(res, sessionId);
  if (!session) return;
  const counts = await summaryCounts(sessionId);
  res.json({
    session: sessionPayload(session, { ...counts, viewers: await viewerCount(sessionId) }),
    iceServers: iceServers(),
    isHost: Number(session.host_id) === Number(req.user.id),
  });
}));

router.post('/live/sessions/:sessionId/heartbeat', asyncRoute(async (req, res) => {
  const sessionId = positiveId(req.params.sessionId);
  const session = await liveSessionOr404(res, sessionId);
  if (!session) return;
  const isHost = Number(session.host_id) === Number(req.user.id);
  if (session.status === 'live') await touchPresence(sessionId, req.user.id, isHost);
  const counts = await summaryCounts(sessionId);
  res.json({
    status: session.status,
    isHost,
    viewerCount: await viewerCount(sessionId),
    likes: counts.likes,
    giftPoints: counts.giftPoints,
    comments: counts.comments,
  });
}));

router.delete('/live/sessions/:sessionId/presence', asyncRoute(async (req, res) => {
  const sessionId = positiveId(req.params.sessionId);
  if (!sessionId) return res.status(400).json({ message: 'Invalid live session.' });
  await db.delete('DELETE FROM live_viewers WHERE session_id = ? AND user_id = ?', [sessionId, req.user.id]);
  res.json({ left: true });
}));

router.get('/live/sessions/:sessionId/activity', asyncRoute(async (req, res) => {
  const sessionId = positiveId(req.params.sessionId);
  const session = await liveSessionOr404(res, sessionId);
  if (!session) return;

  const isHost = Number(session.host_id) === Number(req.user.id);
  if (session.status === 'live') await touchPresence(sessionId, req.user.id, isHost);

  const afterComment = Math.max(0, Number.parseInt(req.query.afterComment, 10) || 0);
  const afterGift = Math.max(0, Number.parseInt(req.query.afterGift, 10) || 0);
  const initial = afterComment === 0 && afterGift === 0;

  const [comments, gifts, counts, viewers] = await Promise.all([
    initial
      ? db.query(
        `SELECT c.id, c.text, c.created_at, c.user_id, u.fullname, u.username, u.avatar_url, u.picture
           FROM live_comments c JOIN users u ON u.id = c.user_id
          WHERE c.session_id = ? ORDER BY c.id DESC LIMIT 30`,
        [sessionId],
      ).then((rows) => rows.reverse())
      : db.query(
        `SELECT c.id, c.text, c.created_at, c.user_id, u.fullname, u.username, u.avatar_url, u.picture
           FROM live_comments c JOIN users u ON u.id = c.user_id
          WHERE c.session_id = ? AND c.id > ? ORDER BY c.id ASC LIMIT 100`,
        [sessionId, afterComment],
      ),
    initial
      ? db.query(
        `SELECT g.id, g.gift_key, g.points, g.created_at, g.sender_id,
                u.fullname, u.username, u.avatar_url, u.picture
           FROM live_gifts g JOIN users u ON u.id = g.sender_id
          WHERE g.session_id = ? ORDER BY g.id DESC LIMIT 20`,
        [sessionId],
      ).then((rows) => rows.reverse())
      : db.query(
        `SELECT g.id, g.gift_key, g.points, g.created_at, g.sender_id,
                u.fullname, u.username, u.avatar_url, u.picture
           FROM live_gifts g JOIN users u ON u.id = g.sender_id
          WHERE g.session_id = ? AND g.id > ? ORDER BY g.id ASC LIMIT 50`,
        [sessionId, afterGift],
      ),
    summaryCounts(sessionId),
    viewerCount(sessionId),
  ]);

  const lastReaction = await db.getOne(
    'SELECT id FROM live_reactions WHERE session_id = ? ORDER BY id DESC LIMIT 1',
    [sessionId],
  );

  res.json({
    session: sessionPayload(session, { ...counts, viewers }),
    status: session.status,
    isHost,
    viewerCount: viewers,
    comments: comments.map(mapComment),
    gifts: gifts.map(mapGift),
    reactions: { total: counts.likes, lastId: Number(lastReaction?.id || 0) },
    iceServers: iceServers(),
  });
}));

router.post('/live/sessions/:sessionId/comments', asyncRoute(async (req, res) => {
  const sessionId = positiveId(req.params.sessionId);
  const session = await liveSessionOr404(res, sessionId);
  if (!session) return;
  if (session.status !== 'live') return res.status(409).json({ message: 'This live stream has ended.' });
  const text = String(req.body?.text || '').trim();
  if (!text || text.length > 300) return res.status(400).json({ message: 'Comments must be 1 to 300 characters.' });

  const wait = cooldown(commentCooldowns, `${sessionId}:${req.user.id}:comment`, COMMENT_COOLDOWN_MS);
  if (wait) return res.status(429).json({ message: 'You are commenting too quickly. Try again in a moment.' });

  const inserted = await db.insert(
    'INSERT INTO live_comments (session_id, user_id, text) VALUES (?, ?, ?)',
    [sessionId, req.user.id, text],
  );
  const row = await db.getOne(
    `SELECT c.id, c.text, c.created_at, c.user_id, u.fullname, u.username, u.avatar_url, u.picture
       FROM live_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
    [inserted.id],
  );
  res.status(201).json({ comment: mapComment(row) });
}));

router.post('/live/sessions/:sessionId/reactions', asyncRoute(async (req, res) => {
  const sessionId = positiveId(req.params.sessionId);
  const session = await liveSessionOr404(res, sessionId);
  if (!session) return;
  if (session.status !== 'live') return res.status(409).json({ message: 'This live stream has ended.' });
  const requested = Math.min(Math.max(Number.parseInt(req.body?.count, 10) || 1, 1), 10);

  const wait = cooldown(reactionCooldowns, `${sessionId}:${req.user.id}:reaction`, REACTION_COOLDOWN_MS);
  if (wait) return res.json({ likes: await db.getCount('SELECT COUNT(*) AS count FROM live_reactions WHERE session_id = ?', [sessionId]), throttled: true });

  for (let index = 0; index < requested; index += 1) {
    await db.query(
      'INSERT INTO live_reactions (session_id, user_id) VALUES (?, ?)',
      [sessionId, req.user.id],
    );
  }
  res.status(201).json({
    likes: await db.getCount('SELECT COUNT(*) AS count FROM live_reactions WHERE session_id = ?', [sessionId]),
  });
}));

router.post('/live/sessions/:sessionId/gifts', asyncRoute(async (req, res) => {
  const sessionId = positiveId(req.params.sessionId);
  const session = await liveSessionOr404(res, sessionId);
  if (!session) return;
  if (session.status !== 'live') return res.status(409).json({ message: 'This live stream has ended.' });
  const gift = giftFor(req.body?.giftKey);
  if (!gift) return res.status(400).json({ message: 'Choose a valid gift.' });
  if (Number(session.host_id) === Number(req.user.id)) {
    return res.status(400).json({ message: 'You cannot send a gift to your own live stream.' });
  }

  const wait = cooldown(giftCooldowns, `${sessionId}:${req.user.id}:gift`, GIFT_COOLDOWN_MS);
  if (wait) return res.status(429).json({ message: 'Give the last gift a moment before sending another.' });

  const reference = `gift_${sessionId}_${crypto.randomUUID()}`;
  const spent = await spendPoints(req.user.id, gift.points, {
    kind: 'gift_sent',
    reference: `${reference}_out`,
    sessionId,
  });
  if (!spent.ok) {
    return res.status(402).json({
      message: 'You do not have enough points for this gift. Top up your wallet to keep supporting creators.',
      balance: spent.balance || 0,
      required: gift.points,
    });
  }

  let inserted;
  try {
    inserted = await db.insert(
      `INSERT INTO live_gifts (session_id, sender_id, recipient_id, gift_key, points)
       VALUES (?, ?, ?, ?, ?)`,
      [sessionId, req.user.id, session.host_id, gift.key, gift.points],
    );
  } catch (error) {
    await creditPoints(req.user.id, gift.points, { kind: 'gift_refund', reference: `${reference}_refund`, sessionId });
    throw error;
  }

  const grossRewardPoints = gift.points * PURCHASED_POINTS_PER_NAIRA;
  const commissionPoints = Math.floor(grossRewardPoints * PLATFORM_COMMISSION_PERCENT / 100);
  const hostRewardPoints = grossRewardPoints - commissionPoints;
  if (hostRewardPoints > 0) {
    await creditRewardPoints(session.host_id, hostRewardPoints, {
      kind: 'live_gift_earning', reference: `${reference}_reward`,
    }).catch((error) => console.warn('[Live] Could not credit the host reward wallet:', error.message));
  }
  await recordRewardCommission('live_gift', `${reference}_commission`, grossRewardPoints, commissionPoints, hostRewardPoints);

  const row = await db.getOne(
    `SELECT g.id, g.gift_key, g.points, g.created_at, g.sender_id,
            u.fullname, u.username, u.avatar_url, u.picture
       FROM live_gifts g JOIN users u ON u.id = g.sender_id WHERE g.id = ?`,
    [inserted.id],
  );
  res.status(201).json({
    gift: mapGift(row),
    balance: await currentBalance(req.user.id),
    totalPoints: Number((await db.getOne(
      'SELECT COALESCE(SUM(points), 0) AS total FROM live_gifts WHERE session_id = ?',
      [sessionId],
    ))?.total || 0),
  });
}));

router.post('/live/sessions/:sessionId/end', asyncRoute(async (req, res) => {
  const sessionId = positiveId(req.params.sessionId);
  const session = await liveSessionOr404(res, sessionId);
  if (!session) return;
  if (Number(session.host_id) !== Number(req.user.id)) {
    return res.status(403).json({ message: 'Only the host can end this live stream.' });
  }
  const ended = await endSession(session, 'host');
  const counts = await summaryCounts(sessionId);
  const hostRewardBalance = await rewardBalance(session.host_id);
  const earned = await db.getOne(
    `SELECT COALESCE(SUM(points), 0) AS total FROM live_gifts WHERE session_id = ? AND recipient_id = ?`,
    [sessionId, session.host_id],
  );
  res.json({
    session: sessionPayload(ended, { ...counts, viewers: 0 }),
    summary: {
      durationSeconds: sessionPayload(ended).durationSeconds,
      peakViewers: Number(ended.peak_viewers || 0),
      likes: counts.likes,
      comments: counts.comments,
      giftPoints: Number(earned?.total || 0),
      rewardWalletBalance: hostRewardBalance,
    },
  });
}));

// --- WebRTC signaling (relayed through short-lived rows) -------------------

router.post('/live/sessions/:sessionId/signals', asyncRoute(async (req, res) => {
  const sessionId = positiveId(req.params.sessionId);
  const session = await liveSessionOr404(res, sessionId);
  if (!session) return;
  const to = positiveId(req.body?.to);
  const kind = String(req.body?.kind || '').trim();
  if (!to || !['join', 'offer', 'answer', 'ice', 'bye'].includes(kind)) {
    return res.status(400).json({ message: 'Invalid signaling message.' });
  }
  const payload = req.body?.payload === undefined ? null : JSON.stringify(req.body.payload);
  if (payload && payload.length > MAX_SIGNAL_BYTES) {
    return res.status(413).json({ message: 'That signaling message is too large.' });
  }
  if (to === req.user.id) return res.status(400).json({ message: 'A signal needs another participant.' });

  // A viewer may only talk to the host, and the host may only talk to viewers
  // that are currently in this session.
  const targetIsHost = Number(to) === Number(session.host_id);
  const requesterIsHost = Number(req.user.id) === Number(session.host_id);
  if (!targetIsHost && !requesterIsHost) {
    return res.status(403).json({ message: 'Only the host and this stream’s viewers can exchange signals.' });
  }
  if (requesterIsHost) {
    const present = await db.getOne(
      'SELECT user_id FROM live_viewers WHERE session_id = ? AND user_id = ? AND last_seen > ?',
      [sessionId, to, Date.now() - VIEWER_TTL_MS],
    );
    if (!present) return res.status(409).json({ message: 'That viewer is no longer in the live stream.' });
  }

  await db.query(
    'INSERT INTO live_signals (session_id, from_user_id, to_user_id, kind, payload, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)',
    [sessionId, req.user.id, to, kind, payload, Date.now()],
  );
  res.status(201).json({ sent: true });
}));

router.post('/live/sessions/:sessionId/signals/poll', asyncRoute(async (req, res) => {
  const sessionId = positiveId(req.params.sessionId);
  const session = await liveSessionOr404(res, sessionId);
  if (!session) return;
  const after = Math.max(0, Number.parseInt(req.body?.afterId, 10) || 0);
  const rows = await db.query(
    `SELECT id, from_user_id, kind, payload FROM live_signals
      WHERE session_id = ? AND to_user_id = ? AND id > ? ORDER BY id ASC LIMIT 100`,
    [sessionId, req.user.id, after],
  );
  if (rows.length) {
    const maxId = Math.max(...rows.map((row) => Number(row.id)));
    await db.delete(
      'DELETE FROM live_signals WHERE session_id = ? AND to_user_id = ? AND id <= ?',
      [sessionId, req.user.id, maxId],
    );
  }
  // Housekeeping: stale signals are unusable once the TTL passes.
  await db.delete(
    'DELETE FROM live_signals WHERE session_id = ? AND created_at_ms < ?',
    [sessionId, Date.now() - SIGNAL_TTL_MS],
  );
  res.json({
    signals: rows.map((row) => ({
      id: row.id,
      from: row.from_user_id,
      kind: row.kind,
      payload: row.payload ? safeParse(row.payload) : null,
    })),
  });
}));

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

module.exports = router;
