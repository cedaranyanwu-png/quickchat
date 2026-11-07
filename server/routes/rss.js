const express = require('express');
const { db, asyncRoute, clampLimit, notFound, uniqueConstraint } = require('./utils');
const { fetchFeed, validateFeedUrl, syncSource } = require('../services/rss-service');

const router = express.Router();
const allowedActions = new Set(['view', 'click', 'share']);

function isRssAdmin(userId) {
  const ids = String(process.env.RSS_ADMIN_USER_IDS || '').split(',').map((value) => Number(value.trim()))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
  return ids.includes(Number(userId));
}

function requireRssAdmin(req, res, next) {
  if (!isRssAdmin(req.user.id)) return res.status(403).json({ message: 'RSS administration is restricted to configured administrators.' });
  return next();
}

function parseArray(value) {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function mapArticle(row) {
  return {
    id: Number(row.id),
    title: row.title,
    excerpt: row.excerpt || '',
    publisher: row.publisher || row.source_name || 'Publisher',
    publisherName: row.source_name || row.publisher || 'Publisher',
    articleUrl: row.article_url,
    imageUrl: row.image_url || null,
    category: row.category || 'News',
    keywords: parseArray(row.keywords),
    publishedAt: row.published_at || row.imported_at,
    importedAt: row.imported_at,
    sourceId: Number(row.source_id),
    saved: Boolean(Number(row.saved || 0)),
  };
}

router.get('/rss/articles', asyncRoute(async (req, res) => {
  const limit = clampLimit(req.query.limit, 20, 50);
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const offset = (page - 1) * limit;
  const category = String(req.query.category || '').trim().slice(0, 80);
  const query = String(req.query.q || '').trim().slice(0, 100);
  const conditions = ['a.status = ?'];
  const params = ['published'];
  conditions.push('NOT EXISTS (SELECT 1 FROM hidden_rss_sources h WHERE h.user_id = ? AND h.source_id = a.source_id)');
  params.push(req.user.id);
  if (category) { conditions.push('LOWER(a.category) = LOWER(?)'); params.push(category); }
  if (query) {
    conditions.push('(LOWER(a.title) LIKE LOWER(?) OR LOWER(COALESCE(a.excerpt, \'\')) LIKE LOWER(?) OR LOWER(COALESCE(a.publisher, \'\')) LIKE LOWER(?))');
    const term = '%' + query + '%';
    params.push(term, term, term);
  }
  const where = conditions.join(' AND ');
  const rows = await db.query(
    'SELECT a.*, s.name AS source_name, EXISTS(SELECT 1 FROM saved_articles sa WHERE sa.article_id = a.id AND sa.user_id = ?) AS saved FROM rss_articles a JOIN rss_sources s ON s.id = a.source_id WHERE ' +
      where + ' ORDER BY COALESCE(a.published_at, a.imported_at) DESC, a.id DESC LIMIT ? OFFSET ?',
    [req.user.id, ...params, limit, offset],
  );
  const count = await db.getOne(
    'SELECT COUNT(*) AS total FROM rss_articles a JOIN rss_sources s ON s.id = a.source_id WHERE ' + where,
    params,
  );
  res.json({ articles: rows.map(mapArticle), page, limit, total: Number(count && count.total || 0), hasMore: offset + rows.length < Number(count && count.total || 0) });
}));

router.post('/rss/articles/:articleId/interactions', asyncRoute(async (req, res) => {
  const articleId = positiveId(req.params.articleId);
  const action = String(req.body && req.body.action || '').trim().toLowerCase();
  const dwellMs = Math.max(0, Math.min(120000, Number(req.body && req.body.dwellMs) || 0));
  if (!articleId || !allowedActions.has(action)) return res.status(400).json({ message: 'A valid article and interaction action are required.' });
  const article = await db.getOne('SELECT id FROM rss_articles WHERE id = ? AND status = ?', [articleId, 'published']);
  if (!article) return notFound(res, 'Article not found.');
  await db.insert('INSERT INTO article_interactions (article_id, user_id, action, dwell_ms) VALUES (?, ?, ?, ?)', [articleId, req.user.id, action, dwellMs]);
  res.status(201).json({ success: true });
}));

router.post('/rss/articles/:articleId/save', asyncRoute(async (req, res) => {
  const articleId = positiveId(req.params.articleId);
  const article = articleId ? await db.getOne('SELECT id FROM rss_articles WHERE id = ? AND status = ?', [articleId, 'published']) : null;
  if (!article) return notFound(res, 'Article not found.');
  try { await db.insert('INSERT INTO saved_articles (user_id, article_id) VALUES (?, ?)', [req.user.id, articleId]); }
  catch (error) { if (!uniqueConstraint(error)) throw error; }
  res.json({ saved: true });
}));

router.delete('/rss/articles/:articleId/save', asyncRoute(async (req, res) => {
  const articleId = positiveId(req.params.articleId);
  if (!articleId) return res.status(400).json({ message: 'Invalid article ID.' });
  await db.delete('DELETE FROM saved_articles WHERE user_id = ? AND article_id = ?', [req.user.id, articleId]);
  res.json({ saved: false });
}));

router.get('/rss/saved-articles', asyncRoute(async (req, res) => {
  const rows = await db.query(
    'SELECT a.*, s.name AS source_name, 1 AS saved FROM saved_articles sa JOIN rss_articles a ON a.id = sa.article_id JOIN rss_sources s ON s.id = a.source_id WHERE sa.user_id = ? AND a.status = ? ORDER BY sa.created_at DESC LIMIT ?',
    [req.user.id, 'published', clampLimit(req.query.limit, 30, 100)],
  );
  res.json({ articles: rows.map(mapArticle) });
}));

router.post('/rss/sources/:sourceId/hide', asyncRoute(async (req, res) => {
  const sourceId = positiveId(req.params.sourceId);
  const source = sourceId ? await db.getOne('SELECT id FROM rss_sources WHERE id = ?', [sourceId]) : null;
  if (!source) return notFound(res, 'Publisher not found.');
  try { await db.insert('INSERT INTO hidden_rss_sources (user_id, source_id) VALUES (?, ?)', [req.user.id, sourceId]); }
  catch (error) { if (!uniqueConstraint(error)) throw error; }
  res.json({ hidden: true });
}));

router.post('/rss/articles/:articleId/discuss', asyncRoute(async (req, res) => {
  const articleId = positiveId(req.params.articleId);
  const commentary = String(req.body && req.body.commentary || '').trim();
  if (!articleId || !commentary || commentary.length > 3000) {
    return res.status(400).json({ message: 'Add commentary of 1 to 3,000 characters.' });
  }
  const article = await db.getOne(
    'SELECT a.id, a.title, a.article_url, a.publisher, a.category FROM rss_articles a WHERE a.id = ? AND a.status = ?',
    [articleId, 'published'],
  );
  if (!article) return notFound(res, 'Article not found.');
  const existing = await db.getOne('SELECT post_id FROM rss_article_discussions WHERE article_id = ? AND user_id = ?', [articleId, req.user.id]);
  if (existing) return res.json({ postId: Number(existing.post_id), alreadyDiscussed: true });
  const post = await db.insert(
    'INSERT INTO posts (author_id, body, kind, category, visibility, source_link) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.id, commentary, 'text', article.category || 'News', 'public', article.article_url],
  );
  try {
    await db.insert('INSERT INTO rss_article_discussions (article_id, user_id, post_id) VALUES (?, ?, ?)', [articleId, req.user.id, post.id]);
  } catch (error) {
    if (!uniqueConstraint(error)) throw error;
    const raced = await db.getOne('SELECT post_id FROM rss_article_discussions WHERE article_id = ? AND user_id = ?', [articleId, req.user.id]);
    if (raced) return res.json({ postId: Number(raced.post_id), alreadyDiscussed: true });
    throw error;
  }
  res.status(201).json({
    postId: Number(post.id),
    alreadyDiscussed: false,
    article: { title: article.title, publisher: article.publisher, articleUrl: article.article_url },
  });
}));

router.use('/rss/admin', requireRssAdmin);

router.get('/rss/admin/sources', asyncRoute(async (_req, res) => {
  const rows = await db.query(
    'SELECT s.*, (SELECT COUNT(*) FROM rss_articles a WHERE a.source_id = s.id) AS article_count FROM rss_sources s ORDER BY s.name ASC',
  );
  res.json({ sources: rows.map((row) => ({ ...row, categories: parseArray(row.categories), articleCount: Number(row.article_count || 0) })) });
}));

router.post('/rss/admin/sources/test', asyncRoute(async (req, res) => {
  const feedUrl = String(req.body && req.body.feedUrl || '').trim();
  await validateFeedUrl(feedUrl);
  const result = await fetchFeed(feedUrl);
  res.json({ valid: true, publisher: String(result.parsed.title || '').slice(0, 150), itemCount: result.items.length, sampleTitles: result.items.slice(0, 5).map((item) => String(item.title || '').slice(0, 180)) });
}));

router.post('/rss/admin/sources', asyncRoute(async (req, res) => {
  const name = String(req.body && req.body.name || '').trim().slice(0, 150);
  const feedUrl = String(req.body && req.body.feedUrl || '').trim();
  const categories = Array.isArray(req.body && req.body.categories) ? req.body.categories.map((value) => String(value).trim().slice(0, 80)).filter(Boolean).slice(0, 12) : [];
  if (!name) return res.status(400).json({ message: 'Publisher name is required.' });
  const test = await fetchFeed(feedUrl);
  const enabled = req.body && req.body.enabled ? 1 : 0;
  const row = await db.insert(
    'INSERT INTO rss_sources (name, feed_url, publisher_name, publisher_url, region, categories, enabled, auto_sync, sync_interval_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [name, feedUrl, String(test.parsed.title || name).slice(0, 150), String(req.body && req.body.publisherUrl || '').slice(0, 512) || null,
      String(req.body && req.body.region || '').slice(0, 40) || null, JSON.stringify(categories), enabled,
      req.body && req.body.autoSync === false ? 0 : 1, Math.max(10, Math.min(60, Number(req.body && req.body.syncIntervalMinutes) || 15))],
  );
  res.status(201).json({ source: row, test: { itemCount: test.items.length, publisher: test.parsed.title || name } });
}));

