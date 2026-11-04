const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');

const requireFromProject = createRequire(path.join(__dirname, '..', 'package.json'));
const projectRoot = path.resolve(__dirname, '..');
const reactStart = requireFromProject.resolve('react-scripts/scripts/start');

const api = spawn(process.execPath, ['--use-system-ca', 'index.js'], {
  cwd: __dirname,
  env: { ...process.env, PORT: process.env.API_PORT || '5000' },
  stdio: 'inherit',
});
const frontendEnv = {
  ...process.env,
  // CRA can receive an empty LAN address on some machines and pass it to
  // webpack-dev-server as an invalid allowedHosts entry. Keep this dev server
  // local and let CRA skip that check for the localhost proxy setup.
  HOST: '127.0.0.1',
  DANGEROUSLY_DISABLE_HOST_CHECK: 'true',
  PORT: process.env.FRONTEND_PORT || '5001',
  BROWSER: process.env.BROWSER || 'none',
};
const frontend = spawn(process.execPath, [reactStart], {
  cwd: projectRoot,
  env: frontendEnv,
  stdio: 'inherit',
});
let aiPoster;
let aiPosterRestartTimer;
const coreChildren = [['API', api], ['frontend', frontend]];

let shuttingDown = false;
function stop(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(aiPosterRestartTimer);
  for (const [, child] of coreChildren) child.kill('SIGTERM');
  aiPoster?.kill('SIGTERM');
  process.exitCode = code;
}

for (const [name, child] of coreChildren) {
  child.on('error', (error) => {
    console.error(`[Quickchat] Could not start the ${name}:`, error.message);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[Quickchat] The ${name} stopped.`);
      stop(code || 1);
    }
  });
}

function startAiPoster() {
  if (shuttingDown) return;
  const child = spawn(process.execPath, ['--use-system-ca', 'ai-poster.js'], {
    cwd: __dirname,
    env: process.env,
    stdio: 'inherit',
  });
  aiPoster = child;
  child.on('error', (error) => {
    console.error('[Quickchat] Could not start the AI poster:', error.message);
    scheduleAiPosterRestart();
  });
  child.on('exit', (code) => {
    if (shuttingDown) return;
    console.error(`[Quickchat] The AI poster stopped${code ? ` (exit ${code})` : ''}; the API and frontend will stay up.`);
    scheduleAiPosterRestart();
  });
}

function scheduleAiPosterRestart() {
  if (shuttingDown || aiPosterRestartTimer) return;
  aiPosterRestartTimer = setTimeout(() => {
    aiPosterRestartTimer = null;
    startAiPoster();
  }, 5000);
}

startAiPoster();

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0));
