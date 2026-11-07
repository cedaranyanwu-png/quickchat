const bcrypt = require('bcryptjs');
const db = require('./database');

const dateType = db.type === 'sqlite' ? 'DATETIME' : 'TIMESTAMP';

async function initializeOwnerSecurity() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_owner_security (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      password_changed_at ${dateType},
      created_at ${dateType} DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS platform_ownership (
      id INTEGER PRIMARY KEY,
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at ${dateType} DEFAULT CURRENT_TIMESTAMP,
      updated_at ${dateType} DEFAULT CURRENT_TIMESTAMP,
      CHECK (id = 1)
    )
  `);

  const email = String(process.env.SUPER_ADMIN_BOOTSTRAP_EMAIL || process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  const initialPassword = String(process.env.SUPER_ADMIN_BOOTSTRAP_PASSWORD || '');
  if (!email || !initialPassword) return { bootstrapped: false, reason: 'bootstrap_not_configured' };
  if (initialPassword.length < 8) throw new Error('[Admin bootstrap] SUPER_ADMIN_BOOTSTRAP_PASSWORD must contain at least 8 characters.');

  const existingOwner = await db.getOne('SELECT owner_user_id FROM platform_ownership WHERE id = 1');
  if (existingOwner) return { bootstrapped: false, reason: 'owner_already_initialized' };

  let user = await db.getOne('SELECT id, username, email, password FROM users WHERE LOWER(email) = LOWER(?)', [email]);
  const activeSuperAdmins = await db.query(
    `SELECT DISTINCT ur.user_id FROM admin_user_roles ur
       JOIN admin_roles r ON r.id = ur.role_id
      WHERE r.role_key = 'super_admin' AND r.is_active = 1 AND ur.is_active = 1`,
  );

  if (user && activeSuperAdmins.some((row) => Number(row.user_id) !== Number(user.id))) {
    throw new Error('[Admin bootstrap] Another Super Administrator already exists. Resolve ownership explicitly before bootstrapping.');
  }
  if (!user && activeSuperAdmins.length) {
    throw new Error('[Admin bootstrap] A Super Administrator already exists. Bootstrap will not take ownership of an existing administrator.');
  }

  let mustChangePassword = false;
  if (!user) {
    const usernameTaken = await db.getOne('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', ['admin']);
    if (usernameTaken) throw new Error('[Admin bootstrap] The username "admin" is already in use by another account. Resolve the conflict before bootstrap.');
    const passwordHash = await bcrypt.hash(initialPassword, 12);
    user = await db.insert(
      'INSERT INTO users (fullname, name, username, email, password, googleid, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['Cedar Anyanwu', 'Cedar Anyanwu', 'admin', email, passwordHash, null, 1],
    );
    mustChangePassword = true;
  } else if (!user.password) {
    const passwordHash = await bcrypt.hash(initialPassword, 12);
    await db.update('UPDATE users SET password = ? WHERE id = ?', [passwordHash, user.id]);
    mustChangePassword = true;
  }

  const role = await db.getOne("SELECT id FROM admin_roles WHERE role_key = 'super_admin' AND is_active = 1");
  if (!role) throw new Error('[Admin bootstrap] The Super Administrator role has not been initialized.');

  await db.query(
    'INSERT INTO admin_user_roles (user_id, role_id, assigned_by, is_active) VALUES (?, ?, ?, 1) ' +
      (db.type === 'mysql' ? 'ON DUPLICATE KEY UPDATE is_active = 1' : 'ON CONFLICT(user_id, role_id) DO UPDATE SET is_active = 1'),
    [user.id, role.id, user.id],
  );
  await db.query(
    'INSERT INTO platform_ownership (id, owner_user_id) VALUES (1, ?)',
    [user.id],
  );
  await db.query(
    'INSERT INTO admin_owner_security (user_id, must_change_password) VALUES (?, ?) ' +
      (db.type === 'mysql' ? 'ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)' : 'ON CONFLICT(user_id) DO NOTHING'),
    [user.id, mustChangePassword ? 1 : 0],
  );
  await db.insert(
    'INSERT INTO admin_audit_logs (admin_user_id, action, target_type, target_id, reason, new_state) VALUES (?, ?, ?, ?, ?, ?)',
    [user.id, 'admin.owner_bootstrapped', 'platform', '1', 'One-time main owner bootstrap', JSON.stringify({ ownerUserId: user.id, mustChangePassword })],
  );

  return { bootstrapped: true, userId: user.id, mustChangePassword };
}

async function isMainOwner(userId) {
  if (!userId) return false;
  const row = await db.getOne('SELECT owner_user_id FROM platform_ownership WHERE id = 1');
  return Boolean(row && Number(row.owner_user_id) === Number(userId));
}

async function getOwnerSecurity(userId) {
  return db.getOne('SELECT must_change_password, password_changed_at FROM admin_owner_security WHERE user_id = ?', [userId]);
}

module.exports = { initializeOwnerSecurity, isMainOwner, getOwnerSecurity };
