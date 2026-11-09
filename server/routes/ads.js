const express = require('express');
const { db, asyncRoute, notFound, clampLimit } = require('./utils');
const {
  createCampaign,
  handleAdClick,
  recordAdConversion,
  getCampaignAnalytics,
} = require('../services/ads-service');

const router = express.Router();
const { getSetting } = require('../platform-settings');

// Public read-only feed placements. Only active, admin-approved destinations are returned.
router.get('/ads/placements', asyncRoute(async (_req, res) => {
  let ads = [];
  try { ads = JSON.parse(await getSetting('managed_feed_ads', '[]') || '[]'); } catch (_error) { ads = []; }
  res.set('Cache-Control', 'no-store');
  res.json({ ads: (Array.isArray(ads) ? ads : []).filter((ad) => ad && ad.active === true) });
}));

// Public renderer for managed third-party native ad snippets.
router.get('/ads/render/:adId', asyncRoute(async (req, res) => {
  let ads = [];
  try { ads = JSON.parse(await getSetting('managed_feed_ads', '[]') || '[]'); } catch (_error) { ads = []; }

  const ad = (Array.isArray(ads) ? ads : []).find(
    (item) => item && item.active === true && item.type === 'script' && String(item.id) === String(req.params.adId),
  );

  if (!ad || !String(ad.scriptCode || '').trim()) {
    return res.status(404).type('html').send('<!doctype html><html><body></body></html>');
  }

  // Ad network snippets often put an async script before its target container.
  // Move script elements after the markup so the required container ID exists before invoke.js runs.
  const rawSnippet = String(ad.scriptCode);
  const scriptTags = [];
  const snippetMarkup = rawSnippet.replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script\\s*>/gi, (tag) => {
    scriptTags.push(tag);
    return '';
  });
  const snippetHtml = `${snippetMarkup}\\n${scriptTags.join("\\n")}`;
  // Keep third-party code inside the dedicated ad document rather than the QuickChat feed DOM.
  const heightReporter = `
    <script>
      (function () {
        function reportHeight() {
          var root = document.documentElement;
          var body = document.body;
          var height = Math.max(
            root ? root.scrollHeight : 0,
            root ? root.offsetHeight : 0,
            body ? body.scrollHeight : 0,
            body ? body.offsetHeight : 0
          );
          parent.postMessage({ quickchatAdHeight: Math.min(Math.max(height + 8, 80), 1200) }, '*');
        }
        window.addEventListener('load', reportHeight);
        setTimeout(reportHeight, 300);
        setTimeout(reportHeight, 1000);
        setTimeout(reportHeight, 2500);
        setInterval(reportHeight, 3000);
      }());
    </script>
  `;

  res.set({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https: http:; style-src 'unsafe-inline' https: http:; img-src https: http: data: blob:; connect-src https: http: ws: wss:; frame-src https: http: blob:; worker-src blob: https: http:; font-src https: http: data:; media-src https: http: data: blob:; base-uri 'none'; form-action https: http:;",
  });

  return res.send(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
html,body { margin:0; padding:0; width:100%; min-height:80px; overflow-x:hidden; background:transparent; }
body { display:flex; justify-content:center; align-items:flex-start; }
#ad-root { width:100%; max-width:100%; min-height:80px; overflow:hidden; }
#ad-root img, #ad-root iframe, #ad-root video, #ad-root ins { max-width:100%; }
</style>
</head>
<body>
<div id="ad-root">${snippetHtml}</div>
${heightReporter}
</body>
</html>`);
}));

// Public secure click redirect endpoint (no authentication required)
router.get('/ads/click/:campaignId', async (req, res) => {
  const campaignId = Number(req.params.campaignId);
  const clickToken = String(req.query.token || '').trim();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const userId = req.user ? req.user.id : null;

  try {
    const { destinationUrl, isValid } = await handleAdClick({
      campaignId,
      clickToken,
      userId,
      ip: String(ip),
    });

    // Safely redirect to registered database URL only
    return res.redirect(destinationUrl);
  } catch (err) {
    console.error('[Ad Click Error]', err.message);
    return res.status(404).send('Invalid or expired ad destination.');
  }
});

// Conversion tracking endpoint
router.post('/ads/convert/:campaignId', asyncRoute(async (req, res) => {
  const campaignId = Number(req.params.campaignId);
  const { conversionType, conversionValue, reference } = req.body || {};
  const userId = req.user ? req.user.id : null;

  const result = await recordAdConversion({
    campaignId,
    userId,
    conversionType,
    conversionValue,
    reference,
  });

  res.json(result);
}));

// Authenticated advertiser routes
router.get('/ads/campaigns', asyncRoute(async (req, res) => {
  const rows = await db.query(
    `SELECT a.*,
            (SELECT COUNT(*) FROM ad_impressions i WHERE i.campaign_id = a.id) AS impressions_count,
            (SELECT COUNT(*) FROM ad_clicks c WHERE c.campaign_id = a.id AND c.is_valid = 1) AS valid_clicks_count
       FROM ad_campaigns a
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC`,
    [req.user.id]
  );

  const campaigns = rows.map((c) => {
    let targetInterests = [];
    try { targetInterests = JSON.parse(c.target_interests || '[]'); } catch {}

    const impressions = Number(c.impressions_count || 0);
    const clicks = Number(c.valid_clicks_count || 0);
    const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : '0.00';

    return {
      id: c.id,
      name: c.campaign_name,
      title: c.ad_title,
      description: c.ad_description,
      creativeUrl: c.creative_url,
      creativeType: c.creative_type || 'image',
      landingPageUrl: c.landing_page_url,
      objective: c.objective,
      targetInterests,
      dailyBudget: Number(c.daily_budget || 0),
      totalBudget: Number(c.total_budget || 0),
      spentAmount: Number(c.spent_amount || 0),
      remainingBudget: Math.max(0, Number(c.total_budget || 0) - Number(c.spent_amount || 0)),
      currency: c.currency || 'NGN',
      status: c.status,
      impressions,
      clicks,
      ctr: `${ctr}%`,
      createdAt: c.created_at,
    };
  });

  res.json({ campaigns });
}));

router.post('/ads/campaigns', asyncRoute(async (req, res) => {
  const campaignId = await createCampaign(req.user.id, req.body || {});
  const analytics = await getCampaignAnalytics(campaignId, req.user.id);
  res.status(201).json(analytics);
}));

router.get('/ads/campaigns/:campaignId', asyncRoute(async (req, res) => {
  const campaignId = Number(req.params.campaignId);
  const analytics = await getCampaignAnalytics(campaignId, req.user.id);
  res.json(analytics);
}));

router.patch('/ads/campaigns/:campaignId/status', asyncRoute(async (req, res) => {
  const campaignId = Number(req.params.campaignId);
  const status = ['active', 'paused', 'completed'].includes(req.body?.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ message: 'Valid status is active, paused, or completed.' });

  const campaign = await db.getOne('SELECT id, spent_amount, total_budget FROM ad_campaigns WHERE id = ? AND user_id = ?', [campaignId, req.user.id]);
  if (!campaign) return notFound(res, 'Campaign not found');

  if (status === 'active' && campaign.spent_amount >= campaign.total_budget) {
    return res.status(400).json({ message: 'Cannot resume campaign: budget has been fully spent.' });
  }

  await db.update('UPDATE ad_campaigns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, campaignId]);
  res.json({ message: `Campaign status updated to ${status}.`, status });
}));

module.exports = router;
