const axios = require('axios');
const { getSetting } = require('./platform-settings');

const DEFAULT_MODEL = 'gemini-2.5-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function getGeminiConfig() {
  const enabled = String(await getSetting('gemini_enabled', 'false')).toLowerCase() === 'true';
  const apiKey = String(await getSetting('gemini_api_key', '') || '').trim();
  const model = String(await getSetting('gemini_model', DEFAULT_MODEL) || DEFAULT_MODEL).trim();
  return { enabled, apiKey, model };
}

async function generateGeminiText({ system, prompt, temperature = 0.7, maxOutputTokens = 256, apiKey: suppliedKey } = {}) {
  const config = await getGeminiConfig();
  const apiKey = String(suppliedKey || config.apiKey).trim();
  if (!apiKey) throw new Error('Gemini API key is not configured. Add it in Admin → Admin settings.');
  if (!suppliedKey && !config.enabled) throw new Error('Gemini character AI is disabled in Admin settings.');

  const response = await axios.post(
    `${API_BASE}/${encodeURIComponent(config.model)}:generateContent`,
    {
      ...(system ? { systemInstruction: { parts: [{ text: String(system).slice(0, 12000) }] } } : {}),
      contents: [{ role: 'user', parts: [{ text: String(prompt || '').slice(0, 12000) }] }],
      generationConfig: {
        temperature: Math.max(0, Math.min(1.5, Number(temperature) || 0.7)),
        maxOutputTokens: Math.max(32, Math.min(2048, Number(maxOutputTokens) || 256)),
      },
    },
    { timeout: 45000, headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' } },
  );
  const text = (response.data?.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('').trim();
  if (!text) {
    const reason = response.data?.promptFeedback?.blockReason;
    throw new Error(reason ? `Gemini blocked this prompt (${reason}).` : 'Gemini returned an empty response.');
  }
  return text;
}

async function testGeminiConnection() {
  const config = await getGeminiConfig();
  const response = await generateGeminiText({
    system: 'You are a connection test. Respond briefly.',
    prompt: 'Reply with exactly: QuickChat Gemini connection successful.',
    temperature: 0,
    maxOutputTokens: 32,
  });
  return { ok: /QuickChat Gemini connection successful/i.test(response), model: config.model, response: response.slice(0, 160) };
}

module.exports = { getGeminiConfig, generateGeminiText, testGeminiConnection };
