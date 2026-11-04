const express = require('express');
const { asyncRoute } = require('./utils');
const {
  getPublicKey, isPushReady, saveSubscription, removeSubscription, subscriptionCount,
  sendPushToUser,
} = require('../push');

const router = express.Router();

router.get('/push/status', asyncRoute(async (req, res) => {
  res.json({
    available: isPushReady(),
    publicKey: getPublicKey(),
    subscribed: (await subscriptionCount(req.user.id)) > 0,
    devices: await subscriptionCount(req.user.id),
  });
}));

router.post('/push/subscriptions', asyncRoute(async (req, res) => {
  if (!isPushReady()) {
    return res.status(503).json({ message: 'Browser push is not configured on this server yet.' });
  }
  await saveSubscription(req.user.id, req.body?.subscription, req.get('user-agent') || '');
  res.status(201).json({ subscribed: true, devices: await subscriptionCount(req.user.id) });
}));

router.delete('/push/subscriptions', asyncRoute(async (req, res) => {
  await removeSubscription(req.user.id, req.body?.endpoint);
  res.json({ subscribed: false, devices: await subscriptionCount(req.user.id) });
}));

router.post('/push/test', asyncRoute(async (req, res) => {
  if (!isPushReady()) {
    return res.status(503).json({ message: 'Browser push is not configured on this server yet.' });
  }
  const result = await sendPushToUser(req.user.id, {
    title: 'QuickChat notifications are on',
    body: 'You will get alerts here for new messages, replies, and live streams.',
    url: '/notifications',
    tag: 'quickchat-test',
    type: 'test',
  });
  if (!result.sent) {
    return res.status(409).json({ message: 'No browser is subscribed yet. Turn on notifications first.' });
  }
  res.json({ sent: result.sent });
}));

module.exports = router;
