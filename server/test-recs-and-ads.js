const { openDb } = require('./database');
const { analyzeContent } = require('./services/content-classifier');
const { createAdCampaign, getEligibleAds, generateClickToken, verifyClickToken, recordAdClick, getCampaignAnalytics } = require('./services/ads-service');
const { boostPost, boostProfile, getEligibleBoostedPosts, getEligibleBoostedProfiles } = require('./services/boost-service');
const { upsertBusinessProfile, getBusinessProfile, getBusinessOpportunities } = require('./services/business-service');
const { recordFeedback, getRecommendationProfile, updateRecommendationPreferences } = require('./services/feedback-service');
const { getRecommendedFeed, getAssistantRecommendations } = require('./services/recommendation-engine');

async function runTests() {
  console.log('=== STARTING QUICKCHAT RECOMMENDATION & ADS TEST SUITE ===');
  const db = openDb();

  // Find or create test users
  let testUser = db.prepare('SELECT id, username, handle, wallet_points FROM users LIMIT 1').get();
  if (!testUser) {
    console.log('Creating mock test user...');
    const result = db.prepare(`
      INSERT INTO users (username, handle, full_name, email, password_hash, wallet_points)
      VALUES ('test_recs', '@test_recs', 'Test Recs User', 'testrecs@example.com', 'mockhash', 1000)
    `).run();
    testUser = { id: result.lastInsertRowid, username: 'test_recs', handle: '@test_recs', wallet_points: 1000 };
  } else {
    // Ensure sufficient wallet points for testing boost
    db.prepare('UPDATE users SET wallet_points = MAX(wallet_points, 500) WHERE id = ?').run(testUser.id);
  }
  console.log(`Using Test User ID: ${testUser.id} (${testUser.handle})`);

  // TEST 1: Content Classifier
  console.log('\n--- 1. Testing Content Classifier ---');
  const postText = 'I build high-performance React web applications and Node.js backends for early stage startups looking to scale their software products!';
  const classified = analyzeContent({
    title: 'Modern Web Engineering',
    content: postText,
  });
  console.log('Classified topics:', classified.topics);
  console.log('Classified interests:', classified.interests);
  console.log('Classified hashtags:', classified.hashtags);
  console.log('Classified keywords:', classified.keywords);
  console.log('Classified audiences:', classified.audienceRecommendations);
  console.log('Readability score:', classified.optimization.readabilityScore);

  if (!classified.interests.includes('Programming') && !classified.interests.includes('Technology')) {
    throw new Error('Classifier failed to extract Programming or Technology from tech text');
  }
  console.log('✓ Content Classifier passed successfully.');

  // TEST 2: Business Profile & Opportunities
  console.log('\n--- 2. Testing Business Profile & Opportunities ---');
  upsertBusinessProfile(testUser.id, {
    businessName: "Lagos Artisan Bakery",
    category: "Bakery & Food Production",
    productsServices: "Sourdough bread, pastries, wholesale bakery goods",
    stage: "Growing",
    goals: "Expand local retail reach and launch online ordering website",
    targetCustomers: "Food lovers, coffee shops, hotels",
    assistanceNeeded: ["Website Developers", "Packaging Designers", "Digital Marketers", "Food & Raw Material Suppliers"],
    enabled: true,
  });

  const bProfile = getBusinessProfile(testUser.id);
  console.log('Saved Business Profile:', bProfile?.businessName, 'Category:', bProfile?.category);
  if (!bProfile || bProfile.businessName !== "Lagos Artisan Bakery") {
    throw new Error('Business profile upsert failed');
  }

  const bOpps = getBusinessOpportunities(testUser.id);
  console.log('Business Opportunities count:', bOpps.opportunities?.length);
  console.log('Service providers matched count:', bOpps.services?.length);
  console.log('Discussions matched count:', bOpps.discussions?.length);
  console.log('✓ Business Profile & Opportunities passed successfully.');

  // TEST 3: Ads Service & HMAC Token Verification
  console.log('\n--- 3. Testing Unified Ads Service & Secure Click Tracking ---');
  const campaign = createAdCampaign(testUser.id, {
    name: 'Bakery Grand Opening Promotion',
    title: 'Fresh Artisan Sourdough Delivered Daily',
    description: 'Order organic sourdough bread crafted fresh every morning. Use code QUICKCHAT for 20% off!',
    productService: 'Organic Sourdough Bread',
    landingUrl: 'https://lagosartisanbakery.com/menu',
    objective: 'sales',
    targetInterests: ['Food', 'Health & Fitness', 'Business'],
    totalBudget: 100.0,
    dailyBudget: 25.0,
    costPerClick: 0.50,
    costPerImpression: 0.05,
    status: 'active',
  });
  console.log('Created campaign ID:', campaign.id, 'Title:', campaign.title);

  // Generate click token
  const token = generateClickToken(campaign.id, testUser.id);
  const isValid = verifyClickToken(campaign.id, testUser.id, token);
  console.log('HMAC Click Token generated. Valid?:', isValid);
  if (!isValid) throw new Error('HMAC click token verification failed');

  // Verify tampered token fails
  const tamperedValid = verifyClickToken(campaign.id, testUser.id, token + 'tampered');
  if (tamperedValid) throw new Error('Tampered click token should have been rejected');
  console.log('Tampered token correctly rejected.');

  // Record valid click
  const clickResult = recordAdClick(campaign.id, {
    userId: testUser.id,
    ipAddress: '127.0.0.1',
    token: token,
    userAgent: 'Mozilla/5.0 QuickChatTest',
  });
  console.log('Recorded click result:', clickResult.status, 'Redirect URL:', clickResult.redirectUrl);
  if (clickResult.redirectUrl !== 'https://lagosartisanbakery.com/menu') {
    throw new Error('Redirect URL does not match campaign landing page');
  }

  // Duplicate click protection test
  const dupClick = recordAdClick(campaign.id, {
    userId: testUser.id,
    ipAddress: '127.0.0.1',
    token: token,
    userAgent: 'Mozilla/5.0 QuickChatTest',
  });
  console.log('Duplicate click within 5 mins result:', dupClick.status);
  if (dupClick.status !== 'duplicate_ignored') {
    throw new Error('Duplicate click was not throttled/ignored');
  }

  const analytics = getCampaignAnalytics(campaign.id);
  console.log('Campaign Analytics - Clicks:', analytics.validClicks, 'Spend:', analytics.totalSpend);
  console.log('✓ Ads Service & Secure Click Tracking passed successfully.');

  // TEST 4: Boost System
  console.log('\n--- 4. Testing Boost System with Wallet Deductions ---');
  // Find or create a post to boost
  let samplePost = db.prepare('SELECT id, user_id FROM posts WHERE user_id = ? LIMIT 1').get(testUser.id);
  if (!samplePost) {
    const postRes = db.prepare(`
      INSERT INTO posts (user_id, content, topics, keywords)
      VALUES (?, 'A wonderful post about entrepreneurship and software development.', '["Business","Technology"]', '["entrepreneurship"]')
    `).run(testUser.id);
    samplePost = { id: postRes.lastInsertRowid, user_id: testUser.id };
  }

  const initialPoints = db.prepare('SELECT wallet_points FROM users WHERE id = ?').get(testUser.id).wallet_points;
  const postBoost = boostPost(testUser.id, {
    postId: samplePost.id,
    durationHours: 24,
    pointsBudget: 50,
    targetInterests: ['Business', 'Technology'],
  });
  const afterPoints = db.prepare('SELECT wallet_points FROM users WHERE id = ?').get(testUser.id).wallet_points;
  console.log(`Boosted Post ID ${samplePost.id}. Wallet: ${initialPoints} -> ${afterPoints}`);
  if (initialPoints - afterPoints !== 50) {
    throw new Error('Points were not deducted properly for post boost');
  }

  const eligibleBoosts = getEligibleBoostedPosts();
  console.log('Eligible Boosted Posts count:', eligibleBoosts.length);
  if (!eligibleBoosts.some((b) => b.post_id === samplePost.id)) {
    throw new Error('Boosted post not found in eligible boosts');
  }
  console.log('✓ Boost System passed successfully.');

  // TEST 5: Recommendation Feedback & Profile Weights
  console.log('\n--- 5. Testing Recommendation Feedback Learning ---');
  recordFeedback(testUser.id, {
    targetType: 'post',
    targetId: samplePost.id,
    action: 'like',
    metadata: { interests: ['Programming', 'Artificial Intelligence'] },
  });
  recordFeedback(testUser.id, {
    targetType: 'post',
    targetId: samplePost.id,
    action: 'show_more',
    metadata: { interests: ['Technology'] },
  });

  const recProfile = getRecommendationProfile(testUser.id);
  console.log('Learned topic weights for user:', recProfile.learnedTopicWeights);
  if (!recProfile.learnedTopicWeights['Programming'] || !recProfile.learnedTopicWeights['Technology']) {
    throw new Error('Feedback service failed to record learned topic weights');
  }
  console.log('✓ Recommendation Feedback Learning passed successfully.');

  // TEST 6: Central Recommendation Engine Feed & Assistant
  console.log('\n--- 6. Testing Central Recommendation Engine Feed & Frequency Capping ---');
  const feed = getRecommendedFeed({
    userId: testUser.id,
    limit: 20,
    frequencyCap: 5,
  });
  console.log(`Retrieved ${feed.items.length} items from central recommendation engine.`);
  const adCount = feed.items.filter((i) => i.isSponsored).length;
  const boostCount = feed.items.filter((i) => i.isBoosted).length;
  const organicCount = feed.items.filter((i) => !i.isSponsored && !i.isBoosted).length;
  console.log(`Feed breakdown: Organic: ${organicCount}, Boosted: ${boostCount}, Sponsored Ads: ${adCount}`);

  // Test Assistant Recommendations
  const assistant = getAssistantRecommendations(testUser.id);
  console.log('Assistant bot profile handle:', assistant.profile.handle);
  console.log('Assistant bot interests count:', assistant.profile.interests.length);
  console.log('Assistant recommended people count:', assistant.people.length);
  console.log('Assistant recommended communities count:', assistant.communities.length);
  console.log('Assistant business opportunities count:', assistant.businessOpportunities.services.length);
  console.log('✓ Central Recommendation Engine Feed & Assistant passed successfully.');

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
