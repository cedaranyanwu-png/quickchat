const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const db = require('./database');
const { toPost } = require('./routes/utils');
const authRoutes = require('./auth');
const { authenticate } = require('./middleware/authenticate');
const adminAuth = require('./admin-auth');
const { initializePageTables } = require('./schema');
const contentRoutes = require('./routes/content');
const statusRoutes = require('./routes/statuses');
const profileRoutes = require('./routes/profiles');
const socialRoutes = require('./routes/social');
const messageRoutes = require('./routes/messages');
const novaRoutes = require('./routes/nova');
const mediaRoutes = require('./routes/media');
const publicRoutes = require('./routes/public');
const paymentRoutes = require('./routes/payments');
const liveRoutes = require('./routes/live');
const pushRoutes = require('./routes/push');
const adsRoutes = require('./routes/ads');
const boostRoutes = require('./routes/boost');
const businessRoutes = require('./routes/business');
const recommendationRoutes = require('./routes/recommendations');
const adminRoutes = require('./routes/admin');
const rssRoutes = require('./routes/rss');
const adminBackupRoutes = require('./routes/admin-backups');
const adminModerationRoutes = require('./routes/admin-moderation');
const adminConfigRoutes = require('./routes/admin-config');
const platformConfig = require('./platform-config');
const backupEngine = require('./backup-engine');
const { handleFlutterwaveWebhook, verifyAndProcessPayment } = require('./payment-webhook');
const { publicAppUrl } = require('./flutterwave');
const { emailProvider } = require('./email');
const { initializePush, getPublicKey, isPushReady } = require('./push');

const app = express();
const frontendBuildPath = path.join(__dirname, '..', 'build');
const configuredOrigins = process.env.CLIENT_ORIGIN
  ?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const appEnvironment = String(process.env.APP_ENV || (process.env.NODE_ENV === 'production' ? 'live' : 'local')).toLowerCase();

if (appEnvironment === 'live') app.set('trust proxy', 1);

