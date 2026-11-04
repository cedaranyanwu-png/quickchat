const crypto = require('node:crypto');
const db = require('../database');

const HMAC_SECRET = process.env.JWT_SECRET || process.env.FLW_SECRET_HASH || 'quickchat-ad-secure-token-secret-2026';
const DEFAULT_CPC = 50.00; // 50 NGN per valid click

function generateClickToken(campaignId, userId = 0) {
  const timestamp = Date.now();
  const payload = `${campaignId}:${userId}:${timestamp}`;
  const signature = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex').slice(0, 32);
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

function verifyClickToken(token, campaignId) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [b64Payload, signature] = parts;
  let payloadStr = '';
  try {
    payloadStr = Buffer.from(b64Payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expectedSig = crypto.createHmac('sha256', HMAC_SECRET).update(payloadStr).digest('hex').slice(0, 32);
  if (signature !== expectedSig) return null;

  const [tCampaignId, tUserId, timestampStr] = payloadStr.split(':');
  if (String(tCampaignId) !== String(campaignId)) return null;

  const timestamp = Number(timestampStr);
  // Token expires after 72 hours
  if (Date.now() - timestamp > 72 * 3600 * 1000) return null;

  return { campaignId: Number(tCampaignId), userId: Number(tUserId), timestamp };
}

async function createCampaign(userId, data) {
  const {
    campaignName,
    adTitle,
    adDescription,
    creativeUrl,
    creativeType = 'image',
    advertisedProduct,
    landingPageUrl,
    objective = 'brand_awareness',
    targetInterests = [],
    targetAudiences = [],
    targetBusinessCategories = [],
    targetLocations = [],
    dailyBudget = 0,
    totalBudget = 5000,
    currency = 'NGN',
  } = data;

  if (!adTitle || !adDescription || !landingPageUrl) {
    throw new Error('Title, description, and landing page URL are required for your ad.');
  }

  // Validate URL format
  try {
    const url = new URL(landingPageUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Landing page URL must start with http:// or https://');
    }
  } catch {
    throw new Error('Please provide a valid landing page web URL.');
  }

  const result = await db.insert(
    `INSERT INTO ad_campaigns (
      user_id, campaign_name, ad_title, ad_description, creative_url, creative_type,
      advertised_product, landing_page_url, objective, target_interests, target_audiences,
      target_business_categories, target_locations, daily_budget, total_budget, spent_amount,
      currency, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'active')`,
    [
      userId,
      campaignName || adTitle,
      adTitle,
      adDescription,
      creativeUrl || null,
      creativeType,
      advertisedProduct || '',
      landingPageUrl,
      objective,
      JSON.stringify(targetInterests),
      JSON.stringify(targetAudiences),
      JSON.stringify(targetBusinessCategories),
      JSON.stringify(targetLocations),
      Number(dailyBudget) || 0,
      Math.max(1000, Number(totalBudget) || 5000),
      currency,
    ]
  );

  return result?.id;
}

async function getEligibleAds({ userInterests = [], businessCategory = '', limit = 3 }) {
  // Candidate retrieval: Active ads with budget remaining
  const ads = await db.query(
    `SELECT a.id, a.user_id, a.campaign_name, a.ad_title, a.ad_description, a.creative_url,
            a.creative_type, a.advertised_product, a.landing_page_url, a.objective,
            a.target_interests, a.target_audiences, a.target_business_categories,
            a.target_locations, a.total_budget, a.spent_amount, a.currency,
            u.fullname AS advertiser_name, u.username AS advertiser_username,
            u.avatar_url AS advertiser_avatar, u.verified AS advertiser_verified
       FROM ad_campaigns a
       JOIN users u ON u.id = a.user_id
      WHERE a.status = 'active'
        AND a.spent_amount < a.total_budget
      ORDER BY a.created_at DESC LIMIT 30`
  );

  if (!ads.length) return [];

  const interestSet = new Set(userInterests.map((i) => String(i).toLowerCase()));

  // Score eligibility and relevance
  const scored = ads.map((ad) => {
    let targetingScore = 1.0;
    let targetInterests = [];
    let targetBizCategories = [];

    try { targetInterests = JSON.parse(ad.target_interests || '[]'); } catch {}
    try { targetBizCategories = JSON.parse(ad.target_business_categories || '[]'); } catch {}

    // Match interests
    if (targetInterests.length > 0) {
      const matched = targetInterests.filter((t) => interestSet.has(String(t).toLowerCase()));
      if (matched.length > 0) targetingScore += matched.length * 1.5;
    }

    // Match business category if user operates a business
    if (businessCategory && targetBizCategories.length > 0) {
      const bizMatched = targetBizCategories.some((c) =>
        String(c).toLowerCase().includes(businessCategory.toLowerCase()) ||
        businessCategory.toLowerCase().includes(String(c).toLowerCase())
      );
      if (bizMatched) targetingScore += 2.0;
    }

    // Pacing score: favor ads with more budget remaining
    const remainingRatio = Math.max(0, (ad.total_budget - ad.spent_amount) / (ad.total_budget || 1));
    const finalScore = targetingScore * (1 + remainingRatio);

    return { ad, score: finalScore };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ ad }) => ({
    id: ad.id,
    campaignId: ad.id,
    title: ad.ad_title,
    description: ad.ad_description,
    creativeUrl: ad.creative_url,
    creativeType: ad.creative_type || 'image',
    advertisedProduct: ad.advertised_product,
    landingPageUrl: ad.landing_page_url,
    objective: ad.objective,
    advertiser: {
      id: ad.user_id,
      name: ad.advertiser_name,
      username: ad.advertiser_username,
      avatar: ad.advertiser_avatar,
      verified: Boolean(Number(ad.advertiser_verified || 0)),
    },
    clickToken: generateClickToken(ad.id),
    isSponsored: true,
    itemType: 'ad',
  }));
}

async function recordAdImpression(campaignId, userId = null, ip = '') {
  try {
    await db.insert(
      'INSERT INTO ad_impressions (campaign_id, user_id, ip_address) VALUES (?, ?, ?)',
      [campaignId, userId, ip.slice(0, 60)]
    );
  } catch (_err) {}
}

async function handleAdClick({ campaignId, clickToken, userId = null, ip = '' }) {
  const campaign = await db.getOne(
    'SELECT id, landing_page_url, status, total_budget, spent_amount, user_id FROM ad_campaigns WHERE id = ?',
    [campaignId]
  );

  if (!campaign) {
    throw new Error('Advertisement campaign not found.');
  }

  // Token verification
  const verified = verifyClickToken(clickToken, campaignId);
  const destinationUrl = campaign.landing_page_url;

  // Fraud / duplicate check: check if same IP or user clicked this campaign in last 5 minutes
  const recentDuplicate = await db.getOne(
    `SELECT id FROM ad_clicks
      WHERE campaign_id = ?
        AND (ip_address = ? OR (user_id IS NOT NULL AND user_id = ?))
        AND created_at >= ${db.type === 'sqlite' ? "datetime('now', '-5 minutes')" : "NOW() - INTERVAL '5 minutes'"}
      LIMIT 1`,
    [campaignId, ip.slice(0, 60), userId || 0]
  );

  let isValid = 1;
  let fraudReason = null;
  let cost = 0;

  if (!verified) {
    isValid = 0;
    fraudReason = 'invalid_or_expired_token';
  } else if (recentDuplicate) {
    isValid = 0;
    fraudReason = 'duplicate_click_throttled';
  } else if (campaign.status !== 'active' || campaign.spent_amount >= campaign.total_budget) {
    isValid = 0;
    fraudReason = 'campaign_inactive_or_budget_exhausted';
  } else if (userId && userId === campaign.user_id) {
    isValid = 0;
    fraudReason = 'advertiser_self_click';
  } else {
    // Valid click: charge CPC
    cost = DEFAULT_CPC;
    const nextSpend = Number(campaign.spent_amount) + cost;
    const nextStatus = nextSpend >= Number(campaign.total_budget) ? 'completed' : 'active';
    await db.update(
      'UPDATE ad_campaigns SET spent_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nextSpend, nextStatus, campaignId]
    );
  }

  await db.insert(
    'INSERT INTO ad_clicks (campaign_id, user_id, click_token, ip_address, is_valid, fraud_reason, cost) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [campaignId, userId, clickToken ? clickToken.slice(0, 120) : 'none', ip.slice(0, 60), isValid, fraudReason, cost]
  );

  return { destinationUrl, isValid };
}

async function recordAdConversion({ campaignId, userId = null, conversionType = 'lead', conversionValue = 0, reference = '' }) {
  const campaign = await db.getOne('SELECT id, status FROM ad_campaigns WHERE id = ?', [campaignId]);
  if (!campaign) throw new Error('Campaign not found');

  await db.insert(
    'INSERT INTO ad_conversions (campaign_id, user_id, conversion_type, conversion_value, reference) VALUES (?, ?, ?, ?, ?)',
    [campaignId, userId, conversionType, Number(conversionValue) || 0, reference ? String(reference).slice(0, 120) : null]
  );

  return { success: true };
}

async function getCampaignAnalytics(campaignId, userId) {
  const campaign = await db.getOne(
    'SELECT * FROM ad_campaigns WHERE id = ? AND user_id = ?',
    [campaignId, userId]
  );
  if (!campaign) throw new Error('Campaign not found or unauthorized');

  const impressionsCount = await db.getCount(
    'SELECT COUNT(*) AS count FROM ad_impressions WHERE campaign_id = ?',
    [campaignId]
  );

  const clicks = await db.getOne(
    `SELECT COUNT(*) AS total_clicks,
            SUM(CASE WHEN is_valid = 1 THEN 1 ELSE 0 END) AS valid_clicks,
            COUNT(DISTINCT ip_address) AS unique_clicks
       FROM ad_clicks WHERE campaign_id = ?`,
    [campaignId]
  );

  const conversions = await db.getOne(
    'SELECT COUNT(*) AS count, COALESCE(SUM(conversion_value), 0) AS value FROM ad_conversions WHERE campaign_id = ?',
    [campaignId]
  );

  const totalClicks = Number(clicks?.total_clicks || 0);
  const validClicks = Number(clicks?.valid_clicks || 0);
  const uniqueClicks = Number(clicks?.unique_clicks || 0);
  const ctr = impressionsCount > 0 ? ((validClicks / impressionsCount) * 100).toFixed(2) : '0.00';
  const cpc = validClicks > 0 ? (campaign.spent_amount / validClicks).toFixed(2) : DEFAULT_CPC.toFixed(2);
  const cpm = impressionsCount > 0 ? ((campaign.spent_amount / impressionsCount) * 1000).toFixed(2) : '0.00';

  let targetInterests = [];
  try { targetInterests = JSON.parse(campaign.target_interests || '[]'); } catch {}

  return {
    campaign: {
      id: campaign.id,
      name: campaign.campaign_name,
      title: campaign.ad_title,
      description: campaign.ad_description,
      creativeUrl: campaign.creative_url,
      landingPageUrl: campaign.landing_page_url,
      objective: campaign.objective,
      status: campaign.status,
      totalBudget: Number(campaign.total_budget || 0),
      spentAmount: Number(campaign.spent_amount || 0),
      remainingBudget: Math.max(0, Number(campaign.total_budget || 0) - Number(campaign.spent_amount || 0)),
      currency: campaign.currency || 'NGN',
      targetInterests,
      createdAt: campaign.created_at,
    },
    performance: {
      impressions: impressionsCount,
      totalClicks,
      validClicks,
      uniqueClicks,
      invalidClicks: Math.max(0, totalClicks - validClicks),
      ctr: `${ctr}%`,
      cpc: `${campaign.currency || 'NGN'} ${cpc}`,
      cpm: `${campaign.currency || 'NGN'} ${cpm}`,
      conversions: Number(conversions?.count || 0),
      conversionValue: Number(conversions?.value || 0),
    },
  };
}

module.exports = {
  createCampaign,
  generateClickToken,
  verifyClickToken,
  getEligibleAds,
  recordAdImpression,
  handleAdClick,
  recordAdConversion,
  getCampaignAnalytics,
};
