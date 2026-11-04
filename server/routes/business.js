const express = require('express');
const { asyncRoute } = require('./utils');
const {
  getBusinessProfile,
  upsertBusinessProfile,
  getBusinessOpportunities,
  ASSISTANCE_TAXONOMY,
} = require('../services/business-service');

const router = express.Router();

router.get('/business/profile', asyncRoute(async (req, res) => {
  const profile = await getBusinessProfile(req.user.id);
  res.json({
    businessProfile: profile,
    assistanceTaxonomy: Object.entries(ASSISTANCE_TAXONOMY).map(([key, item]) => ({
      key,
      label: item.label,
    })),
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

module.exports = router;
