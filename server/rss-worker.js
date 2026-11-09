require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });

const db = require('./database');
const { initializePageTables } = require('./schema');

let stopping = false;

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log('[RSS worker] Received ' + signal + ', shutting down.');
  await db.close().catch((error) => console.error('[RSS worker] Database close failed:', error.message));
  process.exit(0);
}

async function start() {
  // RSS ingestion is deliberately manual-only. The admin must press Sync in
  // the RSS dashboard; no background worker may fetch or publish feed items.
  await initializePageTables();
  console.log('[RSS worker] Automatic RSS ingestion is disabled. Use the admin manual Sync action.');
  await db.close();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

start().catch(async (error) => {
  console.error('[RSS worker] Could not initialize:', error);
  await db.close().catch(() => {});
  process.exitCode = 1;
});
