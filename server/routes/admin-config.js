const express = require('express');
const db = require('../database');
const { asyncRoute } = require('./utils');
const { requirePermission, audit } = require('./admin');
const { getVerificationFeePoints, setVerificationFeePoints } = require('../platform-config');
const { isFlutterwaveSecretConfigured, isFlutterwaveWebhookSecretConfigured, isFlutterwaveWebhookUrlConfigured, isPublicAppUrlConfigured } = require('../flutterwave');

const router = express.Router();

router.get('/admin/configuration', requirePermission('settings.manage'), asyncRoute(async (_req, res) => {
  const fee = await getVerificationFeePoints();
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({
    verificationFeePoints: fee,
    flutterwave: {
      secretKeyConfigured: isFlutterwaveSecretConfigured(),
      webhookHashConfigured: isFlutterwaveWebhookSecretConfigured(),
      webhookUrlConfigured: isFlutterwaveWebhookUrlConfigured(),
      publicUrlConfigured: isPublicAppUrlConfigured(),
      requiredEnvironment: ['FLW_SECRET_KEY', 'FLW_SECRET_HASH', 'FLW_WEBHOOK_URL', 'PUBLIC_APP_URL'],
    },
    googleDrive: {
      configured: Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REFRESH_TOKEN),
      requiredEnvironment: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN'],
    },
  });
}));

router.put('/admin/configuration/verification-fee', requirePermission('settings.manage'), asyncRoute(async (req, res) => {
  const previous = await getVerificationFeePoints();
  const amount = await setVerificationFeePoints(req.body?.points, req.user.id);
  await audit(req, 'configuration.verification_fee_updated', 'platform_setting', 'verification_fee_points', 'Verification price changed', { points: previous }, { points: amount });
  res.json({ message: 'Verification price updated.', verificationFeePoints: amount });
}));

module.exports = router;
