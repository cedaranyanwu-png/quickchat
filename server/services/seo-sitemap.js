const { db } = require('../routes/utils');
const { getSetting } = require('../platform-settings');

const MAX_URLS_PER_SITEMAP = 45000;

function xmlEscape(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;',
  }[character]));
}

function originFrom(req) {
  const configured = String(process.env.PUBLIC_APP_URL || '').trim();
  try { return new URL(configured || req.protocol + '://' + req.get('host')).origin.replace(/\/$/, ''); }
  catch (_error) { return (req.protocol + '://' + req.get('host')).replace(/\/$/, ''); }
}

function mediaUrl(origin, value) {
  try {
    const url = new URL(String(value || '').trim(), origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch (_error) { return ''; }
}

function lastmod(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function cleanPath(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('#') || raw.startsWith('javascript:') || raw.startsWith('mailto:')) return '';
  try {
    const parsed = new URL(raw, 'https://quickchat.invalid');
    return parsed.pathname + (parsed.search ? parsed.search : '');
  } catch (_error) { return ''; }
}

function parseMedia(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
  } catch (_error) { return []; }
}

function videoNode(origin, video) {
  const contentLoc = mediaUrl(origin, video.contentLoc);
  const thumbnailLoc = mediaUrl(origin, video.thumbnailLoc);
  const title = String(video.title || '').trim();
  const description = String(video.description || '').trim();
  if (!contentLoc || !thumbnailLoc || !title || !description) return '';
  const duration = Number(video.duration);
  return '<video:video>' +
    '<video:thumbnail_loc>' + xmlEscape(thumbnailLoc) + '</video:thumbnail_loc>' +
    '<video:title>' + xmlEscape(title.slice(0, 100)) + '</video:title>' +
    '<video:description>' + xmlEscape(description.slice(0, 2048)) + '</video:description>' +
    '<video:content_loc>' + xmlEscape(contentLoc) + '</video:content_loc>' +
    (Number.isFinite(duration) && duration > 0 ? '<video:duration>' + Math.floor(duration) + '</video:duration>' : '') +
    '</video:video>';
}

function urlNode(origin, entry) {
  const loc = mediaUrl(origin, entry.loc);
  if (!loc || new URL(loc).origin !== origin) return '';
  const parts = [
    '<url>',
    '<loc>' + xmlEscape(loc) + '</loc>',
    entry.lastmod ? '<lastmod>' + xmlEscape(lastmod(entry.lastmod)) + '</lastmod>' : '',
    entry.changefreq ? '<changefreq>' + xmlEscape(entry.changefreq) + '</changefreq>' : '',
    entry.priority ? '<priority>' + xmlEscape(entry.priority) + '</priority>' : '',
    ...(Array.isArray(entry.images) ? entry.images.slice(0, 10).map((image) => {
      const imageUrl = mediaUrl(origin, image);
      return imageUrl ? '<image:image><image:loc>' + xmlEscape(imageUrl) + '</image:loc></image:image>' : '';
    }).filter(Boolean) : []),
    ...(Array.isArray(entry.videos) ? entry.videos.map((video) => videoNode(origin, video)).filter(Boolean) : []),
    '</url>',
  ];
  return parts.filter(Boolean).join('');
}

async function getCustomUrls() {
  const raw = await getSetting('seo_sitemap_custom_urls', '[]');
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.map((item) => ({
      url: cleanPath(item?.url),
      priority: String(item?.priority || '0.5'),
      changefreq: String(item?.changefreq || 'weekly'),
    })).filter((item) => item.url).slice(0, 5000) : [];
  } catch (_error) { return []; }
}

function addEntry(entries, seen, entry) {
  const path = cleanPath(entry.loc);
  if (!path || seen.has(path)) return;
  seen.add(path);
  entries.push({ ...entry, loc: path });
}

// Only publish profile URLs that can represent a public username route.
// Email addresses and malformed identifiers must never become crawl targets.
function isIndexableUsername(value) {
  const username = String(value || '').replace(/^@/, '');
  return /^[a-zA-Z0-9._-]{1,60}$/.test(username) && !username.includes('..');
}

