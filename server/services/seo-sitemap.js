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
  try {
    return new URL(configured || `${req.protocol}://${req.get('host')}`).origin.replace(/\/$/, '');
  } catch (_error) {
    return `${req.protocol}://${req.get('host')}`.replace(/\/$/, '');
  }
}

function absoluteUrl(origin, value) {
  try {
    const url = new URL(String(value || '').trim(), origin);
    if (url.origin !== origin) return '';
    return url.toString();
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

function urlNode(origin, entry) {
  const loc = absoluteUrl(origin, entry.loc);
  if (!loc) return '';
  const parts = [
    '<url>',
    `<loc>${xmlEscape(loc)}</loc>`,
    entry.lastmod ? `<lastmod>${xmlEscape(lastmod(entry.lastmod))}</lastmod>` : '',
    entry.changefreq ? `<changefreq>${xmlEscape(entry.changefreq)}</changefreq>` : '',
    entry.priority ? `<priority>${xmlEscape(entry.priority)}</priority>` : '',
    ...(Array.isArray(entry.images) ? entry.images.slice(0, 10).map((image) => {
      const imageUrl = absoluteUrl(origin, image);
      return imageUrl ? `<image:image><image:loc>${xmlEscape(imageUrl)}</image:loc></image:image>` : '';
    }).filter(Boolean) : []),
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

async function collectEntries() {
  const entries = [];
  const seen = new Set();

  // Only public routes that have an actual QuickChat destination.
  addEntry(entries, seen, { loc: '/', priority: '1.0', changefreq: 'daily' });
  addEntry(entries, seen, { loc: '/explore', priority: '0.8', changefreq: 'daily' });
  addEntry(entries, seen, { loc: '/communities', priority: '0.7', changefreq: 'daily' });
  addEntry(entries, seen, { loc: '/creator-program', priority: '0.7', changefreq: 'weekly' });
  addEntry(entries, seen, { loc: '/about', priority: '0.8', changefreq: 'monthly' });

  // Public human profiles.
  const users = await db.query(
    `SELECT username, avatar_url, picture, cover_url, COALESCE(created_at, createdat) AS lastmod
       FROM users
      WHERE COALESCE(username, '') <> ''
        AND COALESCE(is_synthetic, 0) = 0
        AND username NOT LIKE 'qc-admin-actor-%'
      ORDER BY id ASC`,
  );
  for (const user of users) {
    addEntry(entries, seen, {
      loc: `/profile/${encodeURIComponent(String(user.username).replace(/^@/, ''))}`,
      lastmod: user.lastmod,
      priority: '0.7',
      changefreq: 'weekly',
      images: [user.avatar_url || user.picture, user.cover_url].filter(Boolean),
    });
  }

  // Public communities/pages/channels currently use the CommunityFeed route.
  const spaces = await db.query(
    `SELECT id, slug, name, space_type, created_at
       FROM communities
      WHERE COALESCE(slug, '') <> ''
      ORDER BY id ASC`,
  ).catch(() => []);
  for (const space of spaces) {
    addEntry(entries, seen, {
      loc: `/communities/${encodeURIComponent(String(space.id))}`,
      lastmod: space.created_at,
      priority: '0.7',
      changefreq: 'daily',
    });
  }

  // Public posts have a server-rendered share page.
  const posts = await db.query(
    `SELECT p.id, p.media, p.created_at
       FROM posts p
      WHERE LOWER(COALESCE(p.visibility, 'public')) = 'public'
      ORDER BY p.id ASC`,
  ).catch(() => []);
  for (const post of posts) {
    addEntry(entries, seen, {
      loc: `/share/post/${encodeURIComponent(String(post.id))}`,
      lastmod: post.created_at,
      priority: '0.5',
      changefreq: 'weekly',
      images: (() => {
        try {
          return (JSON.parse(String(post.media || '[]')) || [])
            .map((item) => item?.url || item?.thumbnailUrl)
            .filter(Boolean);
        } catch (_error) { return []; }
      })(),
    });
  }

  // Public video share pages.
  const videos = await db.query(
    `SELECT id, thumbnail_url, created_at FROM videos ORDER BY id ASC`,
  ).catch(() => []);
  for (const video of videos) {
    addEntry(entries, seen, {
      loc: `/share/video/${encodeURIComponent(String(video.id))}`,
      lastmod: video.created_at,
      priority: '0.5',
      changefreq: 'weekly',
      images: [video.thumbnail_url].filter(Boolean),
    });
  }

  for (const item of await getCustomUrls()) {
    addEntry(entries, seen, {
      loc: item.url,
      priority: item.priority,
      changefreq: item.changefreq,
    });
  }

  return entries;
}

async function buildSitemap(req) {
  const origin = originFrom(req);
  const entries = await collectEntries();
  const chunks = [];
  for (let i = 0; i < entries.length; i += MAX_URLS_PER_SITEMAP) {
    chunks.push(entries.slice(i, i + MAX_URLS_PER_SITEMAP));
  }
  return { origin, entries, chunks: chunks.length ? chunks : [[]] };
}

function renderUrlset(origin, entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${entries.map((entry) => urlNode(origin, entry)).join('')}</urlset>`;
}

function renderIndex(origin, chunkCount) {
  const now = new Date().toISOString();
  const nodes = Array.from({ length: chunkCount }, (_, index) =>
    `<sitemap><loc>${xmlEscape(`${origin}/sitemap-${index + 1}.xml`)}</loc><lastmod>${xmlEscape(now)}</lastmod></sitemap>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${nodes}</sitemapindex>`;
}

function renderDocument(sitemap) {
  // Keep /sitemap.xml itself as the complete URL set while it fits the sitemap limit.
  if (sitemap.chunks.length === 1) return renderUrlset(sitemap.origin, sitemap.entries);
  return renderIndex(sitemap.origin, sitemap.chunks.length);
}

module.exports = { buildSitemap, renderIndex, renderUrlset, renderDocument };
