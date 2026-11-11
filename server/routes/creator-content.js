
const express = require('express');
const db = require('../database');
const { asyncRoute } = require('./utils');
const { analyzeContent } = require('../services/content-classifier');
const { initializeCreatorContentTables } = require('../creator-content-schema');
const schemaReady = initializeCreatorContentTables().catch((error) => { console.error('[Creator Content] Schema initialization failed:', error.message); throw error; });

const router = express.Router();
const clean = (v, max = 5000) => String(v || '').trim().slice(0, max);
const id = (v) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const list = (v, max = 8) => Array.isArray(v) ? [...new Set(v.map(x => clean(x, 80).replace(/^#/, '').toLowerCase()).filter(Boolean))].slice(0, max) : [];
const future = (v) => { const d = new Date(v); return Number.isFinite(d.getTime()) && d.getTime() > Date.now() + 30000 ? d : null; };
const json = (v) => { try { return JSON.parse(v || '[]'); } catch (_) { return []; } };

async function creator(req, res) {
  await schemaReady;
  const row = await db.getOne("SELECT user_id FROM qc_creator_applications WHERE user_id = ? AND status = 'active'", [req.user.id]);
  if (!row) {
    res.status(403).json({ message: 'Creator account access is required.' });
    return false;
  }
  return true;
}

function output(row) {
  return {
    id: Number(row.id), text: row.body || '', media: json(row.media), category: row.category || '',
    hashtags: json(row.hashtags), targetInterests: json(row.target_interests),
    topics: json(row.topics), keywords: json(row.keywords), audienceSignals: json(row.audience_signals),
    destination: row.destination || 'profile', communityId: row.community_id ? Number(row.community_id) : null,
    visibility: row.visibility || 'public', scheduledAt: row.scheduled_at, status: row.status,
    analysisStatus: row.analysis_status, analysis: {
      topics: json(row.topics), keywords: json(row.keywords), audiences: json(row.audience_signals),
      interests: json(row.recommendation_interests)
    },
    createdAt: row.created_at, updatedAt: row.updated_at, publishedPostId: row.published_post_id ? Number(row.published_post_id) : null
  };
}

async function classify(payload) {
  const result = await analyzeContent({
    title: clean(payload.title, 180),
    text: clean(payload.text, 5000),
    caption: clean(payload.text, 5000),
    hashtags: list(payload.hashtags, 10)
  });
  return {
    topics: Array.isArray(result.topics) ? result.topics.slice(0, 6) : [],
    keywords: Array.isArray(result.keywords) ? result.keywords.slice(0, 8) : [],
    audiences: Array.isArray(result.audiences) ? result.audiences.slice(0, 6) : [],
    interests: Array.isArray(result.interests) ? result.interests.slice(0, 8) : []
  };
}

router.get('/creator/content-library', asyncRoute(async (req, res) => {
  if (!await creator(req, res)) return;
  const rows = await db.query(
    'SELECT * FROM qc_scheduled_creator_posts WHERE creator_id = ? ORDER BY CASE status WHEN \'scheduled\' THEN 0 WHEN \'draft\' THEN 1 WHEN \'published\' THEN 2 ELSE 3 END, scheduled_at ASC, id DESC',
    [req.user.id]
  );
  res.json({ items: rows.map(output) });
}));

router.post('/creator/content-library/analyze', asyncRoute(async (req, res) => {
  if (!await creator(req, res)) return;
  const result = await classify(req.body || {});
  res.json({ ...result, readyForRecommendations: Boolean(result.topics.length || result.interests.length || result.keywords.length) });
}));

router.post('/creator/content-library/schedule', asyncRoute(async (req, res) => {
  if (!await creator(req, res)) return;
  const text = clean(req.body?.text, 5000);
  const when = future(req.body?.scheduledAt);
  const media = Array.isArray(req.body?.media) ? req.body.media : [];
  if (!text && !media.length) return res.status(400).json({ message: 'Write a caption or attach media before scheduling.' });
  if (media.length > 10) return res.status(400).json({ message: 'A post can contain up to 10 media items.' });
  const mediaTypes = [...new Set(media.map((item) => String(item?.type || '').toLowerCase()))];
  if (media.some((item) => !item || !['image', 'video'].includes(String(item.type || '').toLowerCase()) || typeof item.url !== 'string' || !/^https?:\\/\\//i.test(item.url))) {
    return res.status(400).json({ message: 'One or more media attachments are invalid. Upload them again.' });
  }
  if (mediaTypes.includes('video') && (media.length !== 1 || mediaTypes.length !== 1)) {
    return res.status(400).json({ message: 'A video post must contain exactly one video. Use a carousel for multiple images.' });
  }
  if (media.length > 1 && mediaTypes.some((type) => type !== 'image')) {
    return res.status(400).json({ message: 'A carousel can contain images only.' });
  }
  if (!when) return res.status(400).json({ message: 'Choose a future publication date and time.' });

  const analysis = await classify(req.body || {});
  const destination = ['profile', 'page', 'community', 'channel'].includes(String(req.body?.destination)) ? String(req.body.destination) : 'profile';
  const communityId = req.body?.communityId ? id(req.body.communityId) : null;
  if (destination === 'community' && !communityId) return res.status(400).json({ message: 'Choose a community for this scheduled post.' });

  const row = await db.insert(
    'INSERT INTO qc_scheduled_creator_posts (creator_id, body, media, category, hashtags, target_interests, topics, keywords, audience_signals, recommendation_interests, destination, community_id, visibility, scheduled_at, status, analysis_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'scheduled\', \'ready\')',
    [
      req.user.id, text, JSON.stringify(media), clean(req.body?.category, 80) || null,
      JSON.stringify(list(req.body?.hashtags, 10)), JSON.stringify(list(req.body?.targetInterests, 8)),
      JSON.stringify(analysis.topics), JSON.stringify(analysis.keywords), JSON.stringify(analysis.audiences),
      JSON.stringify(analysis.interests), destination, communityId,
      ['public', 'fans', 'premium'].includes(req.body?.visibility) ? req.body.visibility : 'public', when.toISOString()
    ]
  );
  res.status(201).json({ message: 'Post scheduled. Recommendation intelligence is ready before publication.', item: output(row) });
}));

router.post('/creator/content-library/:id/cancel', asyncRoute(async (req, res) => {
  if (!await creator(req, res)) return;
  const changed = await db.update('UPDATE qc_scheduled_creator_posts SET status = \'cancelled\', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND creator_id = ? AND status = \'scheduled\'', [id(req.params.id), req.user.id]);
  if (!changed) return res.status(404).json({ message: 'Scheduled post was not found or is no longer active.' });
  res.json({ message: 'Scheduled post cancelled.' });
}));

router.post('/creator/content-library/:id/publish-now', asyncRoute(async (req, res) => {
  if (!await creator(req, res)) return;
  const row = await db.getOne('SELECT * FROM qc_scheduled_creator_posts WHERE id = ? AND creator_id = ?', [id(req.params.id), req.user.id]);
  if (!row || !['scheduled', 'draft'].includes(row.status)) return res.status(404).json({ message: 'Scheduled content was not found.' });
  const result = await publishScheduledPost(row);
  res.json(result);
}));

async function publishScheduledPost(row) {
  const media = json(row.media);
  const kind = media.some(m => m && m.type === 'video') ? 'video' : media.length ? 'image' : 'text';
  const inserted = await db.insert(
    'INSERT INTO posts (author_id, body, kind, category, hashtags, target_interests, community_id, media, visibility, topics, keywords, audience_signals) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [row.creator_id, row.body || '', kind, row.category || null, row.hashtags || '[]', row.target_interests || '[]', row.community_id || null, row.media || '[]', row.visibility || 'public', row.topics || '[]', row.keywords || '[]', row.audience_signals || '[]']
  );
  const postId = Number(inserted?.id);
  if (!postId) throw new Error('The scheduled post could not be published.');
  await db.update('UPDATE qc_scheduled_creator_posts SET status = \'published\', published_post_id = ?, published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [postId, row.id]);
  return { message: 'Post published. Its precomputed recommendation metadata is already attached.', postId };
}

let started = false;
function startCreatorContentScheduler() {
  if (started) return;
  started = true;
  const schedule = require('node-schedule');
  schedule.scheduleJob('*/1 * * * *', async () => {
    try {
      const rows = await db.query('SELECT * FROM qc_scheduled_creator_posts WHERE status = \'scheduled\' AND scheduled_at <= CURRENT_TIMESTAMP ORDER BY scheduled_at ASC LIMIT 25');
      for (const row of rows) {
        const claimed = await db.update('UPDATE qc_scheduled_creator_posts SET status = \'publishing\', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = \'scheduled\'', [row.id]);
        if (!claimed) continue;
        try { await publishScheduledPost(row); }
        catch (error) {
          await db.update('UPDATE qc_scheduled_creator_posts SET status = \'scheduled\', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = \'publishing\'', [row.id]);
          console.error('[Creator Content] Scheduled publish failed:', row.id, error.message);
        }
      }
    } catch (error) {
      console.error('[Creator Content] Scheduler pass failed:', error.message);
    }
  });
  console.log('[Creator Content] Scheduler started; checking due posts every minute.');
}

module.exports = { router, startCreatorContentScheduler };
startCreatorContentScheduler();