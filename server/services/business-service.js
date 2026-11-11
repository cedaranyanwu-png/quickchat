const db = require('../database');

// Standard mapping of business assistance needs to provider keywords and interests
const ASSISTANCE_TAXONOMY = {
  'web_development': {
    label: 'Website & App Development',
    interests: ['programming', 'technology'],
    keywords: ['website', 'web developer', 'fullstack', 'react', 'software', 'app design'],
    categoryMatch: ['Technology', 'Programming']
  },
  'digital_marketing': {
    label: 'Digital Marketing & SEO',
    interests: ['digital-marketing', 'business'],
    keywords: ['seo', 'growth', 'marketing', 'ads', 'social media', 'traffic', 'copywriting'],
    categoryMatch: ['Digital Marketing', 'Business']
  },
  'branding_design': {
    label: 'Branding & Packaging Design',
    interests: ['design'],
    keywords: ['packaging', 'branding', 'logo', 'graphics', 'ui', 'ux', 'product design'],
    categoryMatch: ['Design']
  },
  'suppliers': {
    label: 'Suppliers & Raw Materials',
    interests: ['business', 'entrepreneurship'],
    keywords: ['supplier', 'wholesale', 'distributor', 'materials', 'inventory', 'b2b'],
    categoryMatch: ['Business', 'Suppliers']
  },
  'finance_legal': {
    label: 'Accounting & Legal Advisory',
    interests: ['finance', 'business'],
    keywords: ['accounting', 'tax', 'legal', 'finance', 'bookkeeping', 'contracts'],
    categoryMatch: ['Finance', 'Business']
  },
  'sales_leads': {
    label: 'Customer Acquisition & Sales',
    interests: ['entrepreneurship', 'digital-marketing'],
    keywords: ['leads', 'sales', 'clients', 'conversion', 'b2b sales'],
    categoryMatch: ['Business', 'Digital Marketing']
  },
};

