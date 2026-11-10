const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const db = require('./database');
const { sendEmail } = require('./email');
const { createToken, authenticate } = require('./middleware/authenticate');
const { recordRegistration } = require('./traffic-security');
const { awardReferral } = require('./rewards');

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';
const VERIFICATION_TTL_MINUTES = 24 * 60;
const RESET_TTL_MINUTES = 60;
const recentEmailSends = new Map();

const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.REACT_APP_GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(googleClientId);

function appBaseUrl() {
  const configured = (process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
  if (!isProduction) {
    const clientOrigin = (process.env.CLIENT_ORIGIN || '').split(',')[0].trim().replace(/\/$/, '');
    if (clientOrigin) return clientOrigin;
    return 'http://localhost:5001';
  }
  return configured || 'http://localhost:5000';
}

function issueToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function tokenExpiry(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString().replace('T', ' ').slice(0, 19);
}

function expiryPassed(value) {
  if (!value) return true;
  const timestamp = value instanceof Date
    ? value.getTime()
    : new Date(`${String(value).replace(' ', 'T')}Z`).getTime();
  return !Number.isFinite(timestamp) || timestamp <= Date.now();
}

function recentlySent(key, windowMs = 60_000) {
  const now = Date.now();
  const last = recentEmailSends.get(key);
  if (last && now - last < windowMs) return true;
  recentEmailSends.set(key, now);
  return false;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function emailShell(title, intro, actionLabel, url, footer) {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
    <h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(title)}</h1>
    <p style="font-size:14px;line-height:22px;color:#334155">${escapeHtml(intro)}</p>
    <p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:bold;font-size:14px">${escapeHtml(actionLabel)}</a></p>
    <p style="font-size:12px;line-height:20px;color:#64748b">If the button does not work, copy this link into your browser:<br><a href="${escapeHtml(url)}" style="color:#1d4ed8;word-break:break-all">${escapeHtml(url)}</a></p>
    <p style="font-size:12px;line-height:20px;color:#64748b">${escapeHtml(footer)}</p>
  </div>`;
}

function verificationEmail(fullName, url) {
  const name = fullName ? `Hi ${fullName},` : 'Hi,';
  return {
    subject: 'Verify your QuickChat email',
    text: `${name}\n\nConfirm your email address to finish setting up QuickChat. This link expires in 24 hours:\n${url}\n\nIf you did not create this account, you can ignore this message.`,
    html: emailShell('Verify your QuickChat email', `${name} Confirm your email address to finish setting up QuickChat. This link expires in 24 hours.`, 'Verify email', url, 'If you did not create this account, you can ignore this message.'),
  };
}

function passwordResetEmail(fullName, url) {
  const name = fullName ? `Hi ${fullName},` : 'Hi,';
  return {
    subject: 'Reset your QuickChat password',
    text: `${name}\n\nUse this link to choose a new QuickChat password. It expires in 60 minutes:\n${url}\n\nIf you did not request this, you can ignore this message.`,
    html: emailShell('Reset your QuickChat password', `${name} Use this link to choose a new QuickChat password. It expires in 60 minutes.`, 'Reset password', url, 'If you did not request this, you can ignore this message.'),
  };
}

async function sendVerificationEmail(user) {
  const token = issueToken();
  await db.update(
    'UPDATE users SET email_verification_token = ?, email_verification_expires = ? WHERE id = ?',
    [hashToken(token), tokenExpiry(VERIFICATION_TTL_MINUTES), user.id],
  );
  const verificationUrl = `${appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  try {
    const delivery = await sendEmail({ to: user.email, ...verificationEmail(user.fullName || user.fullname, verificationUrl) });
    return { ...delivery, verificationUrl };
  } catch (error) {
    console.error('[Auth] Could not send verification email:', error.message);
    return { delivered: false, provider: 'failed', verificationUrl };
  }
}

router.post('/register', async (req, res) => {
  const fullName = String(req.body?.fullName || '').trim();
  const username = String(req.body?.username || '').trim();
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!fullName || !username || !email || password.length < 6) {
    return res.status(400).json({
      message: 'Enter your name, username, a valid email address, and a password with at least 6 characters',
    });
  }

  try {
    const existingUser = await db.getOne(
      'SELECT id FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)',
      [email, username],
    );
    if (existingUser) {
      return res.status(409).json({ message: 'That email or username is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = normalizeUser(
      await db.insert(
        // Keep the legacy NOT NULL `name` column populated in older SQLite files.
        'INSERT INTO users (fullname, name, username, email, password, googleid, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [fullName, fullName, username, email, passwordHash, null, 0],
      ),
    );

    if (!user) throw new Error('The account was created but could not be loaded.');
    await createWelcomeNotification(user.id);
    await recordRegistration(req, user.id);
    const referralCode = String(req.body?.referralCode || req.body?.ref || '').trim().toUpperCase();
    const referrerMatch = referralCode.match(/^QC(\d{1,12})$/);
    if (referrerMatch) await awardReferral(Number(referrerMatch[1]), user.id).catch((error) => console.warn('[Rewards] Referral reward could not be issued:', error.message));
    const delivery = await sendVerificationEmail(user);
    return res.status(201).json({
      emailVerificationRequired: true,
      email: user.email,
      message: delivery.delivered
        ? 'Account created. Check your inbox and verify your email before signing in.'
        : 'Account created, but the verification email could not be sent. Request another link after email delivery is configured.',
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ message: 'That email or username is already registered.' });
    }
    console.error('[Auth] Registration failed:', error);
    return res.status(500).json({ message: 'Could not create your account. Please try again.' });
  }
});

router.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ message: 'Enter your email and password.' });
  }

  try {
    const user = normalizeUser(
      await db.getOne('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email]),
    );
    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }
    if (Number(user.email_verified || 0) !== 1) {
      let delivery = null;
      if (!recentlySent(`verify-login:${user.id}`)) delivery = await sendVerificationEmail(user);
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        requiresEmailVerification: true,
        email: user.email,
        message: delivery?.delivered
          ? 'Verify your email address before signing in. A fresh verification link has been sent.'
          : 'Your email address is not verified. Request a new verification link or correct the email address.',
      });
    }
    return sendSession(res, user, 200, 'Login successful');
  } catch (error) {
    console.error('[Auth] Login failed:', error);
    return res.status(500).json({ message: 'Could not sign in. Please try again.' });
  }
});

