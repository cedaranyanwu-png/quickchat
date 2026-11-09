const express = require('express');
const { db, asyncRoute, notFound } = require('./utils');
const { boostPost, boostProfile, getUserBoosts } = require('../services/boost-service');

const router = express.Router();

router.get('/boosts', asyncRoute(async (req, res) => {
  const boosts = await getUserBoosts(req.user.id);
  res.json({ boosts });
}));

router.post('/boosts/post', asyncRoute(async (req, res) => {
  const postId = Number(req.body?.postId);
  if (!postId) return res.status(400).json({ message: 'Valid postId is required.' });

  const result = await boostPost(req.user.id, {
    postId,
    objective: req.body?.objective || 'reach',
    targetQuantity: Number(req.body?.targetQuantity) || 1000,
    targetInterests: Array.isArray(req.body?.targetInterests) ? req.body.targetInterests : [],
    targetAudiences: Array.isArray(req.body?.targetAudiences) ? req.body.targetAudiences : [],
    budgetPoints: Number(req.body?.budgetPoints) || 500,
    durationDays: Number(req.body?.durationDays) || 7,
  });

  res.status(201).json({ message: 'Post boosted successfully!', ...result });
}));

router.post('/boosts/profile', asyncRoute(async (req, res) => {
  const result = await boostProfile(req.user.id, {
    objective: req.body?.objective || 'followers',
    targetQuantity: Number(req.body?.targetQuantity) || 500,
    targetInterests: Array.isArray(req.body?.targetInterests) ? req.body.targetInterests : [],
    targetAudiences: Array.isArray(req.body?.targetAudiences) ? req.body.targetAudiences : [],
    budgetPoints: Number(req.body?.budgetPoints) || 1000,
    durationDays: Number(req.body?.durationDays) || 7,
  });

  res.status(201).json({ message: 'Profile boosted successfully!', ...result });
}));

router.patch('/boosts/:boostId/status', asyncRoute(async (req, res) => {
  const boostId = Number(req.params.boostId);
  const status = ['active', 'paused', 'completed'].includes(req.body?.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ message: 'Valid status is active, paused, or completed.' });

  const boost = await db.getOne('SELECT id FROM boosted_promotions WHERE id = ? AND user_id = ?', [boostId, req.user.id]);
  if (!boost) return notFound(res, 'Boost promotion not found');

  await db.update('UPDATE boosted_promotions SET status = ? WHERE id = ?', [status, boostId]);
  res.json({ message: `Boost promotion status updated to ${status}.`, status });
}));

module.exports = router;