app.use(cors(configuredOrigins?.length ? { origin: configuredOrigins } : undefined));
// Flutterwave signs webhook requests with the configured verif-hash header.
// This route and the hosted-checkout callback stay outside bearer auth.
app.post('/api/webhooks/flutterwave', express.json({ limit: '1mb' }), async (req, res, next) => {
  try {
    await handleFlutterwaveWebhook(req.body, req.headers);
    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
});
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d', immutable: true }));

// Google Identity Services uses a popup; this policy allows its opener messaging.
app.use((req, res, next) => {
  if (req.accepts('html')) res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

// Public runtime configuration. Everything here is safe to expose to browsers;
// secrets stay in server/.env. The live/local switch and domain come from env,
// so the same build can run against localhost or the live domain.
app.get('/api/config', (_req, res) => {
  const appUrl = String(process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.REACT_APP_GOOGLE_CLIENT_ID || '',
    environment: appEnvironment,
    appUrl,
    apiOrigin: String(process.env.PUBLIC_API_ORIGIN || '').trim().replace(/\/$/, ''),
    push: { available: isPushReady(), publicKey: getPublicKey() },
    features: { live: true, liveGifts: true, push: true, nova: true },
  });
});
app.get('/api/health', (_req, res) => res.json({ status: 'ok', environment: appEnvironment, database: db.type, email: emailProvider(), push: isPushReady() }));
app.use('/api/auth', authRoutes);
app.use('/api', publicRoutes);
app.get('/api/ads/click/:campaignId', adsRoutes);

app.get('/api/payments/flutterwave/callback', async (req, res, next) => {
  try {
    const pointsPurchase = String(req.query.tx_ref || '').startsWith('qcpts_');
    const paid = await verifyAndProcessPayment({
      transactionId: req.query.transaction_id,
      txRef: req.query.tx_ref,
    });
    const result = paid ? 'success' : 'failed';
    // Points buyers return to the live hub, where the wallet balance is shown.
    res.redirect(pointsPurchase
      ? `${publicAppUrl()}/live?points=${result}`
      : `${publicAppUrl()}/home?payment=${result}`);
  } catch (error) {
    next(error);
  }
});

// Social crawlers do not execute the React app, so share URLs need their metadata
// in the initial HTML response (not just in SharePreview after it loads).
app.get('/share/post/:postId', async (req, res, next) => {
  try {
    const postId = positiveShareId(req.params.postId);
    if (!postId) return res.status(400).send('Invalid post ID.');
    const postRow = await db.getOne(
      `SELECT p.id, p.author_id, p.body, p.kind, p.category, p.hashtags, p.target_interests, p.source_link,
              p.visibility, p.price_amount, p.price_currency,
              p.community_id, c.name AS community_name, p.media, p.video_id, p.created_at,
              u.fullname AS name, u.username, u.avatar_url, u.picture, u.verified,
              u.creator_membership_price AS author_fan_price, u.creator_membership_currency AS author_fan_currency,
              u.interests AS author_interests, u.is_synthetic AS author_is_synthetic,
              (SELECT COUNT(*) FROM post_replies r WHERE r.post_id = p.id) AS reply_count,
              (SELECT COUNT(*) FROM post_reposts rr WHERE rr.post_id = p.id) AS share_count,
              (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS like_count,
              0 AS liked, 0 AS bookmarked, 0 AS reposted,
              CASE WHEN p.visibility = 'public' AND p.community_id IS NULL THEN 1 ELSE 0 END AS can_view
         FROM posts p JOIN users u ON u.id = p.author_id
         LEFT JOIN communities c ON c.id = p.community_id
        WHERE p.id = ?`,
      [postId],
    );
    if (!postRow) return res.status(404).send('This post is unavailable.');

    const post = toPost(postRow);
    const firstImage = post.media?.find((media) => media.type === 'image' && media.url);
    const videoPoster = post.media?.find((media) => media.type === 'video' && media.thumbnailUrl)?.thumbnailUrl;
    const title = post.isPaywalled
      ? `Post by ${post.name || 'QuickChat user'} | QuickChat`
      : `${post.name || 'QuickChat user'} on QuickChat`;
    const description = post.isPaywalled
      ? 'View this post on QuickChat.'
      : (post.text || 'See this post on QuickChat').slice(0, 300);
    const image = firstImage?.url || videoPoster || '';
    return sendSharePage(req, res, { title, description, image, type: 'article' }, `/share/post/${postId}`, next);
  } catch (error) {
    return next(error);
  }
});

app.get('/share/video/:videoId', async (req, res, next) => {
  try {
    const videoId = positiveShareId(req.params.videoId);
    if (!videoId) return res.status(400).send('Invalid video ID.');
    const video = await db.getOne(
      `SELECT v.title, v.description, v.thumbnail_url
         FROM videos v WHERE v.id = ?`,
      [videoId],
    );
    if (!video) return res.status(404).send('This video is unavailable.');
    return sendSharePage(req, res, {
      title: `${video.title || 'Video'} | QuickChat`,
      description: (video.description || `Watch ${video.title || 'this video'} on QuickChat.`).slice(0, 300),
      image: video.thumbnail_url || '',
      type: 'video.other',
    }, `/share/video/${videoId}`, next);
  } catch (error) {
    return next(error);
  }
});

function positiveShareId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function sendSharePage(req, res, metadata, sharePath, next) {
  const configuredOrigin = String(process.env.PUBLIC_APP_URL || '').trim();
  let origin;
  try {
    origin = configuredOrigin ? new URL(configuredOrigin).origin : `${req.protocol}://${req.get('host')}`;
  } catch (_error) {
    origin = `${req.protocol}://${req.get('host')}`;
  }

  const absoluteUrl = (value) => {
    try { return new URL(value, origin).toString(); } catch (_error) { return ''; }
  };
  const canonicalUrl = absoluteUrl(sharePath);
  const imageUrl = metadata.image ? absoluteUrl(metadata.image) : '';
  const tags = [
    `<meta property="og:type" content="${escapeHtml(metadata.type)}" />`,
    `<meta property="og:site_name" content="QuickChat" />`,
    `<meta property="og:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`,
    imageUrl && `<meta property="og:image" content="${escapeHtml(imageUrl)}" />`,
    imageUrl && '<meta property="og:image:width" content="1200" />',
    imageUrl && '<meta property="og:image:height" content="630" />',
    `<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(metadata.description)}" />`,
    imageUrl && `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`,
  ].filter(Boolean).join('\n  ');

  fs.readFile(path.join(frontendBuildPath, 'index.html'), 'utf8', (error, html) => {
    if (error) return next(error);
    const page = html
      .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(metadata.title)}</title>`)
      .replace('</head>', `  ${tags}\n</head>`);
    res.type('html').send(page);
  });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

// Page APIs require the bearer token returned by the login and registration routes.
app.use('/api', (req, res, next) => {
  // The admin console has its own token namespace and never consumes the user token.
  if (req.path === '/admin/auth/login') return next();
  if (req.path.startsWith('/admin/')) return adminAuth.authenticateAdmin(req, res, next);
  return authenticate(req, res, next);
});
app.use('/api', adminAuth.router);
app.use('/api', contentRoutes);
app.use('/api', statusRoutes);
app.use('/api', profileRoutes);
app.use('/api', socialRoutes);
app.use('/api', paymentRoutes);
app.use('/api', messageRoutes);
app.use('/api', novaRoutes);
app.use('/api', liveRoutes);
app.use('/api', pushRoutes);
app.use('/api', mediaRoutes);
app.use('/api', adsRoutes);
app.use('/api', boostRoutes);
app.use('/api', businessRoutes);
app.use('/api', recommendationRoutes);
app.use('/api', rssRoutes);
app.use('/api', adminRoutes.router);
app.use('/api', adminBackupRoutes);
app.use('/api', adminModerationRoutes.router);
app.use('/api', adminConfigRoutes);
app.use('/api', (_req, res) => res.status(404).json({ message: 'API route not found.' }));

// Serve the production React bundle from this same origin as the API.
app.use(express.static(frontendBuildPath));
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendBuildPath, 'index.html'), (error) => {
    if (error) next(error);
  });
});

app.use((error, _req, res, _next) => {
  console.error('[API] Request failed:', error);
  if (res.headersSent) return;
  res.status(error.status || 500).json({
    message: error.status ? error.message : 'The request could not be completed.',
    ...(error.providerCode ? { providerCode: error.providerCode } : {}),
    ...(error.providerRequestId ? { providerRequestId: error.providerRequestId } : {}),
  });
});

async function initializeDB() {
  const createTableSql = {
    postgres: `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      fullname VARCHAR(255),
      name VARCHAR(255),
      username VARCHAR(255),
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255),
      googleid VARCHAR(255),
      interests TEXT,
      picture TEXT,
      createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    mysql: `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      fullname VARCHAR(255),
      name VARCHAR(255),
      username VARCHAR(255),
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255),
      googleid VARCHAR(255),
      interests TEXT,
      picture TEXT,
      createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    sqlite: `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fullname TEXT,
      name TEXT,
      username TEXT,
      email TEXT NOT NULL UNIQUE,
      password TEXT,
      googleid TEXT,
      interests TEXT,
      picture TEXT,
      createdat DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  };

  await db.query(createTableSql[db.type]);
  await addMissingColumns();
  await migrateLegacyUsers();
  await ensureUniqueIndexes();
  await initializePageTables();
  await adminRoutes.initializeAdminTables();
  await adminModerationRoutes.initializePostModeration();
  await platformConfig.initializePlatformConfig();
  await adminAuth.initializeAdminAuth();
  console.log('[Database] Users and independent administration tables are ready.');
}

async function addMissingColumns() {
  const columns = await getColumnNames();
  const columnTypes = {
    fullname: db.type === 'sqlite' ? 'TEXT' : 'VARCHAR(255)',
    name: db.type === 'sqlite' ? 'TEXT' : 'VARCHAR(255)',
    username: db.type === 'sqlite' ? 'TEXT' : 'VARCHAR(255)',
    googleid: db.type === 'sqlite' ? 'TEXT' : 'VARCHAR(255)',
    picture: 'TEXT',
    createdat: db.type === 'sqlite' ? 'DATETIME' : 'TIMESTAMP',
    // Queries read u.created_at; older tables only have createdat.
    created_at: db.type === 'sqlite' ? 'DATETIME' : 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    bio: 'TEXT',
    interests: 'TEXT',
    location: db.type === 'sqlite' ? 'TEXT' : 'VARCHAR(120)',
    website: db.type === 'sqlite' ? 'TEXT' : 'VARCHAR(255)',
    avatar_url: 'TEXT',
    cover_url: 'TEXT',
    verified: 'INTEGER NOT NULL DEFAULT 0',
    is_synthetic: 'INTEGER NOT NULL DEFAULT 0',
    personality_style: 'TEXT',
    automation_status: "VARCHAR(20) NOT NULL DEFAULT 'active'",
    character_id: 'TEXT',
    typing_until: db.type === 'sqlite' ? 'INTEGER' : 'BIGINT',
    typing_conversation_id: 'INTEGER',
    payout_country: db.type === 'sqlite' ? "TEXT NOT NULL DEFAULT 'NG'" : "VARCHAR(2) NOT NULL DEFAULT 'NG'",
    creator_membership_price: 'VARCHAR(32)',
    creator_membership_currency: 'VARCHAR(3)',
    creator_membership_product_id: 'VARCHAR(100)',
    email_verified: 'INTEGER NOT NULL DEFAULT 0',
    email_verification_token: 'TEXT',
    email_verification_expires: db.type === 'sqlite' ? 'TEXT' : 'TIMESTAMP',
    // Account verification (blue badge). `verified` stays the public flag;
    // `verified_at` records when the badge was granted so it can be shown on profiles.
    verified_at: db.type === 'sqlite' ? 'TEXT' : 'TIMESTAMP',
    verification_method: db.type === 'sqlite' ? 'TEXT' : 'VARCHAR(32)',
    password_reset_token: 'TEXT',
    password_reset_expires: db.type === 'sqlite' ? 'TEXT' : 'TIMESTAMP',
    business_enabled: 'INTEGER NOT NULL DEFAULT 0',
    recommendation_preferences: 'TEXT',
  };

  // Existing databases may have the older `name` and `google_id` column names.
  const hadEmailVerified = columns.has('email_verified');
  const hadCreatedAt = columns.has('created_at');
  for (const [column, type] of Object.entries(columnTypes)) {
    if (!columns.has(column)) await db.query(`ALTER TABLE users ADD COLUMN ${column} ${type}`);
  }
  if (!hadCreatedAt) {
    await db.query('UPDATE users SET created_at = COALESCE(createdat, CURRENT_TIMESTAMP)');
  }
  if (!hadEmailVerified) {
    // Accounts created before email verification existed must keep signing in.
    await db.query('UPDATE users SET email_verified = 1');
    console.log('[Database] Existing accounts were marked email-verified.');
  }
}

async function getColumnNames() {
  let rows;
  if (db.type === 'sqlite') {
    rows = await db.query('PRAGMA table_info(users)');
    return new Set(rows.map((row) => row.name.toLowerCase()));
  }
  if (db.type === 'postgres') {
    rows = await db.query(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?',
      ['users'],
    );
    return new Set(rows.map((row) => row.column_name.toLowerCase()));
  }

  rows = await db.query('SHOW COLUMNS FROM users');
  return new Set(rows.map((row) => row.Field.toLowerCase()));
}

async function migrateLegacyUsers() {
  const rows = await db.query('SELECT * FROM users ORDER BY id');
  const reservedUsernames = new Set();

  for (const row of rows) {
    const id = value(row, 'id');
    const email = String(value(row, 'email') || '').trim().toLowerCase();
    const fullName = value(row, 'fullname', 'name') || email || 'QuickChat user';
    const oldUsername = String(value(row, 'username') || '').trim();
    const username = await uniqueUsername(oldUsername || usernameFromEmail(email), reservedUsernames, id);
    const googleId = value(row, 'googleid', 'google_id') || null;
    const picture = value(row, 'picture', 'avatar_url') || null;
    const createdAt = value(row, 'createdat', 'created_at') || null;

    reservedUsernames.add(username.toLowerCase());
    await db.update(
      // Preserve the old NOT NULL `name` field while normalizing users for current routes.
      'UPDATE users SET fullname = ?, name = ?, username = ?, googleid = ?, picture = ?, createdat = COALESCE(createdat, ?) WHERE id = ?',
      [fullName, fullName, username, googleId, picture, createdAt, id],
    );
  }
}

async function uniqueUsername(preferred, reserved, id) {
  const base = preferred.replace(/\s+/g, '').slice(0, 28) || '@user';
  let candidate = base;
  let suffix = 1;

  while (reserved.has(candidate.toLowerCase()) ||
    await db.getOne('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id <> COALESCE(?, -1)', [candidate, id])) {
    candidate = `${base.slice(0, 23)}_${suffix++}`;
  }
  return candidate;
}

function usernameFromEmail(email) {
  const localPart = (email.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20);
  return `@${localPart || 'user'}`;
}

function value(row, ...names) {
  const fields = Object.fromEntries(Object.entries(row).map(([key, entry]) => [key.toLowerCase(), entry]));
  for (const name of names) {
    const result = fields[name.toLowerCase()];
    if (result !== undefined && result !== null && result !== '') return result;
  }
  return null;
}

async function ensureUniqueIndexes() {
  const indexes = [
    ['users_username_unique', 'username'],
    ['users_googleid_unique', 'googleid'],
  ];

  for (const [indexName, column] of indexes) {
    if (db.type === 'mysql') {
      const existing = await db.getOne(
        'SELECT index_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?',
        ['users', indexName],
      );
      if (!existing) await db.query(`CREATE UNIQUE INDEX ${indexName} ON users (${column})`);
    } else {
      await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${indexName} ON users (${column})`);
    }
  }
}

let backupSchedule = null;

function initializeBackupSchedule() {
  const enabled = String(process.env.BACKUP_SCHEDULE_ENABLED || 'false').toLowerCase() === 'true';
  if (!enabled || backupSchedule) return;
  const schedule = require('node-schedule');
  const expression = process.env.BACKUP_CRON || '0 2 * * *';
  backupSchedule = schedule.scheduleJob(expression, async () => {
    try {
      const result = await backupEngine.createBackup({ reason: 'Scheduled daily administrator backup' });
      console.log('[Backup] Scheduled archive created:', result.filename, result.sizeBytes, 'bytes');
      const removed = await backupEngine.cleanupExpiredBackups(process.env.BACKUP_RETENTION_DAYS || 30);
      if (removed) console.log('[Backup] Retention cleanup removed', removed, 'expired archives.');
    } catch (error) {
      console.error('[Backup] Scheduled backup failed:', error.message);
    }
  });
  if (!backupSchedule) throw new Error('BACKUP_CRON is not a valid node-schedule expression.');
  console.log('[Backup] Scheduled backups enabled:', expression);
}

function startServer() {
  const port = Number(process.env.PORT || 5000);
  return initializeDB()
    .then(() => initializePush())
    .then(() => initializeBackupSchedule())
    .then(
      () => new Promise((resolve) => {
        const server = app.listen(port, () => {
          console.log(`[Server] QuickChat API listening on port ${port} (${appEnvironment}).`);
          resolve(server);
        });
        // Give large, streamed video uploads enough time to finish on slower connections.
        server.requestTimeout = 30 * 60 * 1000;

        let shuttingDown = false;
        const shutdown = () => {
          if (shuttingDown) return;
          shuttingDown = true;
          server.close(async () => {
            await db.close();
            process.exit(0);
          });
        };
        process.once('SIGINT', shutdown);
        process.once('SIGTERM', shutdown);
      }),
    );
}

if (require.main === module) {
  startServer().catch(async (error) => {
    console.error('[Server] Startup failed:', error);
    await db.close().catch(() => {});
    process.exitCode = 1;
  });
}

module.exports = { app, initializeDB, startServer };