router.patch('/rss/admin/sources/:sourceId', asyncRoute(async (req, res) => {
  const sourceId = positiveId(req.params.sourceId);
  const source = sourceId ? await db.getOne('SELECT * FROM rss_sources WHERE id = ?', [sourceId]) : null;
  if (!source) return notFound(res, 'RSS source not found.');
  const feedUrl = req.body && req.body.feedUrl !== undefined ? String(req.body.feedUrl).trim() : source.feed_url;
  const name = String(req.body && req.body.name !== undefined ? req.body.name : source.name).trim().slice(0, 150);
  if (!name) return res.status(400).json({ message: 'Publisher name is required.' });
  let publisher = source.publisher_name;
  if (feedUrl !== source.feed_url || (req.body && req.body.enabled)) {
    const test = await fetchFeed(feedUrl);
    publisher = String(test.parsed.title || name).slice(0, 150);
  } else {
    await validateFeedUrl(feedUrl);
  }
  const categories = req.body && Array.isArray(req.body.categories) ? req.body.categories : parseArray(source.categories);
  const enabled = req.body && req.body.enabled !== undefined ? (req.body.enabled ? 1 : 0) : Number(source.enabled);
  const autoSync = req.body && req.body.autoSync !== undefined ? (req.body.autoSync ? 1 : 0) : Number(source.auto_sync);
  await db.update(
    'UPDATE rss_sources SET name = ?, feed_url = ?, publisher_name = ?, categories = ?, enabled = ?, auto_sync = ?, sync_interval_minutes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, feedUrl, publisher, JSON.stringify(categories), enabled, autoSync,
      Math.max(10, Math.min(60, Number(req.body && req.body.syncIntervalMinutes) || Number(source.sync_interval_minutes) || 15)), sourceId],
  );
  res.json({ success: true });
}));

