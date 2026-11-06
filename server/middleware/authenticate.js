const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV === 'production' ? '' : 'quickchat-local-development-secret'
);
if (!JWT_SECRET) throw new Error('[Auth] Set JWT_SECRET before starting the production server.');

function createToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function authenticate(req, res, next) {
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return res.status(401).json({ message: 'Sign in to use this feature.' });

  try {
    const session = jwt.verify(token, JWT_SECRET);
    const userId = Number(session.id);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return res.status(401).json({ message: 'Your session is invalid. Sign in again.' });
    }
    req.user = { id: userId, username: session.username };
    return next();
  } catch (_error) {
    return res.status(401).json({ message: 'Your session has expired. Sign in again.' });
  }
}

module.exports = { authenticate, createToken };
