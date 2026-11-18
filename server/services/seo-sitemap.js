const { db } = require('../routes/utils');
const { getSetting } = require('../platform-settings');

function xmlEscape(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;',
  }[character]));
}

function originFrom(req) {
  const configured = String(process.env.PUBLIC_APP_URL || '').trim();
  try {
    return new URL(configured || `${req.protocol}://${req.get('host')}`).origin;
  } catch (_error) {
    return `${req.protocol}://${req.get('host')}`;
  }
}

function absoluteUrl(origin, value) {
  try { return new URL(value, origin).toString(); } catch (_error) { return ''; }
}

function lastmod(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
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
    '</url>',
  ];
  return parts.filter(Boolean).join('');
}

async function getCustomUrls() {
  const raw = await getSetting('seo_sitemap_custom_urls', '[]');
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.map((item) => ({
      url: String(item?.url || '').trim(),
      priority: String(item?.priority || '0.5'),
      changefreq: String(item?.changefreq || 'weekly'),
    })).filter((item) => item.url).slice(0, 5000) : [];
  } catch (_error) {
    return [];
  }
}

async function collectEntries() {
  const entries = [
    { loc: '/', priority: '1.0', changefreq: 'daily' },
    { loc: '/explore', priority: '0.8', changefreq: 'daily' },
    { loc: '/discover', priority: '0.7', changefreq: 'daily' },
    { loc: '/communities', priority: '0.7', changefreq: 'daily' },
  ];

  // Every normal public user profile is automatically discoverable.
  const users = await db.query(
    `SELECT username, COALESCE(updated_at, created_at, createdat) AS lastmod
       FROM users
      WHERE COALESCE(username, '') <> ''
        AND COALESCE(is_synthetic, 0) = 0
        AND username NOT LIKE 'qc-admin-actor-%'
      ORDER BY id ASC`,
  );
  for (const user of users) {
    entries.push({
      loc: `/profile/${encodeURIComponent(String(user.username).replace(/^@/, ''))}`,
      lastmod: user.lastmod,
      priority: '0.7',
      changefreq: 'weekly',
    });
  }

  // Channels, pages and communities are represented by public QuickChat spaces.
  const spaces = await db.query(
    `SELECT id, slug, name, space_type, created_at
       FROM communities
      WHERE COALESCE(slug, '') <> ''
        AND COALESCE(is_suspended, 0) = 0
      ORDER BY id ASC`,
  ).catch(() => []);
  for (const space of spaces) {
    entries.push({
      loc: `/communities/${encodeURIComponent(String(space.id))}`,
      lastmod: space.created_at,
      priority: '0.7',
      changefreq: 'daily',
    });
  }

  // Public, non-paywalled posts get their own crawlable share URL.
  const posts = await db.query(
    `SELECT p.id, p.created_at
       FROM posts p
      WHERE p.visibility = 'public'
        AND p.community_id IS NULL
      ORDER BY p.id ASC`,
  ).catch(() => []);
  for (const post of posts) {
    entries.push({
      loc: `/share/post/${encodeURIComponent(String(post.id))}`,
      lastmod: post.created_at,
      priority: '0.5',
      changefreq: 'weekly',
    });
  }

  const custom = await getCustomUrls();
  for (const item of custom) entries.push({
    loc: item.url,
    priority: item.priority,
    changefreq: item.changefreq,
  });

  return entries;
}

async function buildSitemap(req) {
  const origin = originFrom(req);
  const entries = await collectEntries();
  const maxUrls = 45000;
  const chunks = [];
  for (let i = 0; i < entries.length; i += maxUrls) chunks.push(entries.slice(i, i + maxUrls));

  return {
    origin,
    entries,
    chunks,
  };
}

function renderUrlset(origin, entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map((entry) => urlNode(origin, entry)).join('')}</urlset>`;
}

function renderIndex(origin, chunkCount) {
  const now = new Date().toISOString();
  const nodes = Array.from({ length: chunkCount }, (_, index) =>
    `<sitemap><loc>${xmlEscape(`${origin}/sitemap-${index + 1}.xml`)}</loc><lastmod>${xmlEscape(now)}</lastmod></sitemap>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${nodes}</sitemapindex>`;
}

module.exports = {
  buildSitemap,
  renderIndex,
  renderUrlset,
};
