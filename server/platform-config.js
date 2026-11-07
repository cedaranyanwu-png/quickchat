const db = require('./database');

const DEFAULT_VERIFICATION_FEE = 2000;

async function initializePlatformConfig() {
  await db.query(`CREATE TABLE IF NOT EXISTS admin_platform_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_by INTEGER,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function getVerificationFeePoints() {
  const saved = await db.getOne("SELECT setting_value FROM admin_platform_settings WHERE setting_key = 'verification_fee_points'");
  const value = Number.parseInt(saved?.setting_value || process.env.VERIFICATION_POINTS || String(DEFAULT_VERIFICATION_FEE), 10);
  return Number.isSafeInteger(value) && value >= 100 && value <= 1000000 ? value : DEFAULT_VERIFICATION_FEE;
}

async function setVerificationFeePoints(value, adminId) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 100 || amount > 1000000) {
    const error = new Error('Verification price must be between 100 and 1,000,000 points.');
    error.status = 400;
    throw error;
  }
  const existing = await db.getOne("SELECT setting_key FROM admin_platform_settings WHERE setting_key = 'verification_fee_points'");
  if (existing) {
    await db.update("UPDATE admin_platform_settings SET setting_value = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'verification_fee_points'", [String(amount), adminId]);
  } else {
    await db.insert("INSERT INTO admin_platform_settings (setting_key, setting_value, updated_by) VALUES ('verification_fee_points', ?, ?)", [String(amount), adminId]);
  }
  return amount;
}

module.exports = { initializePlatformConfig, getVerificationFeePoints, setVerificationFeePoints, DEFAULT_VERIFICATION_FEE };
