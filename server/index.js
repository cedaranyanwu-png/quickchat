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
const rewardService = require('./rewards');
const rewardRoutes = require('./routes/rewards');
const rewardProgramRoutes = require('./routes/rewards-program');
const first100Routes = require('./routes/first100');
const creatorStudioRoutes = require('./routes/creator-studio');
const { initializeSecurityTables, botDetector, trafficRouter } = require('./traffic-security');
const contentRoutes = require('./routes/content');
const statusRoutes = require('./routes/statuses');
const profileRoutes = require('./routes/profiles');
const socialRoutes = require('./routes/social');
const messageRoutes = require('./routes/messages');
const novaRoutes = require('./routes/nova');
const mediaRoutes = require('./routes/media');
const publicRoutes = require('./routes/public');
const { buildSitemap, renderIndex, renderUrlset } = require('./services/seo-sitemap');
const paymentRoutes = require('./routes/payments');
const liveRoutes = require('./routes/live');
const pushRoutes = require('./routes/push');
const adsRoutes = require('./routes/ads');
const boostRoutes = require('./routes/boost');
const { startSyntheticBoostTestRunner, stopSyntheticBoostTestRunner } = require('./boost-test-runner');
const businessRoutes = require('./routes/business');
const recommendationRoutes = require('./routes/recommendations');
const adminRoutes = require('./routes/admin');
const rssRoutes = require('./routes/rss');
const adminBackupRoutes = require('./routes/admin-backups');
const backupEngine = require('./backup-engine');
const { handleFlutterwaveWebhook, verifyAndProcessPayment } = require('./payment-webhook');
const { publicAppUrl, createV4CardOrder, getFlutterwaveEncryptionKey, isFlutterwaveEncryptionKeyConfigured } = require('./flutterwave');
const { emailProvider } = require('./email');
const { getSetting } = require('./platform-settings');
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
app.post('/api/webhooks/flutterwave', express.json({
  limit: '1mb',
  verify: (req, _res, buf) => { req.rawBody = Buffer.from(buf); },
}), async (req, res, next) => {
  try {
    await handleFlutterwaveWebhook(req.body, req.headers, req.rawBody);
    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
});
app.use(express.json({ limit: '1mb' }));
// Security telemetry runs before authentication so public registration/login traffic is covered too.
app.use('/api', botDetector());
app.use('/api', trafficRouter());
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d', immutable: true }));
// Serve status/post media from persistent object storage, with legacy local-file fallback.
app.get('/uploads/:filename', mediaRoutes.servePublicMedia);

// Google Identity Services uses a popup; this policy allows its opener messaging.
app.use((req, res, next) => {
  if (req.accepts('html')) res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

// Public runtime configuration. Everything here is safe to expose to browsers;
// secrets stay in server/.env. The live/local switch and domain come from env,
// so the same build can run against localhost or the live domain.
app.get('/api/config', async (_req, res, next) => {
  try {
    const appUrl = String(process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
    const rssPublisher = String(await getSetting('rss_publisher_enabled', 'false')).toLowerCase() === 'true';
    res.json({
      googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.REACT_APP_GOOGLE_CLIENT_ID || '',
      environment: appEnvironment,
      appUrl,
      apiOrigin: String(process.env.PUBLIC_API_ORIGIN || '').trim().replace(/\/$/, ''),
      push: { available: isPushReady(), publicKey: getPublicKey() },
      features: { live: true, liveGifts: true, push: true, nova: true, rssPublisher },
    });
  } catch (error) { next(error); }
});
app.get('/api/health', async (_req, res) => res.json({ status: 'ok', environment: appEnvironment, database: db.type, email: await emailProvider(), push: isPushReady() }));
app.use('/api/auth', authRoutes);
app.use('/api', publicRoutes);
app.get('/api/ads/click/:campaignId', adsRoutes);

app.get('/api/payments/flutterwave/callback', async (req, res, next) => {
  try {
    const reference = String(req.query.reference || req.query.tx_ref || '').trim();
    const pointsPurchase = /^QCPTS-/i.test(reference);
    const chargeId = String(req.query.charge_id || req.query.transaction_id || '').trim();
    let result = 'pending';
    if (chargeId.startsWith('chg_')) {
      const paid = await verifyAndProcessPayment({ chargeId, txRef: reference });
      result = paid ? 'success' : 'failed';
    }
    res.redirect(pointsPurchase
      ? `${publicAppUrl()}/settings/wallet?points=${result}`
      : `${publicAppUrl()}/home?payment=${result}`);
  } catch (error) {
    next(error);
  }
});

app.get('/api/payments/flutterwave/v4-checkout/:checkoutId', async (req, res, next) => {
  try {
    const checkout = await db.getOne(
      `SELECT id, buyer_id, item_type, item_id, amount, currency, status
         FROM payment_checkouts WHERE id = ?`,
      [String(req.params.checkoutId)],
    );
    if (!checkout || !['open', 'creating'].includes(String(checkout.status))) {
      return res.status(404).send('This payment session is unavailable or has expired.');
    }
    if (!isFlutterwaveEncryptionKeyConfigured()) {
      return res.status(503).send('Flutterwave v4 secure card payments are not configured yet.');
    }
    const buyer = await db.getOne('SELECT fullname, username, email FROM users WHERE id = ?', [checkout.buyer_id]);
    const encryptionKey = await getFlutterwaveEncryptionKey();
    const amount = Number(checkout.amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const currency = String(checkout.currency || 'NGN').toUpperCase();
    const title = checkout.item_type === 'post' ? 'Unlock premium post' : checkout.item_type === 'creator' ? 'Creator fan pass' : checkout.item_type === 'points' ? 'Buy QuickChat points' : 'Community pass';
    const page = renderFlutterwaveV4CheckoutPage({
      checkoutId: checkout.id,
      email: buyer?.email || '',
      name: buyer?.fullname || buyer?.username || 'QuickChat member',
      amount,
      currency,
      title,
      encryptionKey,
    });
    res.type('html').send(page);
  } catch (error) {
    next(error);
  }
});

app.post('/api/payments/flutterwave/v4-charge', express.json({ limit: '32kb' }), async (req, res, next) => {
  try {
    const checkoutId = String(req.body?.checkoutId || '').trim();
    const encryptedCard = req.body?.card;
    if (!checkoutId || !encryptedCard) return res.status(400).json({ message: 'Secure payment details are incomplete.' });
    const result = await createV4CardOrder({ checkoutId, encryptedCard });
    if (result.redirectUrl) return res.json({ redirectUrl: result.redirectUrl, status: result.status, orderId: result.orderId });
    res.json({ status: result.status, orderId: result.orderId, message: 'Payment was submitted. Waiting for confirmation.' });
  } catch (error) {
    next(error);
  }
});

function renderFlutterwaveV4CheckoutPage({ checkoutId, email, name, amount, currency, title, encryptionKey }) {
  const safe = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const safeJson = (value) => JSON.stringify(String(value || '')).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Secure payment · QuickChat</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f8fc;color:#0f172a;min-height:100vh;display:grid;place-items:center;padding:24px}
.card{width:min(460px,100%);background:#fff;border:1px solid #e2e8f0;border-radius:24px;box-shadow:0 24px 70px rgba(15,23,42,.12);overflow:hidden}.top{padding:24px;background:linear-gradient(135deg,#0f172a,#172554);color:#fff}.brand{font-weight:900;letter-spacing:-.02em}.secure{font-size:11px;color:#a7f3d0;margin-top:8px}.body{padding:24px}.price{font-size:28px;font-weight:900;margin:8px 0 20px}.muted{color:#64748b;font-size:12px}.field{margin:13px 0}.field label{display:block;font-size:11px;font-weight:800;color:#334155;margin-bottom:6px}.field input{width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:12px;font-size:14px;outline:none}.field input:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.1)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.button{width:100%;border:0;border-radius:999px;padding:13px;background:#2563eb;color:#fff;font-size:13px;font-weight:900;cursor:pointer;margin-top:8px}.button:disabled{opacity:.55;cursor:not-allowed}.notice{display:none;margin-top:14px;border-radius:12px;padding:11px;font-size:12px}.error{background:#fef2f2;color:#b91c1c}.info{background:#eff6ff;color:#1d4ed8}.footer{text-align:center;margin-top:16px;font-size:10px;color:#94a3b8}.brandmark{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:10px;background:#2563eb;font-weight:900;margin-right:8px}
</style>
</head>
<body>
<div class="card">
  <div class="top"><div><span class="brandmark">Q</span><span class="brand">QuickChat</span></div><div class="secure">🔒 Secure payment powered by Flutterwave v4</div></div>
  <div class="body">
    <div class="muted">${safe(title)}</div>
    <div class="price">${safe(currency)} ${safe(amount)}</div>
    <div class="muted">Paying as ${safe(name)} · ${safe(email)}</div>
    <form id="pay">
      <div class="field"><label for="number">Card number</label><input id="number" autocomplete="cc-number" inputmode="numeric" maxlength="19" placeholder="1234 5678 9012 3456" required></div>
      <div class="grid">
        <div class="field"><label for="month">Expiry month</label><input id="month" autocomplete="cc-exp-month" inputmode="numeric" maxlength="2" placeholder="MM" required></div>
        <div class="field"><label for="year">Expiry year</label><input id="year" autocomplete="cc-exp-year" inputmode="numeric" maxlength="4" placeholder="YY" required></div>
      </div>
      <div class="field"><label for="cvv">CVV</label><input id="cvv" autocomplete="cc-csc" inputmode="numeric" maxlength="4" placeholder="123" required></div>
      <button class="button" id="submit" type="submit">Pay ${safe(currency)} ${safe(amount)}</button>
    </form>
    <div id="notice" class="notice"></div>
    <div class="footer">Your card details are encrypted in this browser before QuickChat sends them to Flutterwave.</div>
  </div>
</div>
<script>
const checkoutId=${safeJson(checkoutId)};
const encryptionKey=${safeJson(encryptionKey)};
const form=document.getElementById('pay'),button=document.getElementById('submit'),notice=document.getElementById('notice');
function show(message,type='info'){notice.textContent=message;notice.className='notice '+type;notice.style.display='block'}
function nonce(){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';let out='';const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);for(const b of bytes)out+=chars[b%chars.length];return out}
function b64(bytes){let s='';const arr=new Uint8Array(bytes);for(let i=0;i<arr.length;i++)s+=String.fromCharCode(arr[i]);return btoa(s)}
async function encrypt(value,keyB64,iv){const keyBytes=Uint8Array.from(atob(keyB64),c=>c.charCodeAt(0));const key=await crypto.subtle.importKey('raw',keyBytes,{name:'AES-GCM'},false,['encrypt']);const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv:new TextEncoder().encode(iv)},key,new TextEncoder().encode(value));return b64(encrypted)}
form.addEventListener('submit',async(e)=>{e.preventDefault();button.disabled=true;button.textContent='Securing payment…';notice.style.display='none';try{
 const n=nonce();const card={nonce:n,
 encrypted_card_number:await encrypt(document.getElementById('number').value.replace(/\s+/g,''),encryptionKey,n),
 encrypted_expiry_month:await encrypt(document.getElementById('month').value.trim(),encryptionKey,n),
 encrypted_expiry_year:await encrypt(document.getElementById('year').value.trim(),encryptionKey,n),
 encrypted_cvv:await encrypt(document.getElementById('cvv').value.trim(),encryptionKey,n)};
 const response=await fetch('/api/payments/flutterwave/v4-charge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({checkoutId,card})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.message||'Payment could not be started.');
 if(data.redirectUrl){show('Continue to your bank or Flutterwave to complete the payment…','info');window.location.assign(data.redirectUrl);return;}
 show(data.message||'Payment submitted. You can return to QuickChat while it is being confirmed.','info');
 button.textContent='Payment submitted';
}catch(error){show(error.message||'Payment could not be completed.','error');button.disabled=false;button.textContent='Try payment again'}});
</script>
</body>
</html>`;
}

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
              CASE WHEN p.visibility = 'public' THEN 1 ELSE 0 END AS can_view
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

// Public SEO surfaces must be available to search crawlers without authentication.
app.get('/:verificationFile', async (req, res, next) => {
  try {
    const configured = String(await getSetting('google_site_verification_filename', '')).trim();
    const filename = String(req.params.verificationFile || '').trim();
    if (!configured || filename !== configured || !/^[A-Za-z0-9._-]+\.html$/i.test(filename)) return next();
    const content = String(await getSetting('google_site_verification_html', '')).trim();
    if (!content) return res.status(404).type('text').send('Verification file not configured.');
    res.type('html').send(content);
  } catch (error) { next(error); }
});

app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const sitemap = await buildSitemap(req);
    res.type('application/xml').send(renderIndex(sitemap.origin, sitemap.chunks.length || 1));
  } catch (error) { next(error); }
});

app.get('/sitemap-:number.xml', async (req, res, next) => {
  try {
    const sitemap = await buildSitemap(req);
    const index = Number(req.params.number) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= sitemap.chunks.length) return res.status(404).type('text').send('Sitemap not found.');
    res.type('application/xml').send(renderUrlset(sitemap.origin, sitemap.chunks[index]));
  } catch (error) { next(error); }
});

app.get('/robots.txt', async (req, res, next) => {
  try {
    const configured = String(await getSetting('public_app_url', process.env.PUBLIC_APP_URL || '')).trim();
    const origin = configured ? new URL(configured).origin : `${req.protocol}://${req.get('host')}`;
    res.type('text/plain').send([
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /api/',
      'Disallow: /settings',
      'Disallow: /messages',
      'Sitemap: ' + origin + '/sitemap.xml',
    ].join('\n'));
  } catch (error) { next(error); }
});

app.get('/profile/:username', async (req, res, next) => {
  try {
    const username = String(req.params.username || '').trim().replace(/^@/, '');
    if (!username || !/^[a-zA-Z0-9_.-]{1,60}$/.test(username)) return res.status(404).send('Profile not found.');
    const user = await db.getOne(
      `SELECT u.id, u.username, u.fullname, u.bio, u.location, u.website, u.avatar_url, u.picture, u.cover_url,
              u.verified, u.created_at,
              (SELECT COUNT(*) FROM follows f WHERE f.followed_id = u.id) AS followers,
              (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id AND p.visibility = 'public') AS posts
         FROM users u
        WHERE LOWER(REPLACE(u.username, '@', '')) = LOWER(?) AND COALESCE(u.is_synthetic, 0) = 0`,
      [username],
    );
    if (!user) return res.status(404).send('Profile not found.');
    const origin = (() => { try { return new URL(String(process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`).trim()).origin; } catch (_error) { return `${req.protocol}://${req.get('host')}`; } })();
    const canonical = `${origin}/profile/${encodeURIComponent(String(user.username).replace(/^@/, ''))}`;
    const image = user.avatar_url || user.picture || user.cover_url || '';
    const title = `${user.fullname || user.username} | QuickChat`;
    const description = String(user.bio || `${user.fullname || user.username} on QuickChat`).replace(/\s+/g, ' ').slice(0, 300);
    const imageUrl = image ? (() => { try { return new URL(image, origin).toString(); } catch (_error) { return ''; } })() : '';
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: user.fullname || user.username,
      url: canonical,
      image: imageUrl || undefined,
      description,
      address: user.location ? { '@type': 'PostalAddress', addressLocality: user.location } : undefined,
      sameAs: user.website ? [user.website] : undefined,
    });
    const escape = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const tags = [
      `<meta name="description" content="${escape(description)}">`,
      `<link rel="canonical" href="${escape(canonical)}">`,
      `<meta property="og:type" content="profile">`,
      `<meta property="og:title" content="${escape(title)}">`,
      `<meta property="og:description" content="${escape(description)}">`,
      `<meta property="og:url" content="${escape(canonical)}">`,
      imageUrl && `<meta property="og:image" content="${escape(imageUrl)}">`,
      `<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}">`,
      `<meta name="twitter:title" content="${escape(title)}">`,
      `<meta name="twitter:description" content="${escape(description)}">`,
      imageUrl && `<meta name="twitter:image" content="${escape(imageUrl)}">`,
      `<script type="application/ld+json">${jsonLd.replace(/</g, '\\u003c')}</script>`,
    ].filter(Boolean).join('\n');
    fs.readFile(path.join(frontendBuildPath, 'index.html'), 'utf8', (error, html) => {
      if (error) return next(error);
      res.type('html').send(
        html
          .replace(/<title>[^<]*<\/title>/i, `<title>${escape(title)}</title>`)
          .replace('</head>', `  ${tags}\n</head>`),
      );
    });
  } catch (error) { next(error); }
});

// Page APIs require the bearer token returned by the login and registration routes.
app.use('/api', (req, res, next) => {
  // Managed feed placements and their isolated renderer are public read-only
  // endpoints. They must be reachable by guests so sponsored content can load.
  if (req.method === 'GET' && (
    req.path === '/ads/placements' ||
    req.path === '/growth/first-100' ||
    /^\/ads\/render\/[^/]+$/.test(req.path)
  )) return next();

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
app.use('/api', rewardRoutes);
app.use('/api', rewardProgramRoutes.router);
app.use('/api', first100Routes.router);
app.use('/api', creatorStudioRoutes.router);
app.use('/api', (_req, res) => res.status(404).json({ message: 'API route not found.' }));

// Serve the production React bundle from this same origin as the API.
app.use(express.static(frontendBuildPath, { index: false }));
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  Promise.all([
    getSetting('google_site_verification_meta', ''),
    getSetting('bing_site_verification_meta', ''),
    getSetting('seo_custom_head_html', ''),
  ]).then(([googleMeta, bingMeta, customHead]) => {
    fs.readFile(path.join(frontendBuildPath, 'index.html'), 'utf8', (error, html) => {
      if (error) return next(error);
      const verificationTags = [
        String(googleMeta || '').trim(),
        String(bingMeta || '').trim(),
        String(customHead || '').trim(),
      ].filter(Boolean).join('\n  ');
      const page = verificationTags ? html.replace('</head>', `  ${verificationTags}\n</head>`) : html;
      res.type('html').send(page);
    });
  }).catch(next);
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
  await rewardService.initializeRewardTables();
  await rewardProgramRoutes.initializeRewardProgram();
  await first100Routes.initializeFirst100Tables();
  await creatorStudioRoutes.initializeCreatorStudioTables();
  // Backfill the one-time 1,000-point bonus for every previously verified human account.
  const previouslyVerified = await db.query('SELECT id FROM users WHERE verified = 1 AND COALESCE(is_synthetic, 0) = 0 ORDER BY id');
  for (const account of previouslyVerified) {
    await rewardService.awardVerification(account.id, 'existing_verified_account');
  }
  await initializeSecurityTables();
  await adminRoutes.initializeAdminTables();
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
    email_verification_notice: 'INTEGER NOT NULL DEFAULT 0',
    email_verification_token: 'TEXT',
    email_verification_expires: db.type === 'sqlite' ? 'TEXT' : 'TIMESTAMP',
    whatsapp_phone: db.type === 'sqlite' ? 'TEXT' : 'VARCHAR(24)',
    whatsapp_phone_verified: 'INTEGER NOT NULL DEFAULT 0',
    whatsapp_notifications_opt_in: 'INTEGER NOT NULL DEFAULT 0',
    whatsapp_verification_token: 'TEXT',
    whatsapp_verification_expires: db.type === 'sqlite' ? 'TEXT' : 'TIMESTAMP',
    // Account verification (blue badge). `verified` stays the public flag;
    // `verified_at` records when the badge was granted so it can be shown on profiles.
    verified_at: db.type === 'sqlite' ? 'TEXT' : 'TIMESTAMP',
    verification_method: db.type === 'sqlite' ? 'TEXT' : 'VARCHAR(32)',
    password_reset_token: 'TEXT',
    password_reset_expires: db.type === 'sqlite' ? 'TEXT' : 'TIMESTAMP',
    business_enabled: 'INTEGER NOT NULL DEFAULT 0',
    creator_account: 'INTEGER NOT NULL DEFAULT 0',
    recommendation_preferences: 'TEXT',
  };

  // Existing databases may have the older `name` and `google_id` column names.
  const hadEmailVerificationNotice = columns.has('email_verification_notice');
  const hadCreatedAt = columns.has('created_at');
  for (const [column, type] of Object.entries(columnTypes)) {
    if (!columns.has(column)) await db.query(`ALTER TABLE users ADD COLUMN ${column} ${type}`);
  }
  if (!hadCreatedAt) {
    await db.query('UPDATE users SET created_at = COALESCE(createdat, CURRENT_TIMESTAMP)');
  }
  if (!hadEmailVerificationNotice) {
    // One-time rollout: require legacy password accounts to verify ownership of
    // their stored email. Google-linked accounts remain trusted because Google
    // already supplied a verified email claim; their next Google sign-in also
    // refreshes the local verification flag.
    await db.query("UPDATE users SET email_verified = 0, email_verification_notice = 1 WHERE COALESCE(googleid, '') = '' AND COALESCE(is_synthetic, 0) = 0");
    await db.query("UPDATE users SET email_verified = 1, email_verification_notice = 0 WHERE COALESCE(googleid, '') <> ''");
    console.log('[Database] Legacy password accounts were queued for email verification; Google-linked accounts remain verified.');
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
    .then(() => { startSyntheticBoostTestRunner(); })
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
          stopSyntheticBoostTestRunner();
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
