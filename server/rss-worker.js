require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });

const schedule = require('node-schedule');
const db = require('./database');
const { initializePageTables } = require('./schema');
const { syncEnabledSources } = require('./services/rss-service');

const cronExpression = process.env.RSS_SYNC_CRON || '*/15 * * * *';
let job;
let running = false;
let stopping = false;

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
