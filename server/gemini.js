const axios = require('axios');
const { getSetting } = require('./platform-settings');

const DEFAULT_MODEL = 'gemini-3.8-flash';
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

function normalizeModel(value) {
  let model = String(value || DEFAULT_MODEL).trim().replace(/^models\//i, '');
  // Migrate previously saved model selections automatically.
  if (!model || ['gemini-2.5-flash', 'gemini-2.5-pro'].includes(model)) {
    model = DEFAULT_MODEL;
  }
  return model;
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

  const response = await axios.post(API_URL, payload, {
    timeout: 45000,
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
  });

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
    if (response.data?.status === 'failed' || apiError) {
      throw new Error(apiError || 'Gemini interaction failed.');
    }
    throw new Error('Gemini returned an empty response.');
  }
  return text;
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

module.exports = { getGeminiConfig, generateGeminiText, testGeminiConnection };