router.post('/google', async (req, res) => {
  const token = req.body?.token;
  if (!token) return res.status(400).json({ message: 'Google token is required.' });
  if (!googleClientId) {
    return res.status(503).json({ message: 'Google sign-in is not configured on the server.' });
  }

  try {
    // Verify the credential with Google before creating a QuickChat session.
    const ticket = await googleClient.verifyIdToken({ idToken: token, audience: googleClientId });
    const payload = ticket.getPayload();
    const email = normalizeEmail(payload?.email);
    const googleId = payload?.sub;
    const fullName = String(payload?.name || payload?.email || '').trim();
    const picture = payload?.picture || null;

    if (!email || !googleId || payload?.email_verified !== true) {
      return res.status(401).json({ message: 'Google did not provide a verified email address.' });
    }

    let user = normalizeUser(
      await db.getOne('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email]),
    );
    if (user?.isSynthetic) {
      return res.status(403).json({ message: 'Automated QuickChat accounts cannot use human sign-in.' });
    }
    let createdAccount = false;

    if (!user) {
      const username = await createGoogleUsername(fullName, email);
      user = normalizeUser(
        await db.insert(
          // Google-created accounts use the same legacy `name` compatibility field.
          'INSERT INTO users (fullname, name, username, email, password, googleid, picture, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
          [fullName || email, fullName || email, username, email, null, googleId, picture],
        ),
      );
      createdAccount = true;
    } else if (!user.googleId) {
      await db.update(
        `UPDATE users SET googleid = ?, picture = ?, email_verified = 1, email_verification_notice = 0,
           email_verification_token = NULL, email_verification_expires = NULL WHERE id = ?`,
        [googleId, picture, user.id],
      );
      user.googleId = googleId;
      user.picture = picture;
      user.email_verified = 1;
    } else if (user.googleId !== googleId) {
      return res.status(409).json({
        message: 'This email is already linked to a different Google account.',
      });
    } else if (picture && !user.picture) {
      await db.update('UPDATE users SET picture = ? WHERE id = ?', [picture, user.id]);
      user.picture = picture;
    }

    if (!user) throw new Error('The Google account was verified but could not be loaded.');
    if (Number(user.email_verified) === 0) {
      await db.update(
        `UPDATE users SET email_verified = 1, email_verification_notice = 0, email_verification_token = NULL,
           email_verification_expires = NULL WHERE id = ?`,
        [user.id],
      );
      user.email_verified = 1;
    }
    if (createdAccount) {
      await createWelcomeNotification(user.id);
      await recordRegistration(req, user.id);
      const referralCode = String(req.body?.referralCode || req.body?.ref || '').trim().toUpperCase();
      const referrerMatch = referralCode.match(/^QC(\d{1,12})$/);
      if (referrerMatch) await awardReferral(Number(referrerMatch[1]), user.id).catch((error) => console.warn('[Rewards] Referral reward could not be issued:', error.message));
    }
    return sendSession(res, user, 200, 'Google login successful', { picture });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ message: 'That Google account is already linked to another user.' });
    }
    console.error('[Auth] Google sign-in failed:', error.message);
    return res.status(401).json({ message: 'Google sign-in failed. Please try again.' });
  }
});

