const db = require('./database');
const { getSetting } = require('./platform-settings');

let timer = null;
let running = false;

function settingEnabled(value) {
  return ['true', '1', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

async function runSyntheticBoostTestPass() {
  if (running) return;
  running = true;

  try {
    const enabled = settingEnabled(await getSetting('bots_enabled', 'false'));
    const testMode = settingEnabled(await getSetting(
      'boost_synthetic_test_mode',
      process.env.NODE_ENV === 'production' ? 'false' : 'true',
    ));

    if (!enabled || !testMode) {
      console.log(`[BoostTest] Waiting: bots_enabled=${enabled}, test_mode=${testMode}.`);
      return;
    }

    // Let the database compare timestamps in its own timezone.
    const boosts = await db.query(
      `SELECT id, user_id, item_type, post_id, promoted_profile_id, objective,
              target_quantity, COALESCE(test_delivered_quantity, 0) AS test_delivered_quantity
         FROM boosted_promotions
        WHERE status = 'active'
          AND expires_at > CURRENT_TIMESTAMP
          AND COALESCE(test_delivered_quantity, 0) < target_quantity
          AND (
            (item_type = 'profile' AND objective = 'followers')
            OR (item_type = 'post' AND objective = 'likes')
          )
        ORDER BY created_at ASC
        LIMIT 50`,
    );

    if (!boosts.length) {
      console.log('[BoostTest] No eligible active follower/like campaigns found.');
      return;
    }

    const bots = await db.query(
      `SELECT b.id AS bot_id, b.user_id
         FROM bots b
         JOIN users u ON u.id = b.user_id
        WHERE LOWER(COALESCE(b.status, '')) = 'active'
          AND COALESCE(u.is_synthetic, 0) = 1
        ORDER BY b.id ASC
        LIMIT 1000`,
    );

    if (!bots.length) {
      console.warn('[BoostTest] Active campaigns found, but no active synthetic bot accounts are available.');
      return;
    }

    let totalDelivered = 0;

    for (const boost of boosts) {
      const objective = String(boost.objective || '').toLowerCase();
      const eventType = objective === 'followers' ? 'follow' : 'like';
      const remaining = Math.max(
        0,
        Number(boost.target_quantity || 0) - Number(boost.test_delivered_quantity || 0),
      );
      if (!remaining) continue;

      const targetId = Number(boost.promoted_profile_id || (boost.item_type === 'profile' ? boost.user_id : 0));
      const postId = Number(boost.post_id || 0);

      if (eventType === 'follow' && !targetId) {
        console.warn(`[BoostTest] Campaign ${boost.id} skipped: profile target is missing.`);
        continue;
      }

      if (eventType === 'like' && !postId) {
        console.warn(`[BoostTest] Campaign ${boost.id} skipped: post target is missing.`);
        continue;
      }

      if (eventType === 'like') {
        const post = await db.getOne(
          "SELECT id FROM posts WHERE id = ? AND COALESCE(visibility, 'public') = 'public'",
          [postId],
        );
        if (!post) {
          console.warn(`[BoostTest] Campaign ${boost.id} skipped: target post is missing or not public.`);
          continue;
        }
      }

      // Use the bot user ID as the idempotency key. This also works for
      // historical event rows created before bot_id was populated.
      const existingRows = await db.query(
        'SELECT user_id FROM boost_test_events WHERE boost_id = ? AND event_type = ?',
        [boost.id, eventType],
      );
      const usedUsers = new Set(existingRows.map((row) => Number(row.user_id)));
      let delivered = 0;
      let skippedExisting = 0;

      for (const bot of bots) {
        if (delivered >= remaining) break;
        const botUserId = Number(bot.user_id);
        if (!botUserId || usedUsers.has(botUserId)) continue;

        if (eventType === 'follow') {
          if (targetId === botUserId) continue;
          const existing = await db.getOne(
            'SELECT follower_id, COALESCE(is_synthetic, 0) AS is_synthetic FROM follows WHERE follower_id = ? AND followed_id = ?',
            [botUserId, targetId],
          );
          if (existing && Number(existing.is_synthetic) !== 1) {
            skippedExisting += 1;
            usedUsers.add(botUserId);
            continue;
          }

          // Recover a synthetic relationship created by an earlier interrupted
          // pass instead of leaving its campaign counter permanently at zero.
          if (!existing) {
            await db.query(
              'INSERT INTO follows (follower_id, followed_id, is_synthetic) VALUES (?, ?, 1)',
              [botUserId, targetId],
            );
          }
        } else {
          const existing = await db.getOne(
            'SELECT user_id, COALESCE(is_synthetic, 0) AS is_synthetic FROM post_likes WHERE post_id = ? AND user_id = ?',
            [postId, botUserId],
          );
          if (existing && Number(existing.is_synthetic) !== 1) {
            skippedExisting += 1;
            usedUsers.add(botUserId);
            continue;
          }

          // Recover a synthetic like left behind if a previous pass stopped
          // before its audit event and delivery counter were written.
          if (!existing) {
            await db.query(
              'INSERT INTO post_likes (post_id, user_id, is_synthetic) VALUES (?, ?, 1)',
              [postId, botUserId],
            );
          }
        }

        await db.query(
          'INSERT INTO boost_test_events (boost_id, user_id, event_type, post_id, bot_id) VALUES (?, ?, ?, ?, ?)',
          [boost.id, botUserId, eventType, eventType === 'like' ? postId : null, bot.bot_id],
        );

        usedUsers.add(botUserId);
        delivered += 1;
      }

      if (delivered > 0) {
        await db.update(
          `UPDATE boosted_promotions
              SET test_delivered_quantity = CASE
                WHEN COALESCE(test_delivered_quantity, 0) + ? > target_quantity
                THEN target_quantity
                ELSE COALESCE(test_delivered_quantity, 0) + ?
              END
            WHERE id = ?`,
          [delivered, delivered, boost.id],
        );
      }

      totalDelivered += delivered;
      console.log(
        `[BoostTest] Campaign ${boost.id} (${eventType}): delivered ${delivered}, skipped existing ${skippedExisting}, remaining before pass ${remaining}.`,
      );
    }

    console.log(`[BoostTest] Pass complete: ${boosts.length} eligible campaign(s), ${bots.length} active bot(s), ${totalDelivered} test action(s) delivered.`);
  } catch (error) {
    console.error('[BoostTest] Synthetic booster pass failed:', error.stack || error.message);
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
