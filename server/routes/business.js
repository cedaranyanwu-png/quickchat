const express = require('express');
const { db, asyncRoute } = require('./utils');
const {
  getBusinessProfile,
  upsertBusinessProfile,
  getBusinessOpportunities,
  ASSISTANCE_TAXONOMY,
} = require('../services/business-service');
const { getCreatorEarningsSummary, getCreatorLedger } = require('../ledger');

const router = express.Router();

router.get('/business/profile', asyncRoute(async (req, res) => {
  const profile = await getBusinessProfile(req.user.id);
  res.json({
    businessProfile: profile,
    assistanceTaxonomy: Object.entries(ASSISTANCE_TAXONOMY).map(([key, item]) => ({ key, label: item.label })),
  });
}));

router.put('/business/profile', asyncRoute(async (req, res) => {
  const updated = await upsertBusinessProfile(req.user.id, req.body || {});
  res.json({ message: 'Business profile updated successfully.', businessProfile: updated });
}));

router.get('/business/opportunities', asyncRoute(async (req, res) => {
  const opportunities = await getBusinessOpportunities(req.user.id);
  res.json(opportunities);
}));

router.get('/wallet/summary', asyncRoute(async (req, res) => {
  res.json(await getCreatorEarningsSummary(req.user.id));
}));

router.get('/wallet/transactions', asyncRoute(async (req, res) => {
  const transactions = await getCreatorLedger(req.user.id, req.query.limit);
  res.json({ transactions, withdrawable: false });
}));

// A campaign can be created without being charged. It stays paused until real
// advertiser funding and review are implemented; a client cannot self-activate it.
router.patch('/ads/campaigns/:campaignId/status', asyncRoute(async (req, res) => {
  const campaignId = Number(req.params.campaignId);
  const requestedStatus = ['active', 'paused', 'completed'].includes(req.body?.status) ? req.body.status : null;
  if (!requestedStatus) return res.status(400).json({ message: 'Valid status is active, paused, or completed.' });
  const campaign = await db.getOne(
    'SELECT id, spent_amount, total_budget, status FROM ad_campaigns WHERE id = ? AND user_id = ?',
    [campaignId, req.user.id],
  );
  if (!campaign) return res.status(404).json({ message: 'Campaign not found.' });
  if (requestedStatus === 'active') {
    return res.status(409).json({ message: 'Campaign activation is unavailable until verified advertiser funding and campaign review are implemented.' });
  }
  if (campaign.status === 'completed' && requestedStatus !== 'completed') {
    return res.status(409).json({ message: 'A completed campaign cannot be resumed.' });
  }
  await db.update('UPDATE ad_campaigns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', [requestedStatus, campaignId, req.user.id]);
  return res.json({ message: `Campaign status updated to ${requestedStatus}.`, status: requestedStatus });
}));

module.exports = router;