router.get('/email-status', (req, res, next) => authenticate(req, res, next, { allowUnverified: true }), async (req, res) => {
  try {
    const user = await db.getOne('SELECT id, email, email_verified, email_verification_notice FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    return res.json({
      email: user.email,
      emailVerified: Number(user.email_verified || 0) === 1,
      showVerificationNotice: Number(user.email_verification_notice || 0) === 1 && Number(user.email_verified || 0) !== 1,
    });
  } catch (error) {
    console.error('[Auth] Email status lookup failed:', error.message);
    return res.status(500).json({ message: 'Could not check email verification status.' });
  }
});

router.post('/change-unverified-email', async (req, res) => {
  const currentEmail = normalizeEmail(req.body?.email);
  const newEmail = normalizeEmail(req.body?.newEmail);
  const password = String(req.body?.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentEmail) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return res.status(400).json({ message: 'Enter valid current and new email addresses.' });
  }
  if (!password) return res.status(400).json({ message: 'Enter your account password to change the email.' });
  try {
    const user = await db.getOne('SELECT id, fullname, email, password, email_verified FROM users WHERE LOWER(email) = LOWER(?)', [currentEmail]);
    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }
    if (Number(user.email_verified || 0) === 1) return res.status(409).json({ message: 'This email is already verified. Change it from account settings instead.' });
    if (recentlySent(`change-unverified:${user.id}`)) return res.status(429).json({ message: 'Please wait one minute before changing this email again.' });
    const duplicate = await db.getOne('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ?', [newEmail, user.id]);
    if (duplicate) return res.status(409).json({ message: 'That email address is already in use.' });
    await db.update(
      `UPDATE users SET email = ?, email_verified = 0, email_verification_notice = 0,
         email_verification_token = NULL, email_verification_expires = NULL,
         password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?`,
      [newEmail, user.id],
    );
    const delivery = await sendVerificationEmail({ id: user.id, fullname: user.fullname, email: newEmail });
    return res.json({
      message: delivery.delivered
        ? 'Email updated. A verification link has been sent to the new address.'
        : 'Email updated, but delivery is not configured yet. Use resend after SMTP is configured.',
      email: newEmail,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return res.status(409).json({ message: 'That email address is already in use.' });
    console.error('[Auth] Unverified email correction failed:', error.message);
    return res.status(500).json({ message: 'Could not change the email address.' });
  }
});

router.post('/change-email', authenticate, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
  if (!password) return res.status(400).json({ message: 'Enter your current password to change your email address.' });
  try {
    const user = await db.getOne('SELECT id, fullname, email, password FROM users WHERE id = ?', [req.user.id]);
    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Your current password is incorrect.' });
    }
    const duplicate = await db.getOne('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ?', [email, req.user.id]);
    if (duplicate) return res.status(409).json({ message: 'That email address is already in use.' });
    await db.update(
      `UPDATE users SET email = ?, email_verified = 0, email_verification_notice = 1,
         email_verification_token = NULL, email_verification_expires = NULL,
         password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?`,
      [email, req.user.id],
    );
    const delivery = await sendVerificationEmail({ id: user.id, fullname: user.fullname, email });
    return res.json({
      message: delivery.delivered
        ? 'Email address updated. Check the new inbox for your verification link.'
        : 'Email address updated, but the verification message could not be sent. Configure SMTP and request another link.',
      email,
      delivered: Boolean(delivery.delivered),
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return res.status(409).json({ message: 'That email address is already in use.' });
    console.error('[Auth] Email change failed:', error.message);
    return res.status(500).json({ message: 'Could not update your email address.' });
  }
});

router.post('/verify-email', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!token) return res.status(400).json({ message: 'A verification token is required.' });
  try {
    const user = await db.getOne(
      'SELECT id, email, email_verification_expires FROM users WHERE email_verification_token = ?',
      [hashToken(token)],
    );
    if (!user) return res.status(400).json({ message: 'This verification link is invalid or has already been used.' });
    if (expiryPassed(user.email_verification_expires)) {
      return res.status(400).json({ message: 'This verification link has expired. Request a new one.' });
    }
    await db.update(
      `UPDATE users SET email_verified = 1, email_verification_notice = 0, email_verification_token = NULL,
         email_verification_expires = NULL WHERE id = ?`,
      [user.id],
    );
    return res.json({ message: 'Email verified. You can sign in now.', email: user.email });
  } catch (error) {
    console.error('[Auth] Email verification failed:', error);
    return res.status(500).json({ message: 'Could not verify this email. Please try again.' });
  }
});

