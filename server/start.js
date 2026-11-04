const { spawn } = require('node:child_process');

// Production-style launcher: the API and the bot runtime share one lifecycle so
// the character accounts keep following, liking, and replying while the app is up.
// `npm run dev` starts the same two processes from dev.js instead.
const serverDirectory = __dirname;
const botRestartDelayMs = 5000;
let shuttingDown = false;
let botRestartTimer;

const api = spawn(process.execPath, ['--use-system-ca', 'index.js'], {
  cwd: serverDirectory,
  env: process.env,
  stdio: 'inherit',
});

let bot = startBot();

function startBot() {
  const child = spawn(process.execPath, ['--use-system-ca', 'ai-poster.js'], {
    cwd: serverDirectory,
    env: process.env,
    stdio: 'inherit',
  });
  child.on('error', (error) => {
    console.error('[Quickchat] Could not start the bot runtime:', error.message);
    scheduleBotRestart();
  });
  child.on('exit', (code) => {
    if (shuttingDown) return;
    console.error(`[Quickchat] The bot runtime stopped${code ? ` (exit ${code})` : ''}; restarting it.`);
    bot = null;
    scheduleBotRestart();
  });
  return child;
}

function scheduleBotRestart() {
  if (shuttingDown || botRestartTimer) return;
  botRestartTimer = setTimeout(() => {
    botRestartTimer = null;
    if (!shuttingDown) bot = startBot();
  }, botRestartDelayMs);
}

function stop(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(botRestartTimer);
  bot?.kill('SIGTERM');
  api.kill('SIGTERM');
  process.exitCode = code;
}

api.on('error', (error) => {
  console.error('[Quickchat] Could not start the API:', error.message);
  stop(1);
});
api.on('exit', (code) => {
  if (shuttingDown) return;
  console.error(`[Quickchat] The API stopped${code ? ` (exit ${code})` : ''}.`);
  stop(code || 1);
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0));
