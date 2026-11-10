const { getSetting } = require('./platform-settings');

async function setting(key, fallback = '') {
  try {
    const value = await getSetting(key, fallback);
    return value == null ? fallback : String(value);
  } catch (_error) {
    return fallback;
  }
}

async function smtpConfig() {
  const mode = (await setting('email_provider_mode', 'env')).toLowerCase();
  if (mode === 'gmail' || mode === 'custom') {
    const host = mode === 'gmail' ? 'smtp.gmail.com' : await setting('smtp_host');
    const port = Number(mode === 'gmail' ? 465 : await setting('smtp_port', '587'));
    const secure = mode === 'gmail' ? true : (await setting('smtp_secure', 'false')) === 'true';
    const user = mode === 'gmail' ? await setting('smtp_user') : await setting('smtp_user');
    const pass = mode === 'gmail' ? await setting('smtp_password') : await setting('smtp_password');
    const from = await setting('smtp_from', user);
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !pass || !from) {
      throw new Error('Complete the SMTP host, port, username, password and sender address in Admin Settings.');
    }
    return { mode, host, port, secure, user, pass, from };
  }
  return null;
}

function senderAddress(config) {
  return config?.from || process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || 'QuickChat <onboarding@resend.dev>';
}
function senderEmail() {
  const value = senderAddress();
  return value.match(/<([^>]+)>/)?.[1] || value;
}
function logPreview({ to, subject, text }) {
  console.log(`[Email preview]\\nTo: ${to}\\nSubject: ${subject}\\n\\n${text}\\n`);
}
async function sendWithResend({ to, subject, text, html }, apiKey, from) {
  if (!apiKey) throw new Error('Add and save your Resend API key in Admin Settings.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: from || senderAddress(), to: [to], subject, text, html }),
  });
  if (!response.ok) {
    let detail = '';
    try { const body = await response.json(); detail = body.message || body.error || ''; } catch (_error) {}
    throw new Error(detail ? `Resend error (${response.status}): ${detail}` : `Resend rejected the email (${response.status}).`);
  }
  return { delivered: true, provider: 'resend' };
}

async function sendWithBrevo({ to, subject, text, html }, apiKey, from) {
  if (!apiKey) throw new Error('Add and save your Brevo API key in Admin Settings.');
  const sender = String(from || process.env.EMAIL_FROM || process.env.SMTP_FROM || '').trim();
  const match = sender.match(/^(.*?)\\s*<([^>]+)>$/);
  const senderEmailValue = match ? match[2].trim() : sender;
  const senderName = match && match[1].trim() ? match[1].trim().replace(/^["']|["']$/g, '') : 'QuickChat';
  if (!senderEmailValue || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(senderEmailValue)) {
    throw new Error('Enter a valid sender email address verified in Brevo.');
  }
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { name: senderName, email: senderEmailValue }, to: [{ email: to }], subject, textContent: text, ...(html ? { htmlContent: html } : {}) }),
  });
  if (!response.ok) {
    let detail = '';
    try { const body = await response.json(); detail = body.message || body.code || ''; } catch (_error) {}
    throw new Error(detail ? `Brevo error (${response.status}): ${detail}` : `Brevo rejected the email (${response.status}).`);
  }
  let result = {};
  try { result = await response.json(); } catch (_error) {}
  return { delivered: true, provider: 'brevo', messageId: result.messageId || null };
}

async function sendWithSendGrid({ to, subject, text, html }) {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from: { email: senderEmail() }, subject,
      content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }] }),
  });
  if (!response.ok) throw new Error(`SendGrid rejected the email (${response.status}).`);
  return { delivered: true, provider: 'sendgrid' };
}
async function sendWithSmtp({ to, subject, text, html }, config) {
  const nodemailer = require('nodemailer');
  const envMode = !config;
  const port = Number(process.env.SMTP_PORT || 587);
  const secureSetting = String(process.env.SMTP_SECURE || '').toLowerCase();
  const options = config ? {
    host: config.host, port: config.port, secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 30000,
  } : {
    ...(process.env.SMTP_URL ? { } : { host: process.env.SMTP_HOST, port,
      secure: secureSetting ? ['true','1','yes'].includes(secureSetting) : port === 465,
      requireTLS: String(process.env.SMTP_REQUIRE_TLS || '').toLowerCase() === 'true',
      tls: { rejectUnauthorized: String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false' },
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined }),
    connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 30000,
  };
  const transporter = !config && process.env.SMTP_URL
    ? nodemailer.createTransport(process.env.SMTP_URL)
    : nodemailer.createTransport(options);
  const info = await transporter.sendMail({ from: senderAddress(config), to, subject, text, html });
  return { delivered: true, provider: 'smtp', messageId: info.messageId || null };
}
async function sendEmail({ to, subject, text, html }) {
  if (!to) throw new Error('An email recipient is required.');
  const mode = (await setting('email_provider_mode', 'env')).toLowerCase();
  if (mode === 'brevo') {
    const apiKey = await setting('brevo_api_key') || process.env.BREVO_API_KEY;
    const from = await setting('smtp_from') || process.env.EMAIL_FROM || process.env.SMTP_FROM;
    return sendWithBrevo({ to, subject, text, html }, apiKey, from);
  }
  if (mode === 'resend') {
    const apiKey = await setting('resend_api_key') || process.env.RESEND_API_KEY;
    const from = await setting('smtp_from') || process.env.EMAIL_FROM || process.env.SMTP_FROM;
    return sendWithResend({ to, subject, text, html }, apiKey, from);
  }
  const config = await smtpConfig();
  if (config) return sendWithSmtp({ to, subject, text, html }, config);
  if (process.env.RESEND_API_KEY) return sendWithResend({ to, subject, text, html }, process.env.RESEND_API_KEY);
  if (process.env.SMTP_HOST || process.env.SMTP_URL) return sendWithSmtp({ to, subject, text, html }, null);
  logPreview({ to, subject, text });
  return { delivered: false, provider: 'preview', preview: text };
}
async function testEmailConnection(to) {
  const mode = (await setting('email_provider_mode', 'env')).toLowerCase();
  const message = { to, subject: 'QuickChat email delivery test', text: 'Your QuickChat email delivery configuration is working.', html: '<p>Your QuickChat email delivery configuration is working.</p>' };
  if (mode === 'brevo') {
    const apiKey = await setting('brevo_api_key') || process.env.BREVO_API_KEY;
    const from = await setting('smtp_from') || process.env.EMAIL_FROM || process.env.SMTP_FROM;
    return sendWithBrevo(message, apiKey, from);
  }
  if (mode === 'resend') {
    const apiKey = await setting('resend_api_key') || process.env.RESEND_API_KEY;
    const from = await setting('smtp_from') || process.env.EMAIL_FROM || process.env.SMTP_FROM;
    return sendWithResend(message, apiKey, from);
  }
  const config = await smtpConfig();
  if (!config) throw new Error('Choose Resend API, Gmail App Password or Custom SMTP and save the settings first.');
  return sendWithSmtp(message, config);
}
async function emailProvider() {
  const mode = await setting('email_provider_mode', 'env');
  if (mode === 'brevo') return 'brevo';
  if (mode === 'resend') return 'resend';
  if (mode === 'gmail' || mode === 'custom') return 'smtp';
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SENDGRID_API_KEY) return 'sendgrid';
  if (process.env.SMTP_HOST || process.env.SMTP_URL) return 'smtp';
  return 'preview';
}
module.exports = { sendEmail, emailProvider, testEmailConnection };