router.post('/resend-verification', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const generic = { message: 'If that account still needs verification, a new link is on its way.' };
  if (!email) return res.status(400).json({ message: 'Enter the email address you registered with.' });
  if (recentlySent(`verify:${email}`)) return res.json(generic);

  try {
    const user = await db.getOne(
      'SELECT id, fullname, email, email_verified FROM users WHERE LOWER(email) = LOWER(?)',
      [email],
    );
    if (!user || Number(user.email_verified) === 1) return res.json(generic);
    const delivery = await sendVerificationEmail(user);
    return res.json({
      ...generic,
      ...(!isProduction && !delivery.delivered ? { previewUrl: delivery.verificationUrl } : {}),
    });
  } catch (error) {
    console.error('[Auth] Resend verification failed:', error);
    return res.status(500).json({ message: 'Could not send a new verification email. Please try again.' });
  }
});


router.post('/forgot-password', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const generic = { message: 'If an account exists for that email, a password reset link is on its way.' };
  if (!email) return res.status(400).json({ message: 'Enter the email address for your account.' });
  if (recentlySent(`reset:${email}`)) return res.json(generic);

  try {
    const user = await db.getOne(
      'SELECT id, fullname, email FROM users WHERE LOWER(email) = LOWER(?)',
      [email],
    );
    if (!user) return res.json(generic);

    const token = issueToken();
    await db.update(
      'UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?',
      [hashToken(token), tokenExpiry(RESET_TTL_MINUTES), user.id],
    );
    const resetUrl = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    let delivery = { delivered: false, provider: 'failed' };
    try {
      delivery = await sendEmail({ to: user.email, ...passwordResetEmail(user.fullname, resetUrl) });
    } catch (error) {
      console.error('[Auth] Could not send password reset email:', error.message);
    }
    return res.json({
      ...generic,
      ...(!isProduction && !delivery.delivered ? { previewUrl: resetUrl } : {}),
    });
  } catch (error) {
    console.error('[Auth] Forgot password failed:', error);
    return res.status(500).json({ message: 'Could not start password recovery. Please try again.' });
  }
});

router.post('/reset-password', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');
  if (!token) return res.status(400).json({ message: 'A password reset token is required.' });
  if (password.length < 6) return res.status(400).json({ message: 'Use a password with at least 6 characters.' });

  try {
    const user = await db.getOne(
      'SELECT id, email, password_reset_expires FROM users WHERE password_reset_token = ?',
      [hashToken(token)],
    );
    if (!user) return res.status(400).json({ message: 'This password reset link is invalid or has already been used.' });
    if (expiryPassed(user.password_reset_expires)) {
      return res.status(400).json({ message: 'This password reset link has expired. Request a new one.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await db.update(
      `UPDATE users SET password = ?, email_verified = 1, email_verification_notice = 0, password_reset_token = NULL,
         password_reset_expires = NULL WHERE id = ?`,
      [passwordHash, user.id],
    );
    return res.json({ message: 'Password updated. Sign in with your new password.', email: user.email });
  } catch (error) {
    console.error('[Auth] Password reset failed:', error);
    return res.status(500).json({ message: 'Could not reset this password. Please try again.' });
  }
});

async function createGoogleUsername(fullName, email) {
  const namePart = fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 18);
  const emailPart = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 18);
  const base = `@${namePart || emailPart || 'user'}`;

  // Check candidates first so a collision returns a useful error instead of a failed signup.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const suffix = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
    const candidate = `${base}${suffix}`;
    const exists = await db.getOne('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [candidate]);
    if (!exists) return candidate;
  }
  throw new Error('Could not create a unique username for this Google account.');
}

function sendSession(res, user, status, message, extra = {}) {
  const token = createToken(user);
  return res.status(status).json({
    message,
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      emailVerified: Number(user.email_verified || 0) === 1,
      picture: extra.picture || user.picture || null,
    },
  });
}

async function createWelcomeNotification(userId) {
  try {
    await db.query(
      "INSERT INTO notifications (user_id, actor_id, type, text) VALUES (?, NULL, 'system', ?)",
      [userId, 'Welcome to QuickChat. Choose your interests to personalize your home feed.'],
    );
  } catch (error) {
    // A notice should never prevent account registration or sign-in.
    console.warn('[Auth] Could not save the welcome notification:', error.message);
  }
}

function normalizeUser(row) {
  if (!row) return null;
  const lower = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ...row,
    id: row.id ?? lower.id,
    fullName: row.fullName ?? lower.fullname ?? lower.name ?? '',
    username: row.username ?? lower.username ?? '',
    email: row.email ?? lower.email ?? '',
    password: row.password ?? lower.password ?? null,
    googleId: row.googleId ?? lower.googleid ?? lower.google_id ?? null,
    picture: row.picture ?? lower.picture ?? lower.avatar_url ?? null,
    isSynthetic: Number(row.isSynthetic ?? lower.is_synthetic ?? 0) === 1,
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isUniqueConstraintError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '');
  return code === '23505' || code === 'ER_DUP_ENTRY' ||
    code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
    /unique constraint|duplicate (key|entry)/i.test(message);
}

module.exports = router;
