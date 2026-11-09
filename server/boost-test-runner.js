const db = require('./database');
const { getSetting } = require('./platform-settings');

let timer = null;
let running = false;

async function runSyntheticBoostTestPass() {
  if (running) return;
  running = true;
  try {
    const allow = String(await getSetting('boost_synthetic_test_mode', process.env.NODE_ENV === 'production' ? 'false' : 'true')).toLowerCase() === 'true';
    if (!allow) return;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const boosts = await db.query(`SELECT id, item_type, post_id, promoted_profile_id, objective, target_quantity, delivered_quantity FROM boosted_promotions WHERE status = 'active' AND expires_at > ? AND delivered_quantity < target_quantity ORDER BY created_at ASC LIMIT 20`, [now]);
    const synthetic = await db.query('SELECT id FROM users WHERE COALESCE(is_synthetic, 0) = 1 ORDER BY id LIMIT 200');
    if (!boosts.length || !synthetic.length) return;
    for (const boost of boosts) {
      const eventType = boost.objective === 'followers' ? 'follow' : boost.objective === 'likes' ? 'like' : 'reach';
      const existing = await db.query('SELECT user_id FROM boost_test_events WHERE boost_id = ? AND event_type = ? ORDER BY id DESC LIMIT 200', [boost.id, eventType]);
      const used = new Set(existing.map((row) => Number(row.user_id)));
      for (const bot of synthetic) {
        const userId = Number(bot.id);
        if (used.has(userId)) continue;
        try { await db.insert('INSERT INTO boost_test_events (boost_id, user_id, event_type, post_id) VALUES (?, ?, ?, ?)', [boost.id, userId, eventType, boost.post_id || null]); } catch (_error) { continue; }
        await db.query('UPDATE boosted_promotions SET test_delivered_quantity = LEAST(target_quantity, COALESCE(test_delivered_quantity, 0) + 1) WHERE id = ?', [boost.id]);
        break;
      }
    }
  } catch (error) { console.error('[BoostTest] Synthetic booster pass failed:', error.message); }
  finally { running = false; }
}

function startSyntheticBoostTestRunner() {
  if (timer) return;
  const intervalMs = Math.max(5000, Number(process.env.BOOST_SYNTHETIC_TEST_INTERVAL_MS || 15000));
  timer = setInterval(runSyntheticBoostTestPass, intervalMs);
  runSyntheticBoostTestPass();
  console.log(`[BoostTest] Synthetic booster test runner started (${intervalMs}ms interval).`);
}

function stopSyntheticBoostTestRunner() { if (timer) { clearInterval(timer); timer = null; } }
module.exports = { startSyntheticBoostTestRunner, stopSyntheticBoostTestRunner };