// Shared gift catalogue for live streams. Points are an in-app currency: the
// gift cost is debited from the sender's wallet and credited to the host's
// wallet. Prices are deliberately stored server side only.
const GIFTS = [
  { key: 'rose', name: 'Rose', emoji: '🌹', points: 1, accent: '#f43f5e' },
  { key: 'heart', name: 'Heart', emoji: '💖', points: 5, accent: '#ec4899' },
  { key: 'star', name: 'Star', emoji: '⭐', points: 10, accent: '#f59e0b' },
  { key: 'fire', name: 'Fire', emoji: '🔥', points: 20, accent: '#f97316' },
  { key: 'crown', name: 'Crown', emoji: '👑', points: 50, accent: '#eab308' },
  { key: 'rocket', name: 'Rocket', emoji: '🚀', points: 100, accent: '#6366f1' },
  { key: 'diamond', name: 'Diamond', emoji: '💎', points: 250, accent: '#06b6d4' },
  { key: 'lion', name: 'Lion', emoji: '🦁', points: 500, accent: '#b45309' },
];

const GIFTS_BY_KEY = new Map(GIFTS.map((gift) => [gift.key, gift]));

const POINT_PACKS = [
  { key: 'starter', points: 1000, amount: '100.00', label: 'Starter' },
  { key: 'popular', points: 5000, amount: '500.00', label: 'Popular' },
  { key: 'creator', points: 10000, amount: '1000.00', label: 'Creator' },
  { key: 'studio', points: 50000, amount: '5000.00', label: 'Studio' },
];

const POINT_PACKS_BY_KEY = new Map(POINT_PACKS.map((pack) => [pack.key, pack]));

function welcomePoints() {
  const configured = Number.parseInt(process.env.LIVE_WELCOME_POINTS || '', 10);
  if (Number.isInteger(configured) && configured >= 0) return Math.min(configured, 100000);
  return 100;
}

function giftFor(key) {
  return GIFTS_BY_KEY.get(String(key || '').trim().toLowerCase()) || null;
}

function packFor(key) {
  return POINT_PACKS_BY_KEY.get(String(key || '').trim().toLowerCase()) || null;
}

module.exports = { GIFTS, POINT_PACKS, giftFor, packFor, welcomePoints };