router.delete('/rss/admin/sources/:sourceId', asyncRoute(async (req, res) => {
  const sourceId = positiveId(req.params.sourceId);
  if (!sourceId) return res.status(400).json({ message: 'Invalid source ID.' });
  await db.update('UPDATE rss_sources SET enabled = 0, auto_sync = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [sourceId]);
  res.json({ disabled: true });
}));

router.post('/rss/admin/sources/:sourceId/sync', asyncRoute(async (req, res) => {
  const sourceId = positiveId(req.params.sourceId);
  if (!sourceId) return res.status(400).json({ message: 'Invalid source ID.' });
  const result = await syncSource(sourceId, { force: true });
  res.json(result);
}));

router.get('/rss/admin/logs', asyncRoute(async (req, res) => {
  const sourceId = positiveId(req.query.sourceId);
  const status = String(req.query.status || '').trim();
  const conditions = [];
  const params = [];
  if (sourceId) { conditions.push('source_id = ?'); params.push(sourceId); }
  if (['success', 'unchanged', 'failed'].includes(status)) { conditions.push('status = ?'); params.push(status); }
  const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
  const logs = await db.query('SELECT * FROM rss_sync_logs' + where + ' ORDER BY id DESC LIMIT ?', [...params, clampLimit(req.query.limit, 50, 200)]);
  res.json({ logs });
}));

module.exports = router;