async function collectEntries() {
  const entries = [];
  const seen = new Set();

  addEntry(entries, seen, { loc: '/', priority: '1.0', changefreq: 'daily' });
  addEntry(entries, seen, { loc: '/explore', priority: '0.8', changefreq: 'daily' });
  addEntry(entries, seen, { loc: '/creator-program', priority: '0.7', changefreq: 'weekly' });
  addEntry(entries, seen, { loc: '/about', priority: '0.8', changefreq: 'monthly' });
  addEntry(entries, seen, { loc: '/people', priority: '0.9', changefreq: 'daily' });

  const users = await db.query(
    `SELECT username, avatar_url, picture, cover_url, COALESCE(created_at, createdat) AS lastmod
       FROM users
      WHERE COALESCE(username, '') <> ''
        AND COALESCE(is_synthetic, 0) = 0
        AND username NOT LIKE 'qc-admin-actor-%'
      ORDER BY id ASC`,
  );
  for (const user of users) {
    if (!isIndexableUsername(user.username)) continue;
    addEntry(entries, seen, {
      loc: '/profile/' + encodeURIComponent(String(user.username).replace(/^@/, '')),
      lastmod: user.lastmod,
      priority: '0.7',
      changefreq: 'weekly',
      images: [user.avatar_url || user.picture, user.cover_url].filter(Boolean),
    });
  }

  const spaces = await db.query(
    `SELECT id, slug, name, space_type, created_at
       FROM communities
      WHERE COALESCE(slug, '') <> ''
      ORDER BY id ASC`,
  ).catch(() => []);
  for (const space of spaces) {
    addEntry(entries, seen, {
      loc: '/communities/' + encodeURIComponent(String(space.id)),
      lastmod: space.created_at,
      priority: '0.7',
      changefreq: 'daily',
    });
  }

  // Include every public post URL and media attached to that post.
  const posts = await db.query(
    `SELECT p.id, p.body, p.media, p.video_id, p.created_at,
            v.title AS video_title, v.description AS video_description,
            v.video_url, v.thumbnail_url, v.duration
       FROM posts p
       LEFT JOIN videos v ON v.id = p.video_id
      WHERE LOWER(COALESCE(p.visibility, 'public')) = 'public'
      ORDER BY p.id ASC`,
  ).catch(() => []);
  for (const post of posts) {
    const media = parseMedia(post.media);
    const videoItems = media.filter((item) => String(item.type || '').toLowerCase() === 'video');
    const images = media.filter((item) => String(item.type || '').toLowerCase() === 'image').map((item) => item.url).filter(Boolean);
    const videos = [];
    if (post.video_url) {
      videos.push({
        contentLoc: post.video_url,
        thumbnailLoc: post.thumbnail_url || videoItems[0]?.thumbnailUrl,
        title: post.video_title || String(post.body || 'QuickChat video').slice(0, 100),
        description: post.video_description || String(post.body || post.video_title || 'Watch this video on QuickChat').slice(0, 500),
        duration: post.duration,
      });
    } else {
      for (const item of videoItems) {
        if (!item.url) continue;
        videos.push({
          contentLoc: item.url,
          thumbnailLoc: item.thumbnailUrl,
          title: String(post.body || 'QuickChat video').slice(0, 100),
          description: String(post.body || 'Watch this video on QuickChat').slice(0, 500),
        });
      }
    }
    addEntry(entries, seen, {
      loc: '/share/post/' + encodeURIComponent(String(post.id)),
      lastmod: post.created_at,
      priority: '0.6',
      changefreq: 'weekly',
      images,
      videos,
    });
  }

  const videos = await db.query(
    `SELECT id, title, description, video_url, thumbnail_url, duration, created_at
       FROM videos
      ORDER BY id ASC`,
  ).catch(() => []);
  for (const video of videos) {
    addEntry(entries, seen, {
      loc: '/share/video/' + encodeURIComponent(String(video.id)),
      lastmod: video.created_at,
      priority: '0.6',
      changefreq: 'weekly',
      images: [video.thumbnail_url].filter(Boolean),
      videos: [{
        contentLoc: video.video_url,
        thumbnailLoc: video.thumbnail_url,
        title: video.title,
        description: video.description || video.title,
        duration: video.duration,
      }],
    });
  }

  for (const item of await getCustomUrls()) {
    addEntry(entries, seen, { loc: item.url, priority: item.priority, changefreq: item.changefreq });
  }
  return entries;
}

async function buildSitemap(req) {
  const origin = originFrom(req);
  const entries = await collectEntries();
  const chunks = [];
  for (let i = 0; i < entries.length; i += MAX_URLS_PER_SITEMAP) chunks.push(entries.slice(i, i + MAX_URLS_PER_SITEMAP));
  return { origin, entries, chunks: chunks.length ? chunks : [[]] };
}

function renderUrlset(origin, entries) {
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
    'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" ' +
    'xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">' +
    entries.map((entry) => urlNode(origin, entry)).join('') + '</urlset>';
}

function renderIndex(origin, chunkCount) {
  const now = new Date().toISOString();
  const nodes = Array.from({ length: chunkCount }, (_, index) =>
    '<sitemap><loc>' + xmlEscape(origin + '/sitemap-' + (index + 1) + '.xml') + '</loc><lastmod>' + xmlEscape(now) + '</lastmod></sitemap>',
  ).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + nodes + '</sitemapindex>';
}

function renderDocument(sitemap) {
  if (sitemap.chunks.length === 1) return renderUrlset(sitemap.origin, sitemap.entries);
  return renderIndex(sitemap.origin, sitemap.chunks.length);
}

module.exports = { buildSitemap, renderIndex, renderUrlset, renderDocument };
