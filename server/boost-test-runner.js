const db = require('./database');
const { getSetting } = require('./platform-settings');

let timer = null;
let running = false;

async function runSyntheticBoostTestPass() {
  if (running) return;
  running = true;
  try {
    const enabled = String(await getSetting('bots_enabled', 'false')).toLowerCase() === 'true';
    const testMode = String(await getSetting('boost_synthetic_test_mode', process.env.NODE_ENV === 'production' ? 'false' : 'true')).toLowerCase() === 'true';
    if (!enabled || !testMode) return;

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const boosts = await db.query(
      `SELECT id, item_type, post_id, promoted_profile_id, objective, target_quantity,
              COALESCE(test_delivered_quantity, 0) AS test_delivered_quantity
         FROM boosted_promotions
        WHERE status = 'active' AND expires_at > ?
          AND COALESCE(test_delivered_quantity, 0) < target_quantity
          AND objective IN ('followers', 'likes')
        ORDER BY created_at ASC LIMIT 20`,
      [now],
    );
    if (!boosts.length) return;

    const bots = await db.query(
      `SELECT b.id AS bot_id, b.user_id
         FROM bots b JOIN users u ON u.id = b.user_id
        WHERE b.status = 'active' AND COALESCE(u.is_synthetic, 0) = 1
        ORDER BY b.id ASC LIMIT 500`,
    );
    if (!bots.length) return;

    for (const boost of boosts) {
      const objective = String(boost.objective || '').toLowerCase();
      const eventType = objective === 'followers' ? 'follow' : 'like';
      const remaining = Math.max(0, Number(boost.target_quantity || 0) - Number(boost.test_delivered_quantity || 0));
      if (!remaining) continue;

      const existingRows = await db.query(
        'SELECT bot_id, user_id FROM boost_test_events WHERE boost_id = ? AND event_type = ?',
        [boost.id, eventType],
      );
      const used = new Set(existingRows.map((row) => Number(row.bot_id || row.user_id)));
      let delivered = 0;

      for (const bot of bots) {
        if (delivered >= remaining) break;
        if (used.has(Number(bot.bot_id))) continue;
        if (eventType === 'follow') {
          const targetId = Number(boost.promoted_profile_id);
          if (!targetId || targetId === Number(bot.user_id)) continue;
          const existing = await db.getOne(
            'SELECT follower_id FROM follows WHERE follower_id = ? AND followed_id = ?',
            [bot.user_id, targetId],
          );
          if (existing) continue;
          await db.query(
            'INSERT INTO follows (follower_id, followed_id, is_synthetic) VALUES (?, ?, 1)',
            [bot.user_id, targetId],
          );
        } else {
          const postId = Number(boost.post_id);
          if (!postId) continue;
          const post = await db.getOne(
            "SELECT id FROM posts WHERE id = ? AND COALESCE(visibility, 'public') = 'public'",
            [postId],
          );
          if (!post) continue;
          const existing = await db.getOne(
            'SELECT user_id FROM post_likes WHERE post_id = ? AND user_id = ?',
            [postId, bot.user_id],
          );
          if (existing) continue;
          await db.query(
            'INSERT INTO post_likes (post_id, user_id, is_synthetic) VALUES (?, ?, 1)',
            [postId, bot.user_id],
          );
        }

        await db.query(
          'INSERT INTO boost_test_events (boost_id, user_id, event_type, post_id, bot_id) VALUES (?, ?, ?, ?, ?)',
          [boost.id, bot.user_id, eventType, eventType === 'like' ? Number(boost.post_id) : null, bot.bot_id],
        );
        used.add(Number(bot.bot_id));
        delivered += 1;
      }

      if (delivered > 0) {
        await db.update(
          'UPDATE boosted_promotions SET test_delivered_quantity = CASE WHEN COALESCE(test_delivered_quantity, 0) + ? > target_quantity THEN target_quantity ELSE COALESCE(test_delivered_quantity, 0) + ? END WHERE id = ?',
          [delivered, delivered, boost.id],
        );
      }
    }
  } catch (error) {
    console.error('[BoostTest] Synthetic booster pass failed:', error.message);
  } finally {
    running = false;
  }
}

function startSyntheticBoostTestRunner() {
  if (timer) return;
  const intervalMs = Math.max(5000, Number(process.env.BOOST_SYNTHETIC_TEST_INTERVAL_MS || 15000));
  timer = setInterval(runSyntheticBoostTestPass, intervalMs);
  runSyntheticBoostTestPass();
  console.log(`[BoostTest] Synthetic booster runner started (${intervalMs}ms interval).`);
}

function stopSyntheticBoostTestRunner() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startSyntheticBoostTestRunner, stopSyntheticBoostTestRunner, runSyntheticBoostTestPass };
