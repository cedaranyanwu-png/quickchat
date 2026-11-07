const API_VERSION = String(process.env.WHATSAPP_API_VERSION || 'v22.0').trim();
function config() {
  return {
    phoneNumberId: String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim(),
    token: String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim(),
    verificationTemplate: String(process.env.WHATSAPP_VERIFICATION_TEMPLATE || 'quickchat_phone_verification').trim(),
    notificationTemplate: String(process.env.WHATSAPP_NOTIFICATION_TEMPLATE || 'quickchat_admin_notification').trim(),
    language: String(process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en').trim(),
  };
}
function normalizePhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const compact = raw.replace(/[\s().-]/g, '');
  if (!/^\+?[1-9]\d{7,14}$/.test(compact)) return '';
  return compact.startsWith('+') ? compact.slice(1) : compact;
}
function isConfigured() {
  const c = config();
  return Boolean(c.phoneNumberId && c.token);
}
async function sendTemplate(to, templateName, parameters = []) {
  const c = config();
  if (!isConfigured()) return { delivered: false, status: 'not_configured', error: 'WhatsApp Cloud API is not configured.' };
  const phone = normalizePhone(to);
  if (!phone) return { delivered: false, status: 'invalid_phone', error: 'Phone number must use international format, e.g. +2348012345678.' };
  const components = parameters.length ? [{
    type: 'body',
    parameters: parameters.map((value) => ({ type: 'text', text: String(value).slice(0, 1024) })),
  }] : [];
  const response = await fetch(`https://graph.facebook.com/${API_VERSION}/${c.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'template',
      template: { name: templateName, language: { code: c.language }, ...(components.length ? { components } : {}) },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data?.error?.message || `WhatsApp API returned HTTP ${response.status}.`;
    return { delivered: false, status: 'failed', error, providerId: data?.error?.fbtrace_id || null };
  }
  return { delivered: true, status: 'accepted', providerMessageId: data?.messages?.[0]?.id || null };
}
async function sendVerification(phone, url) {
  return sendTemplate(phone, config().verificationTemplate, [url]);
}
async function sendAdminNotification(phone, title, message) {
  return sendTemplate(phone, config().notificationTemplate, [title, message]);
}
module.exports = { normalizePhone, isConfigured, sendVerification, sendAdminNotification };
