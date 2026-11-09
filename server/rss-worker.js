require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });

const schedule = require('node-schedule');
const db = require('./database');
const { initializePageTables } = require('./schema');
const { syncEnabledSources } = require('./services/rss-service');

const cronExpression = process.env.RSS_SYNC_CRON || '*/15 * * * *';
const initialActivationKey = 'rss_sources_initial_activation_v1';
let job;
let running = false;
let stopping = false;

async function activateExistingSourcesOnce() {
  const completed = await db.getOne(
    'SELECT setting_value FROM app_settings WHERE setting_key = ?',
    [initialActivationKey],
  );
  if (completed) return;

  const disabled = await db.getOne('SELECT COUNT(*) AS total FROM rss_sources WHERE enabled = 0 OR auto_sync = 0');
  const activatedCount = Number(disabled && disabled.total || 0);
  if (activatedCount > 0) {
    await db.update(
      'UPDATE rss_sources SET enabled = 1, auto_sync = 1, updated_at = CURRENT_TIMESTAMP WHERE enabled = 0 OR auto_sync = 0',
    );
  }
  await db.insert(
    'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)',
    [initialActivationKey, new Date().toISOString()],
  );
  console.log('[RSS worker] Initial publisher activation completed: enabled ' + activatedCount + ' existing source(s).');
}

async function runSync(reason) {
  if (running || stopping) return;
  running = true;
  const startedAt = Date.now();
  try {
    const results = await syncEnabledSources();
    const imported = results.reduce((sum, item) => sum + Number(item.imported || 0), 0);
    const failed = results.filter((item) => !item.success).length;
    console.log('[RSS worker] ' + reason + ': sources=' + results.length +
      ', imported=' + imported + ', failed=' + failed + ', durationMs=' + (Date.now() - startedAt));
    for (const item of results.filter((entry) => !entry.success)) {
      console.error('[RSS worker] source ' + item.sourceId + ': ' + item.error);
    }
  } catch (error) {
    console.error('[RSS worker] Synchronization cycle failed:', error.message || error);
  } finally {
    running = false;
  }
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log('[RSS worker] Received ' + signal + ', shutting down.');
  if (job) job.cancel();
  while (running) await new Promise((resolve) => setTimeout(resolve, 250));
  await db.close().catch((error) => console.error('[RSS worker] Database close failed:', error.message));
  process.exit(0);
}

async function start() {
  await initializePageTables();
  await activateExistingSourcesOnce();
  job = schedule.scheduleJob(cronExpression, () => runSync('scheduled'));
  if (!job) throw new Error('Invalid RSS_SYNC_CRON expression: ' + cronExpression);
  console.log('[RSS worker] Scheduled with "' + cronExpression + '".');
  if (String(process.env.RSS_SYNC_ON_START || 'true').toLowerCase() !== 'false') {
    await runSync('startup');
  }
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

start().catch(async (error) => {
  console.error('[RSS worker] Could not start:', error);
  await db.close().catch(() => {});
  process.exitCode = 1;
});
