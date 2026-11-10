const axios = require('axios');
const { getSetting } = require('./platform-settings');

const DEFAULT_MODEL = 'gemini-3.8-flash';
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MIN_REQUEST_INTERVAL_MS = Math.max(1000, Number(process.env.GEMINI_MIN_REQUEST_INTERVAL_MS) || 15000);
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = Math.max(30000, Number(process.env.GEMINI_RATE_LIMIT_COOLDOWN_MS) || 60000);
const DEFAULT_SERVICE_COOLDOWN_MS = Math.max(15000, Number(process.env.GEMINI_SERVICE_COOLDOWN_MS) || 30000);

let requestQueue = Promise.resolve();
let nextRequestAt = 0;
let cooldownUntil = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeModel(value) {
  let model = String(value || DEFAULT_MODEL).trim();
  if (model.startsWith('models/')) model = model.slice('models/'.length);
  if (!model || ['gemini-2.5-flash', 'gemini-2.5-pro'].includes(model)) model = DEFAULT_MODEL;
  return model;
}

function retryAfterMs(error) {
  const raw = error?.response?.headers?.['retry-after'] || error?.response?.headers?.['Retry-After'];
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

function markBackoff(error, status) {
  const retryMs = retryAfterMs(error);
  const fallback = status === 429 ? DEFAULT_RATE_LIMIT_COOLDOWN_MS : DEFAULT_SERVICE_COOLDOWN_MS;
  const waitMs = Math.max(retryMs, fallback);
  cooldownUntil = Math.max(cooldownUntil, Date.now() + waitMs);
  error.isGeminiBackoff = true;
  error.retryAfterMs = Math.max(0, cooldownUntil - Date.now());
  error.message = `Gemini API returned HTTP ${status}. Requests paused for about ${Math.ceil(error.retryAfterMs / 1000)} seconds. ${error.response?.data?.error?.message || error.message}`;
  return error;
}

function isGeminiBackoffError(error) {
  return Boolean(error?.isGeminiBackoff || [429, 503].includes(Number(error?.response?.status || error?.status)));
}

async function getGeminiConfig() {
  const enabled = String(await getSetting('gemini_enabled', 'false')).toLowerCase() === 'true';
  const apiKey = String(await getSetting('gemini_api_key', '') || '').trim();
  const model = normalizeModel(await getSetting('gemini_model', DEFAULT_MODEL));
  return { enabled, apiKey, model };
}

async function generateGeminiText({ system, prompt, temperature = 0.7, maxOutputTokens = 256, apiKey: suppliedKey } = {}) {
  const config = await getGeminiConfig();
  const apiKey = String(suppliedKey || config.apiKey).trim();
  if (!apiKey) throw new Error('Gemini API key is not configured. Add it in Admin → Admin settings.');
  if (!suppliedKey && !config.enabled) throw new Error('Gemini character AI is disabled in Admin settings.');

  const performRequest = async () => {
    const remainingCooldown = cooldownUntil - Date.now();
    if (remainingCooldown > 0) {
      const error = new Error(`Gemini requests are temporarily paused after a provider limit/error. Retry in about ${Math.ceil(remainingCooldown / 1000)} seconds.`);
      error.status = 429;
      error.isGeminiBackoff = true;
      error.retryAfterMs = remainingCooldown;
      throw error;
    }

    const waitMs = Math.max(0, nextRequestAt - Date.now());
    if (waitMs) await sleep(waitMs);
    nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;

    const payload = {
      model: config.model,
      input: String(prompt || '').slice(0, 12000),
      generation_config: {
        temperature: Math.max(0, Math.min(1.5, Number(temperature) || 0.7)),
        max_output_tokens: Math.max(32, Math.min(2048, Number(maxOutputTokens) || 256)),
      },
      store: false,
    };
    if (system) payload.system_instruction = String(system).slice(0, 12000);

    let response;
    try {
      response = await axios.post(API_URL, payload, {
        timeout: 45000,
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      const status = Number(error?.response?.status || 0);
      if (status === 429 || status === 503) throw markBackoff(error, status);
      const details = error?.response?.data?.error?.message;
      if (details) error.message = `Gemini API: ${details}`;
      throw error;
    }

    const steps = Array.isArray(response.data?.steps) ? response.data.steps : [];
    const text = steps
      .filter((step) => step.type === 'model_output')
      .flatMap((step) => Array.isArray(step.content) ? step.content : [])
      .filter((part) => part.type === 'text' || typeof part.text === 'string')
      .map((part) => part.text || '')
      .join('')
      .trim() || String(response.data?.output_text || '').trim();

    if (!text) {
      const apiError = response.data?.error?.message ||
        response.data?.errors?.map((item) => item.message).filter(Boolean).join('; ');
      if (response.data?.status === 'failed' || apiError) throw new Error(apiError || 'Gemini interaction failed.');
      throw new Error('Gemini returned an empty response.');
    }
    return text;
  };

  const queuedRequest = requestQueue.then(performRequest);
  requestQueue = queuedRequest.catch(() => undefined);
  return queuedRequest;
}

async function testGeminiConnection() {
  const config = await getGeminiConfig();
  const response = await generateGeminiText({
    apiKey: config.apiKey,
    system: 'You are a connection test. Respond briefly.',
    prompt: 'Reply with exactly: QuickChat Gemini connection successful.',
    temperature: 0,
    maxOutputTokens: 32,
  });
  return { ok: /QuickChat Gemini connection successful/i.test(response), model: config.model, response: response.slice(0, 160) };
}

module.exports = { getGeminiConfig, generateGeminiText, testGeminiConnection, isGeminiBackoffError };