async function getBusinessProfile(userId) {
  const profile = await db.getOne('SELECT * FROM business_profiles WHERE user_id = ?', [userId]);
  if (!profile) return null;

  let goals = [];
  let assistance = [];
  try { goals = JSON.parse(profile.business_goals || '[]'); } catch {}
  try { assistance = JSON.parse(profile.assistance_needed || '[]'); } catch {}

  return {
    id: profile.id,
    userId: profile.user_id,
    businessName: profile.business_name,
    businessCategory: profile.business_category,
    productsServices: profile.products_services || '',
    businessStage: profile.business_stage || 'startup',
    businessGoals: goals,
    targetCustomers: profile.target_customers || '',
    assistanceNeeded: assistance,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

async function upsertBusinessProfile(userId, data) {
  const {
    businessName,
    businessCategory,
    productsServices = '',
    businessStage = 'startup',
    businessGoals = [],
    targetCustomers = '',
    assistanceNeeded = [],
  } = data;

  if (!businessName || !businessCategory) {
    throw new Error('Business name and category are required.');
  }

  const existing = await db.getOne('SELECT id FROM business_profiles WHERE user_id = ?', [userId]);
  const goalsJson = JSON.stringify(Array.isArray(businessGoals) ? businessGoals : []);
  const assistanceJson = JSON.stringify(Array.isArray(assistanceNeeded) ? assistanceNeeded : []);

  if (existing) {
    await db.update(
      `UPDATE business_profiles
          SET business_name = ?, business_category = ?, products_services = ?,
              business_stage = ?, business_goals = ?, target_customers = ?,
              assistance_needed = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?`,
      [businessName, businessCategory, productsServices, businessStage, goalsJson, targetCustomers, assistanceJson, userId]
    );
  } else {
    await db.insert(
      `INSERT INTO business_profiles (
        user_id, business_name, business_category, products_services,
        business_stage, business_goals, target_customers, assistance_needed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, businessName, businessCategory, productsServices, businessStage, goalsJson, targetCustomers, assistanceJson]
    );
    await db.update('UPDATE users SET business_enabled = 1 WHERE id = ?', [userId]);
  }

  await db.update('UPDATE users SET business_enabled = 1 WHERE id = ?', [userId]);
  return getBusinessProfile(userId);
}

async function getBusinessOpportunities(userId, { limit = 8 } = {}) {
  const bizProfile = await getBusinessProfile(userId);
  const needs = bizProfile?.assistanceNeeded || ['web_development', 'digital_marketing', 'branding_design'];
  const bizCategory = bizProfile?.businessCategory || '';

  // 1. Find service providers and experts matching declared needs
  const relevantInterests = new Set();
  const searchKeywords = [];

  for (const needKey of needs) {
    const config = ASSISTANCE_TAXONOMY[needKey];
    if (config) {
      config.interests.forEach((i) => relevantInterests.add(i));
      searchKeywords.push(...config.keywords);
    }
  }

  // 2. Discover matching providers (users with matching bio/interests/posts)
  const keywordPattern = searchKeywords.slice(0, 8).map(() => 'LOWER(u.bio) LIKE LOWER(?)').join(' OR ');
  const providerParams = [userId, userId, ...searchKeywords.slice(0, 8).map((kw) => `%${kw}%`), 5];

  const matchedProviders = await db.query(
    `SELECT u.id, u.fullname, u.username, u.bio, u.avatar_url, u.picture, u.verified,
            (SELECT COUNT(*) FROM follows f WHERE f.followed_id = u.id) AS follower_count
       FROM users u
      WHERE u.id <> ?
        AND NOT EXISTS (SELECT 1 FROM follows mine WHERE mine.follower_id = ? AND mine.followed_id = u.id)
        AND (${keywordPattern || '1=1'})
      ORDER BY u.verified DESC, follower_count DESC LIMIT ?`,
    providerParams
  );

  // 3. Discover relevant business communities
  const communityParams = [`%${bizCategory || 'business'}%`, '%business%', '%startup%', 4];
  const matchedCommunities = await db.query(
    `SELECT c.id, c.slug, c.name, c.description, c.category,
            (SELECT COUNT(*) FROM community_members cm WHERE cm.community_id = c.id) AS members
       FROM communities c
      WHERE LOWER(c.name) LIKE LOWER(?) OR LOWER(c.category) LIKE LOWER(?) OR LOWER(c.category) LIKE LOWER(?)
      ORDER BY members DESC LIMIT ?`,
    communityParams
  );

  // 4. Discover relevant business discussions & posts
  const postParams = [userId, userId, userId, userId, userId, userId, userId,
    `%${bizCategory || 'business'}%`, '%startup%', '%growth%', '%clients%', 6];
  const matchedPosts = await db.query(
    `SELECT p.id, p.author_id, p.body, p.category, p.hashtags, p.created_at,
            u.fullname AS name, u.username, u.avatar_url, u.picture, u.verified,
            (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS like_count,
            (SELECT COUNT(*) FROM post_replies r WHERE r.post_id = p.id) AS reply_count
       FROM posts p
       JOIN users u ON u.id = p.author_id
      WHERE p.author_id <> ?
        AND COALESCE(p.visibility, 'public') = 'public'
        AND (
          LOWER(p.body) LIKE LOWER(?) OR LOWER(p.body) LIKE LOWER(?) OR
          LOWER(p.body) LIKE LOWER(?) OR LOWER(p.body) LIKE LOWER(?)
        )
      ORDER BY p.created_at DESC LIMIT ?`,
    [userId, ...postParams.slice(7)]
  );

  return {
    businessProfile: bizProfile,
    serviceProviders: matchedProviders.map((p) => ({
      id: p.id,
      name: p.fullname,
      username: p.username,
      handle: p.username?.startsWith('@') ? p.username : `@${p.username}`,
      bio: p.bio || '',
      picture: p.avatar_url || p.picture || null,
      verified: Boolean(Number(p.verified || 0)),
      followers: Number(p.follower_count || 0),
      serviceType: 'Service Professional',
      isSponsored: false,
    })),
    communities: matchedCommunities.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description || '',
      category: c.category || 'Business',
      members: Number(c.members || 0),
    })),
    discussions: matchedPosts.map((p) => ({
      id: p.id,
      authorName: p.name,
      authorUsername: p.username,
      authorAvatar: p.avatar_url || p.picture || null,
      authorVerified: Boolean(Number(p.verified || 0)),
      body: p.body,
      category: p.category,
      likes: Number(p.like_count || 0),
      replies: Number(p.reply_count || 0),
      createdAt: p.created_at,
    })),
    assistanceTaxonomy: Object.entries(ASSISTANCE_TAXONOMY).map(([key, item]) => ({
      key,
      label: item.label,
    })),
  };
}

module.exports = {
  ASSISTANCE_TAXONOMY,
  getBusinessProfile,
  upsertBusinessProfile,
  getBusinessOpportunities,
};
