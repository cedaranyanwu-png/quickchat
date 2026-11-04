const fs = require('fs');
const path = require('path');

const feedPath = path.join(__dirname, 'models', 'data', 'adult.xml');
let feedXml = '';
try {
  feedXml = fs.readFileSync(feedPath, 'utf8');
} catch (error) {
  console.warn(`[Adult content] Could not read ${feedPath}: ${error.message}`);
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function normalizedUrlKey(value) {
  try {
    const url = new URL(decodeXml(value).trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = url.pathname.toLowerCase().replace(/\/+$/, '');
    return `${host}${pathname}`;
  } catch (_error) {
    return '';
  }
}

const adultHosts = new Set();
const blockedItemLinks = new Set();
const riskyAgeLanguage = /\b(?:teen(?:s|ager|agers)?|school\s?girls?|school\s?boys?|students?|underage|minor(?:s)?|barely\s+legal)\b/i;

for (const value of feedXml.match(/https?:\/\/[^\s"'<>]+/gi) || []) {
  try {
    adultHosts.add(new URL(value.replace(/[),.;]+$/, '')).hostname.toLowerCase().replace(/^www\./, ''));
  } catch (_error) {
    // Ignore malformed links in the local feed.
  }
}

for (const match of feedXml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
  const block = match[1];
  const link = block.match(/<link\b[^>]*>\s*([^<]+?)\s*<\/link>/i)?.[1];
  if (!link) continue;
  const title = block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  const description = block.match(/<description\b[^>]*>([\s\S]*?)<\/description>/i)?.[1] || '';
  const searchableText = decodeXml(`${title} ${description}`).replace(/<[^>]*>/g, ' ');
  if (riskyAgeLanguage.test(searchableText)) {
    const key = normalizedUrlKey(link);
    if (key) blockedItemLinks.add(key);
  }
}

function classifyAdultSource(sourceLink) {
  if (!sourceLink) return { isAdult: false, isUnavailable: false };
  let hostname = '';
  try {
    hostname = new URL(sourceLink).hostname.toLowerCase().replace(/^www\./, '');
  } catch (_error) {
    return { isAdult: false, isUnavailable: false };
  }

  const isUnavailable = blockedItemLinks.has(normalizedUrlKey(sourceLink));
  const isAdult = isUnavailable || [...adultHosts].some((host) => hostname === host || hostname.endsWith(`.${host}`));
  return { isAdult, isUnavailable };
}

module.exports = { classifyAdultSource };
