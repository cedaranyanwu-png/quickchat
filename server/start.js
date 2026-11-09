const { spawn } = require('node:child_process');

// Production launcher: the API, character bot runtime, and RSS synchronization
// worker share one lifecycle so feeds continue importing while QuickChat is up.
// `npm run dev` starts the same runtimes from dev.js instead.
const serverDirectory = __dirname;
const restartDelayMs = 5000;
let shuttingDown = false;
const restartTimers = new Map();
const children = new Map();

function startManagedProcess(name, script) {
  const child = spawn(process.execPath, ['--use-system-ca', script], {
    cwd: serverDirectory,
    env: process.env,
    stdio: 'inherit',
  });
  children.set(name, child);

  child.on('error', (error) => {
    console.error(`[Quickchat] Could not start ${name}:`, error.message);
    children.delete(name);
    scheduleRestart(name, script);
  });
  child.on('exit', (code, signal) => {
    if (children.get(name) === child) children.delete(name);
    if (shuttingDown) return;
    console.error(`[Quickchat] ${name} stopped${code ? ` (exit ${code})` : ''}${signal ? ` (signal ${signal})` : ''}; restarting it.`);
    scheduleRestart(name, script);
  });
  return child;
}

function scheduleRestart(name, script) {
  if (shuttingDown || restartTimers.has(name)) return;
  const timer = setTimeout(() => {
    restartTimers.delete(name);
    if (!shuttingDown && !children.has(name)) startManagedProcess(name, script);
  }, restartDelayMs);
  restartTimers.set(name, timer);
}

const api = startManagedProcess('API', 'index.js');
startManagedProcess('character bot runtime', 'ai-poster.js');
startManagedProcess('RSS synchronization worker', 'rss-worker.js');

function stop(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const timer of restartTimers.values()) clearTimeout(timer);
  restartTimers.clear();
  for (const child of children.values()) child.kill('SIGTERM');
  process.exitCode = code;
}

api.on('exit', (code) => {
  if (shuttingDown) return;
  console.error(`[Quickchat] The API stopped${code ? ` (exit ${code})` : ''}.`);
  stop(code || 1);
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0));
