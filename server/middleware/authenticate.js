const jwt = require('jsonwebtoken');
const db = require('../database');
const { getOwnerSecurity } = require('../admin-owner');

const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV === 'production' ? '' : 'quickchat-local-development-secret'
);
if (!JWT_SECRET) throw new Error('[Auth] Set JWT_SECRET before starting the production server.');

function createToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

async function authenticate(req, res, next) {
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return res.status(401).json({ message: 'Sign in to use this feature.' });

  try {
    const session = jwt.verify(token, JWT_SECRET);
    const userId = Number(session.id);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return res.status(401).json({ message: 'Your session is invalid. Sign in again.' });
    }
    const account = await db.getOne('SELECT id FROM users WHERE id = ?', [userId]);
    if (!account) return res.status(401).json({ message: 'This account is no longer available. Sign in again.' });
    const activeBan = await db.getOne('SELECT id FROM account_bans WHERE user_id = ? AND revoked_at IS NULL LIMIT 1', [userId]);
    if (activeBan) return res.status(403).json({ message: 'This account has been permanently restricted. Contact QuickChat support if you believe this is an error.' });
    const expiryCondition = db.type === 'sqlite' ? 'datetime(expires_at) > CURRENT_TIMESTAMP' : 'expires_at > CURRENT_TIMESTAMP';
    const activeSuspension = await db.getOne(`SELECT id, expires_at FROM account_suspensions WHERE user_id = ? AND lifted_at IS NULL AND ${expiryCondition} ORDER BY expires_at DESC LIMIT 1`, [userId]);
    if (activeSuspension) return res.status(403).json({ message: 'This account is temporarily suspended until the restriction expires.' });
    const ownerSecurity = await getOwnerSecurity(userId);
    const passwordChangeAllowed = req.method === 'POST' && req.originalUrl.split('?')[0] === '/api/admin/security/change-password';
    if (Number(ownerSecurity?.must_change_password) === 1 && !passwordChangeAllowed) {
      return res.status(428).json({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your initial administrator password before using QuickChat.' });
    }
    req.user = { id: userId, username: session.username };
    return next();
  } catch (error) {
    if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError' || error?.name === 'NotBeforeError') {
      return res.status(401).json({ message: 'Your session has expired. Sign in again.' });
    }
    return next(error);
  }
}

module.exports = { authenticate, createToken };
