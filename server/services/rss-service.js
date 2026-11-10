const dns = require('node:dns').promises;
const crypto = require('node:crypto');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');
const db = require('../database');

const MAX_FEED_BYTES = positiveInteger(process.env.RSS_MAX_FEED_BYTES, 2 * 1024 * 1024);
const REQUEST_TIMEOUT_MS = positiveInteger(process.env.RSS_REQUEST_TIMEOUT_MS, 12000);
const MAX_ITEMS_PER_SYNC = positiveInteger(process.env.RSS_MAX_ITEMS_PER_SYNC, 60);
const USER_AGENT = 'QuickChatRSS/1.0 (+https://quickchat.app; feed reader)';
const parser = new Parser({ timeout: REQUEST_TIMEOUT_MS, customFields: { item: [
  ['content:encoded', 'contentEncoded'], ['media:content', 'mediaContent'], ['media:thumbnail', 'mediaThumbnail'],
] } });

function positiveInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const parts = address.split('.').map(Number);
    const a = parts[0], b = parts[1];
    const third = parts[2];
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 2 || b === 88 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0) ||
      (a === 192 && b === 0 && third === 0);
  }
  if (family === 6) {
    const value = address.toLowerCase();
    return value === '::' || value === '::1' || value.startsWith('::ffff:') || value.startsWith('ff') || value.startsWith('fc') ||
      value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') ||
      value.startsWith('fea') || value.startsWith('feb') || value.startsWith('::ffff:127.') ||
      value.startsWith('::ffff:10.') || value.startsWith('::ffff:192.168.') || value.startsWith('2001:db8:');
  }
  return true;
}

async function validateFeedUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('Enter a valid RSS feed URL.'); }
  if (url.toString().length > 512) throw new Error('RSS feed URL must be 512 characters or fewer.');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('RSS feeds must use HTTP or HTTPS and cannot contain credentials.');
  }
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Only standard HTTP and HTTPS ports are allowed.');
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') ||
      hostname.endsWith('.internal') || hostname.endsWith('.localhost.localdomain')) {
    throw new Error('Local and internal network addresses cannot be used as RSS sources.');
  }
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error('Private and reserved IP addresses cannot be used as RSS sources.');
    return { url, hostname, address: hostname, family: net.isIP(hostname) };
  }
  let addresses;
  try { addresses = await dns.lookup(hostname, { all: true, verbatim: true }); }
  catch { throw new Error('The RSS hostname could not be resolved.'); }
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('RSS sources must resolve only to public IP addresses.');
  }
  const selected = addresses.find((entry) => entry.family === 4) || addresses[0];
  return { url, hostname, address: selected.address, family: selected.family };
}

function createPinnedAgent(protocol, hostname, address, family) {
  const lookup = (requestedHost, options, callback) => {
    if (requestedHost !== hostname) return dns.lookup(requestedHost, options, callback);
    if (options && options.all) return callback(null, [{ address, family }]);
    return callback(null, address, family);
  };
  const Agent = protocol === 'https:' ? https.Agent : http.Agent;
  return new Agent({ keepAlive: false, lookup, rejectUnauthorized: true });
}

async function fetchFeed(feedUrl, validators = {}) {
  const target = await validateFeedUrl(feedUrl);
  const agent = createPinnedAgent(target.url.protocol, target.hostname, target.address, target.family);
  try {
    const response = await axios.get(target.url.toString(), {
      timeout: REQUEST_TIMEOUT_MS, maxRedirects: 0, maxContentLength: MAX_FEED_BYTES,
      maxBodyLength: MAX_FEED_BYTES, responseType: 'text', transformResponse: [(body) => body],
      httpAgent: target.url.protocol === 'http:' ? agent : undefined,
      httpsAgent: target.url.protocol === 'https:' ? agent : undefined,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
        ...(validators.etag ? { 'If-None-Match': validators.etag } : {}),
        ...(validators.lastModified ? { 'If-Modified-Since': validators.lastModified } : {}),
      },
      validateStatus: (status) => status === 200 || status === 304,
    });
    if (response.status === 304) return { notModified: true, headers: response.headers, items: [] };
    const body = String(response.data || '');
    if (Buffer.byteLength(body, 'utf8') > MAX_FEED_BYTES) throw new Error('RSS response exceeded the configured size limit.');
    const parsed = await parser.parseString(body);
    return { parsed, headers: response.headers, items: Array.isArray(parsed.items) ? parsed.items.slice(0, MAX_ITEMS_PER_SYNC) : [] };
  } finally { agent.destroy(); }
}

