function senderAddress() {
  return process.env.EMAIL_FROM
    || process.env.SMTP_FROM
    || process.env.SMTP_USER
    || 'QuickChat <onboarding@resend.dev>';
}

function senderEmail() {
  const value = senderAddress();
  return value.match(/<([^>]+)>/)?.[1] || value;
}

function logPreview({ to, subject, text }) {
  console.log(`[Email preview]\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
}

async function sendWithResend({ to, subject, text, html }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: senderAddress(),
      to: [to],
      subject,
      text,
      html,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend rejected the email (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }
  return { delivered: true, provider: 'resend' };
}

async function sendWithSendGrid({ to, subject, text, html }) {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: senderEmail() },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`SendGrid rejected the email (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }
  return { delivered: true, provider: 'sendgrid' };
}

async function sendWithSmtp({ to, subject, text, html }) {
  // Nodemailer is installed with the server dependencies so a custom domain or
  // Google Workspace/Gmail SMTP account can be configured entirely in .env.
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (_error) {
    throw new Error('SMTP is configured but nodemailer is not installed. Run: npm --prefix server install nodemailer');
  }
  if (!process.env.SMTP_URL && !process.env.SMTP_HOST) {
    throw new Error('Set SMTP_HOST (and SMTP_PORT) or SMTP_URL in server/.env.');
  }
  if (!process.env.EMAIL_FROM && !process.env.SMTP_FROM && !process.env.SMTP_USER) {
    throw new Error('Set EMAIL_FROM (the address emails should come from) in server/.env.');
  }
  if (!process.env.SMTP_URL && process.env.SMTP_USER && !process.env.SMTP_PASS) {
    throw new Error('SMTP_USER is set but SMTP_PASS is missing. Use your mail password or Gmail App Password.');
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secureSetting = String(process.env.SMTP_SECURE || '').toLowerCase();
  const secure = secureSetting
    ? ['true', '1', 'yes'].includes(secureSetting)
    : port === 465;
  const transporter = process.env.SMTP_URL
    ? nodemailer.createTransport(process.env.SMTP_URL)
    : nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      requireTLS: String(process.env.SMTP_REQUIRE_TLS || '').toLowerCase() === 'true',
      tls: {
        // Keep certificate verification on by default. Only disable this for a
        // local/self-hosted mail server that you control.
        rejectUnauthorized: String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false',
      },
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
      connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 15000),
      greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
      socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 30000),
    });

  const info = await transporter.sendMail({
    from: senderAddress(),
    to,
    subject,
    text,
    html,
  });
  return { delivered: true, provider: 'smtp', messageId: info.messageId || null };
}

function emailProvider() {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SENDGRID_API_KEY) return 'sendgrid';
  if (process.env.SMTP_HOST || process.env.SMTP_URL) return 'smtp';
  return 'preview';
}

async function sendEmail({ to, subject, text, html }) {
  if (!to) throw new Error('An email recipient is required.');
  if (process.env.RESEND_API_KEY) return sendWithResend({ to, subject, text, html });
  if (process.env.SENDGRID_API_KEY) return sendWithSendGrid({ to, subject, text, html });
  if (process.env.SMTP_HOST || process.env.SMTP_URL) return sendWithSmtp({ to, subject, text, html });

  // Local development without a provider: keep the flow usable by logging the
  // message and returning the link to the caller for a dev-only preview.
  logPreview({ to, subject, text });
  return { delivered: false, provider: 'preview', preview: text };
}

module.exports = { sendEmail, emailProvider };
