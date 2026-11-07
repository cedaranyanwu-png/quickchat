const express = require('express');
const db = require('../database');
const { asyncRoute } = require('./utils');
const { requirePermission, audit } = require('./admin');
const { getVerificationFeeNaira, setVerificationFeeNaira, saveSecretSettings } = require('../platform-config');
const { isFlutterwaveSecretConfigured, isFlutterwaveWebhookSecretConfigured, isFlutterwaveWebhookUrlConfigured, isPublicAppUrlConfigured } = require('../flutterwave');

const router = express.Router();

router.get('/admin/configuration', requirePermission('settings.manage'), asyncRoute(async (_req, res) => {
  const fee = await getVerificationFeeNaira();
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({
    verificationFeeNaira: fee,
    flutterwave: {
      secretKeyConfigured: isFlutterwaveSecretConfigured(),
      webhookHashConfigured: isFlutterwaveWebhookSecretConfigured(),
      webhookUrlConfigured: isFlutterwaveWebhookUrlConfigured(),
      publicUrlConfigured: isPublicAppUrlConfigured(),
      requiredEnvironment: ['FLW_SECRET_KEY', 'FLW_SECRET_HASH', 'FLW_WEBHOOK_URL', 'PUBLIC_APP_URL'],
      encryptionKeyRequired: !process.env.ADMIN_CONFIG_ENCRYPTION_KEY,
    },
    googleDrive: {
      configured: Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REFRESH_TOKEN),
      requiredEnvironment: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN'],
      encryptionKeyRequired: !process.env.ADMIN_CONFIG_ENCRYPTION_KEY,
    },
  });
}));

router.put('/admin/configuration/gateways', requirePermission('settings.manage'), asyncRoute(async (req, res) => {
  const saved = await saveSecretSettings(req.body || {}, req.user.id);
  await audit(req, 'configuration.gateway_credentials_updated', 'platform_setting', 'gateway_credentials', 'Gateway credentials updated', null, { keys: saved });
  res.json({ message: 'Credentials saved securely on the server.', saved });
}));

router.put('/admin/configuration/verification-fee', requirePermission('settings.manage'), asyncRoute(async (req, res) => {
  const previous = await getVerificationFeeNaira();
  const amount = await setVerificationFeeNaira(req.body?.amountNaira, req.user.id);
  await audit(req, 'configuration.verification_fee_updated', 'platform_setting', 'verification_fee_ngn', 'Verification price changed', { amountNaira: previous }, { amountNaira: amount });
  res.json({ message: 'Verification price updated.', verificationFeeNaira: amount });
}));

module.exports = router;