async function fetchFeedWithRetry(feedUrl, validators = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { return await fetchFeed(feedUrl, validators); }
    catch (error) {
      lastError = error;
      const status = Number(error && error.response && error.response.status || 0);
      if (attempt === 3 || (status && status < 500 && status !== 429)) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

function plainExcerpt(value, maxLength = 420) {
  const $ = cheerio.load(String(value || ''));
  $('script, style, iframe, object, embed, form, noscript').remove();
  const text = $.root().text().replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength - 1).trimEnd() + '…' : text;
}

function validExternalUrl(value, allowHttp = true) {
  try {
    const url = new URL(String(value || '').trim());
    if (!(allowHttp ? ['http:', 'https:'] : ['https:']).includes(url.protocol)) return null;
    if (url.username || url.password || url.hostname === 'localhost') return null;
    return url.toString().slice(0, 2048);
  } catch { return null; }
}

async function isPublicExternalUrl(value) {
  let url;
  try { url = new URL(value); } catch { return false; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;
  if (net.isIP(hostname)) return !isPrivateAddress(hostname);
  try {
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every((entry) => !isPrivateAddress(entry.address));
  } catch { return false; }
}

function mediaCandidates(item) {
  const values = [];
  const add = (value) => {
    if (!value) return;
    if (Array.isArray(value)) value.forEach(add);
    else if (typeof value === 'object') {
      const attrs = value.$ || value;
      add(attrs.url || attrs.href);
    } else if (typeof value === 'string') values.push(value);
  };
  add(item.enclosure);
  add(item.enclosures);
  add(item.image);
  add(item.mediaThumbnail);
  add(item.mediaContent);
  add(item['media:thumbnail']);
  add(item['media:content']);
  add(item['media:group']);
  const html = String(item.contentEncoded || item.content || item.description || '');
  const $ = cheerio.load(html);
  $('img[src], video[src], source[src]').each((_index, element) => add($(element).attr('src')));
  return [...new Set(values.map((value) => validExternalUrl(value, false)).filter(Boolean))];
}

function mediaTypeFromUrl(value) {
  const lower = String(value || '').toLowerCase();
  return /\\.(mp4|webm|mov|m4v|m3u8)(?:[?#]|$)/i.test(lower) ? 'video' : 'image';
}

async function itemMedia(item) {
  const urls = mediaCandidates(item);
  const media = [];
  for (const url of urls) {
    if (!await isPublicExternalUrl(url)) continue;
    media.push({ type: mediaTypeFromUrl(url), url });
  }
  const image = media.find((entry) => entry.type === 'image') || null;
  const video = media.find((entry) => entry.type === 'video') || null;
  return {
    imageUrl: image?.url || null,
    media: media.slice(0, 6),
    videoUrl: video?.url || null,
  };
}

async function itemImage(item) {
  return (await itemMedia(item)).imageUrl;
}

  const candidates = [
    item.enclosure && item.enclosure.url, item.image && item.image.url,
    item.mediaThumbnail && item.mediaThumbnail.$ && item.mediaThumbnail.$.url,
    item.mediaContent && item.mediaContent.$ && item.mediaContent.$.url,
    item['media:thumbnail'] && item['media:thumbnail'].$ && item['media:thumbnail'].$.url,
    item['media:content'] && item['media:content'].$ && item['media:content'].$.url,
  ];
  const html = String(item.contentEncoded || item.content || item.description || '');
  const match = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  if (match) candidates.push(match[1]);
  for (const candidate of candidates) {
    const safeUrl = validExternalUrl(candidate, false);
    if (safeUrl && await isPublicExternalUrl(safeUrl)) return safeUrl;
  }
  return null;
}

function normalizedUrlForHash(value) {
  const url = new URL(value);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  return url.toString().replace(/\/$/, '');
}

function normalizedGuid(item, articleUrl) {
  return String(item.guid || item.id || '').trim().slice(0, 512) || articleUrl;
}

function parsePublishedAt(item) {
  const raw = item.isoDate || item.pubDate || item.published || item.updated || '';
  const date = raw ? new Date(raw) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function parseJson(value, fallback) {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : fallback; }
  catch { return fallback; }
}

function isUniqueViolation(error) {
  return ['23505', 'SQLITE_CONSTRAINT', 'ER_DUP_ENTRY'].includes(error && error.code) ||
    /unique constraint|duplicate key|duplicate entry/i.test(String(error && error.message || ''));
}

async function logSync(sourceId, status, counts, error, startedAt) {
  await db.insert(
    'INSERT INTO rss_sync_logs (source_id, status, fetched_count, imported_count, duplicate_count, error_message, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
    [sourceId, status, counts.fetched || 0, counts.imported || 0, counts.duplicates || 0,
      error ? String(error.message || error).slice(0, 1000) : null, startedAt],
  );
}

const RSS_PUBLISHER_EMAIL = 'quickchat-rss@quickchat.app';
const RSS_PUBLISHER_USERNAME = 'quickchat-rss';

async function ensureRssPublisher() {
  let publisher = await db.getOne('SELECT id FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) ORDER BY id ASC LIMIT 1', [RSS_PUBLISHER_USERNAME, RSS_PUBLISHER_EMAIL]);
  if (publisher) return Number(publisher.id);
  const created = await db.insert(
    'INSERT INTO users (fullname, name, username, email, password, bio, verified, is_synthetic) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ['QuickChat RSS', 'QuickChat RSS', RSS_PUBLISHER_USERNAME, RSS_PUBLISHER_EMAIL, null,
      'Official RSS publisher for news and updates shared from approved feeds on QuickChat.', 0, 0],
  );
  console.log('[RSS] Publisher profile ready: @' + RSS_PUBLISHER_USERNAME + ' (user ' + created.id + ').');
  return Number(created.id);
}

async function publishArticleToFeed(article) {
  if (!article || !article.id || !article.article_url || !article.title) return false;
  const existing = await db.getOne(
    'SELECT id FROM posts WHERE rss_article_id = ? OR source_link = ? LIMIT 1',
    [article.id, article.article_url],
  );
  if (existing) return false;
  const publisherId = await ensureRssPublisher();
  const body = String(article.excerpt || article.title).trim().slice(0, 5000);
  const articleMedia = parseJson(article.media, []);
  await db.insert(
    'INSERT INTO posts (author_id, body, kind, category, media, source_link, rss_article_id, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [publisherId, body || article.title, articleMedia.length ? 'media' : 'text', article.category || 'News',
      articleMedia.length ? JSON.stringify(articleMedia) : null, article.article_url, article.id, 'public'],
  );
  return true;
}

async function publishExistingArticles(sourceId) {
  const publisherId = await ensureRssPublisher();
  const rows = await db.query(
    'SELECT a.id, a.article_url, a.title, a.excerpt, a.category FROM rss_articles a WHERE a.source_id = ? AND a.status = ? AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.rss_article_id = a.id OR p.source_link = a.article_url) ORDER BY COALESCE(a.published_at, a.imported_at) DESC, a.id DESC',
    [sourceId, 'published'],
  );
  let published = 0;
  for (const article of rows) {
    const body = String(article.excerpt || article.title).trim().slice(0, 5000);
    const articleMedia = parseJson(article.media, []);
    try {
      await db.insert(
        'INSERT INTO posts (author_id, body, kind, category, media, source_link, rss_article_id, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [publisherId, body || article.title, articleMedia.length ? 'media' : 'text', article.category || 'News',
          articleMedia.length ? JSON.stringify(articleMedia) : null, article.article_url, article.id, 'public'],
      );
      published += 1;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  return published;
}

async function syncSource(sourceId, { force = false } = {}) {
  const source = await db.getOne('SELECT * FROM rss_sources WHERE id = ?', [sourceId]);
  if (!source) throw new Error('RSS source not found.');
  if (!Number(source.enabled)) throw new Error('RSS source is disabled.');
  if (!force && !Number(source.auto_sync)) throw new Error('RSS source is not enabled for automatic synchronization.');
  const startedAt = new Date().toISOString();
  const counts = { fetched: 0, imported: 0, duplicates: 0 };
  try {
    const result = await fetchFeedWithRetry(source.feed_url, { etag: source.etag, lastModified: source.last_modified });
    if (result.notModified) {
      const feedPostsPublished = await publishExistingArticles(sourceId);
      await db.update('UPDATE rss_sources SET last_sync_at = CURRENT_TIMESTAMP, last_success_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = ?', [sourceId]);
      await logSync(sourceId, 'unchanged', counts, null, startedAt);
      return { sourceId, ...counts, feedPostsPublished, unchanged: true };
    }
    const publisher = String(result.parsed.title || source.name || 'Publisher').trim().slice(0, 150);
    counts.fetched = result.items.length;
    const sourceCategories = parseJson(source.categories, []);
    for (const item of result.items) {
      const articleUrl = validExternalUrl(item.link || item.url);
      const title = String(item.title || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!articleUrl || !title || !(await isPublicExternalUrl(articleUrl))) continue;
      const guid = normalizedGuid(item, articleUrl);
      const guidHash = crypto.createHash('sha256').update(guid).digest('hex');
      const urlHash = crypto.createHash('sha256').update(normalizedUrlForHash(articleUrl)).digest('hex');
      const excerpt = plainExcerpt(item.contentSnippet || item.contentEncoded || item.content || item.description);
      const articleMedia = await itemMedia(item);
      const imageUrl = articleMedia.imageUrl;
      const category = String(item.categories && item.categories[0] || sourceCategories[0] || 'News').slice(0, 80);
      const keywords = [...new Set([...(item.categories || []), ...title.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3)])].slice(0, 24);
      try {
        await db.insert(
          'INSERT INTO rss_articles (source_id, publisher, guid, guid_hash, url_hash, article_url, title, excerpt, image_url, media, category, keywords, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [sourceId, publisher, guid, guidHash, urlHash, articleUrl, title, excerpt || null, imageUrl, JSON.stringify(articleMedia.media), category, JSON.stringify(keywords), parsePublishedAt(item)],
        );
        counts.imported += 1;
      } catch (error) {
        if (isUniqueViolation(error)) counts.duplicates += 1;
        else throw error;
      }
    }
    const feedPostsPublished = await publishExistingArticles(sourceId);
    await db.update(
      'UPDATE rss_sources SET publisher_name = ?, etag = ?, last_modified = ?, last_sync_at = CURRENT_TIMESTAMP, last_success_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = ?',
      [publisher, result.headers.etag || source.etag || null, result.headers['last-modified'] || source.last_modified || null, sourceId],
    );
    await logSync(sourceId, 'success', counts, null, startedAt);
    return { sourceId, ...counts, feedPostsPublished, unchanged: false };
  } catch (error) {
    await db.update('UPDATE rss_sources SET last_sync_at = CURRENT_TIMESTAMP, last_error = ? WHERE id = ?', [String(error.message || error).slice(0, 1000), sourceId]);
    await logSync(sourceId, 'failed', counts, error, startedAt);
    throw error;
  }
}

async function syncEnabledSources({ force = false } = {}) {
  const sources = await db.query(
    'SELECT id, last_sync_at, sync_interval_minutes FROM rss_sources WHERE enabled = 1 AND (? = 1 OR auto_sync = 1) ORDER BY last_sync_at ASC, id ASC',
    [force ? 1 : 0],
  );
  const results = [];
  for (const source of sources) {
    const lastSync = source.last_sync_at ? new Date(source.last_sync_at).getTime() : 0;
    const intervalMs = Math.max(10, Number(source.sync_interval_minutes) || 15) * 60 * 1000;
    if (!force && lastSync && Date.now() - lastSync < intervalMs) continue;
    try { results.push({ success: true, ...(await syncSource(source.id, { force })) }); }
    catch (error) { results.push({ success: false, sourceId: source.id, error: String(error.message || error) }); }
  }
  return results;
}

module.exports = { fetchFeed, fetchFeedWithRetry, validateFeedUrl, plainExcerpt, syncSource, syncEnabledSources, validExternalUrl, ensureRssPublisher, publishExistingArticles };
