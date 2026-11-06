const express = require('express');
const { asyncRoute } = require('./utils');
const { getAssistantRecommendations } = require('../services/recommendation-engine');
const { recordFeedback, updatePreferences } = require('../services/feedback-service');
const { analyzeContent } = require('../services/content-classifier');

const router = express.Router();

router.get('/recommendations/assistant', asyncRoute(async (req, res) => {
  const data = await getAssistantRecommendations(req.user.id);
  res.json(data);
}));

router.post('/recommendations/feedback', asyncRoute(async (req, res) => {
  const { itemType, itemId, action, reason, category } = req.body || {};
  if (!itemId || !action) {
    return res.status(400).json({ message: 'Item ID and action are required.' });
  }

  const result = await recordFeedback(req.user.id, {
    itemType: itemType || 'post',
    itemId,
    action,
    reason,
    category,
  });

  res.json(result);
}));

router.patch('/recommendations/preferences', asyncRoute(async (req, res) => {
  const preferences = await updatePreferences(req.user.id, req.body || {});
  res.json({ message: 'Recommendation preferences updated.', preferences });
}));

// Fast automated Content Composer classification & optimization
router.post('/composer/classify', asyncRoute(async (req, res) => {
  const title = String(req.body?.title || '').slice(0, 300);
  const text = String(req.body?.text || req.body?.caption || '').slice(0, 5000);
  const hashtags = Array.isArray(req.body?.hashtags) ? req.body.hashtags : [];

  const analysis = await analyzeContent({ title, text, hashtags });
  res.json(analysis);
}));

module.exports = router;
