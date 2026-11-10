const path = require('node:path');
const net = require('node:net');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const axios = require('axios');
const { generateGeminiText, getGeminiConfig } = require('./gemini');
const cheerio = require('cheerio');
const Parser = require('rss-parser');
const schedule = require('node-schedule');
const { classifyAdultSource } = require('./adult-content');
const {
  characterData,
  generateCharacterSelfies,
  seedAiCharacterAccounts,
} = require('./ai-poster-characters');

const isProduction = process.env.NODE_ENV === 'production';
// Production RSS publishing is handled by rss-worker.js under @quickchat-rss.
// Keep the character runtime away from RSS imports and staged RSS posts.
const rssPublishingDisabled = String(process.env.AI_POSTER_DISABLE_RSS_PUBLISHING || (isProduction ? 'true' : 'false')).toLowerCase() === 'true';
const modelUrl = process.env.AI_POSTER_MODEL_URL || 'http://localhost:11434/api/chat';
const model = process.env.AI_POSTER_MODEL || 'llama3.2';
const feedTimeoutMs = positiveInteger(process.env.AI_POSTER_FEED_TIMEOUT_MS, 30000);
const articleMediaTimeoutMs = positiveInteger(process.env.AI_POSTER_ARTICLE_MEDIA_TIMEOUT_MS, 10000);
const inferenceTimeoutMs = positiveInteger(process.env.AI_POSTER_TIMEOUT_MS, 90000);
const originalAxiosPost = axios.post.bind(axios);
// Keep existing character prompts while routing inference through Gemini.
axios.post = async (url, payload, config) => {
  if (url !== modelUrl) return originalAxiosPost(url, payload, config);
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n');
  const prompt = messages.filter((message) => message.role !== 'system').map((message) => message.content).join('\n');
  const content = await generateGeminiText({ system, prompt, temperature: payload?.options?.temperature ?? 0.7, maxOutputTokens: payload?.options?.num_predict ?? 256 });
  return { data: { message: { content } } };
};

const maxItemsPerFeed = positiveInteger(process.env.AI_POSTER_MAX_ITEMS_PER_FEED, 8);
const scheduleExpression = process.env.AI_POSTER_SCHEDULE || '*/30 * * * *';
const messageScheduleExpression = process.env.AI_POSTER_MESSAGE_SCHEDULE || '*/10 * * * * *';
const socialScheduleExpression = process.env.AI_POSTER_SOCIAL_SCHEDULE || '*/20 * * * * *';
const itemPauseMs = 5000;
const adultFeedPath = path.join(__dirname, 'models', 'data', 'adult.xml');
const parser = new Parser({
  timeout: feedTimeoutMs,
  customFields: { item: ['content:encoded', 'media:content', 'media:thumbnail'] },
});

let stageDatabase;
let applicationDatabase;
let applicationDatabaseReady = false;
let characterAccounts = [];
let scheduledJob;
let messageReplyJob;
let socialJob;
let runInProgress = false;
let messageReplyInProgress = false;
let socialInProgress = false;
let engagementInProgress = false;
let lastFollowSweepAt = 0;
let shuttingDown = false;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toPostgresPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function createStageDatabase() {
  if (isProduction) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the production AI poster.');
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      max: positiveInteger(process.env.AI_POSTER_DB_POOL_SIZE, 2),
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });
    return {
      type: 'postgres',
      query: async (sql, params = []) => (await pool.query(toPostgresPlaceholders(sql), params)).rows,
      close: () => pool.end(),
    };
  }

  const sqlite3 = require('sqlite3').verbose();
  const filePath = path.join(__dirname, 'test_database.sqlite');
  const client = new sqlite3.Database(filePath);
  return {
    type: 'sqlite',
    query(sql, params = []) {
      return new Promise((resolve, reject) => {
        client.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows || [])));
      });
    },
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        client.run(sql, params, function onComplete(error) {
          if (error) reject(error);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => client.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

async function initializeStageDatabase(database) {
  const createTable = database.type === 'postgres'
    ? `CREATE TABLE IF NOT EXISTS autonomous_posts (
        id BIGSERIAL PRIMARY KEY, source_link TEXT NOT NULL, source_title TEXT,
        summary TEXT NOT NULL, image_url TEXT, video_url TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    : `CREATE TABLE IF NOT EXISTS autonomous_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, source_link TEXT NOT NULL, source_title TEXT,
        summary TEXT NOT NULL, image_url TEXT, video_url TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`;
  await database.query(createTable);
  await database.query('CREATE UNIQUE INDEX IF NOT EXISTS autonomous_posts_source_link_idx ON autonomous_posts (source_link)');
  for (const [name, type] of [['author_user_id', 'INTEGER'], ['category', 'TEXT'], ['target_interests', 'TEXT']]) {
    try {
      await database.query(`ALTER TABLE autonomous_posts ADD COLUMN ${name} ${type}`);
    } catch (error) {
      if (!/duplicate column|already exists/i.test(String(error?.message || ''))) throw error;
    }
  }
}

async function getStagePost(database, sourceLink) {
  const rows = await database.query(
    'SELECT id, source_link, source_title, summary, image_url, video_url, author_user_id, category, target_interests, created_at FROM autonomous_posts WHERE source_link = ? LIMIT 1',
    [sourceLink],
  );
  return rows[0] || null;
}

async function listStagePosts(database) {
  return database.query(
    'SELECT id, source_link, source_title, summary, image_url, video_url, author_user_id, category, target_interests, created_at FROM autonomous_posts ORDER BY id ASC',
  );
}

async function saveStagePost(database, post) {
  try {
    const sql = `INSERT INTO autonomous_posts
      (source_link, source_title, summary, image_url, video_url, author_user_id, category, target_interests)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (source_link) DO NOTHING`;
    const params = [post.sourceLink, post.title, post.summary, post.imageUrl, post.videoUrl,
      post.authorUserId || null, post.category || null, JSON.stringify(post.targetInterests || [])];
    if (database.type === 'sqlite') await database.run(sql, params);
    else await database.query(sql, params);
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

function isUniqueViolation(error) {
  return ['23505', 'SQLITE_CONSTRAINT', 'ER_DUP_ENTRY'].includes(error?.code) ||
    /unique constraint|duplicate key/i.test(String(error?.message || ''));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function configuredFeeds() {
  const envUrls = String(process.env.AI_POSTER_FEEDS || '')
    .split(/[\r\n,]+/)
    .map((feed) => feed.trim())
    .filter((feed) => /^https?:\/\//i.test(feed));
  const urls = envUrls.length ? envUrls : characterData.feeds.map((feed) => feed.url);
  const feeds = urls.map((url, index) => ({
    ...(characterData.feeds[index] || { id: `custom_${index + 1}`, name: 'Additional RSS feed', topics: ['news'] }),
    url,
  }));
  if (String(process.env.AI_POSTER_INCLUDE_ADULT_FEED || 'true').toLowerCase() !== 'false') {
    feeds.unshift({
      id: 'adult_content',
      name: 'Adult content (18+)',
      url: pathToFileURL(adultFeedPath).href,
      localPath: adultFeedPath,
      ageRestricted: true,
      topics: ['adult_entertainment'],
    });
  }
  return feeds;
}

function log(message, error) {
  const suffix = error ? `: ${error.message || error}` : '';
  console.log(`[AI poster] ${message}${suffix}`);
}

async function fetchFeed(feedUrl) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await axios.get(feedUrl, {
        timeout: feedTimeoutMs,
        maxRedirects: 5,
        responseType: 'text',
        headers: { 'User-Agent': 'QuickChat RSS editor/1.0 (+https://quickchat.local)' },
      });
      return await parser.parseString(response.data);
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      if (attempt === 3 || (status && status < 429 && status !== 408)) break;
      log(`Feed request attempt ${attempt} failed; retrying`, error);
      await sleep(attempt * 5000);
    }
  }
  throw lastError;
}

function itemHtml(item) {
  const candidates = [item['content:encoded'], item.content, item.description, item.summary];
  return candidates.find((value) => typeof value === 'string' && value.trim()) || '';
}

function absoluteUrl(value, base) {
  const url = String(value || '').trim();
  if (!url || /^(data|javascript):/i.test(url)) return null;
  try {
    const result = new URL(url, base);
    return ['http:', 'https:'].includes(result.protocol) ? result.href : null;
  } catch (_error) {
    return null;
  }
}

function isBlockedHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const [first, second] = host.split('.').map(Number);
    return first === 0 || first === 10 || first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127) || first >= 224;
  }
  if (ipVersion === 6) {
    return host === '::' || host === '::1' || host.startsWith('fc') || host.startsWith('fd') ||
      /^fe[89ab]/.test(host) || host.startsWith('::ffff:');
  }
  return false;
}

function isPublicHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !isBlockedHost(url.hostname);
  } catch (_error) {
    return false;
  }
}

function enclosureValues(item) {
  const values = [];
  const add = (value) => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(add);
    if (typeof value === 'string') return values.push({ url: value });
    if (typeof value !== 'object') return;
    const attrs = value.$ || value.attributes || value;
    if (attrs.url || attrs.href || attrs.src) {
      values.push({
        url: attrs.url || attrs.href || attrs.src,
        type: attrs.type || attrs.medium || attrs.mediumType || '',
      });
    }
    for (const [key, nested] of Object.entries(value)) {
      if (key === '$' || key === 'attributes') continue;
      if (Array.isArray(nested) || (nested && typeof nested === 'object')) add(nested);
    }
  };
  [item.enclosures, item.enclosure, item['media:content'], item['media:group'], item['media:thumbnail']].forEach(add);
  return values;
}

function extractMedia(item, html, sourceLink) {
  const $ = cheerio.load(html || '');
  const imageSrc = $('img').first().attr('src') || $('img').first().attr('data-src');
  let imageUrl = absoluteUrl(imageSrc, sourceLink);
  const enclosures = enclosureValues(item);
  if (!imageUrl) {
    const imageEnclosure = enclosures.find((entry) => /image\//i.test(entry.type) || /\.(png|jpe?g|gif|webp)(?:[?#]|$)/i.test(entry.url));
    imageUrl = absoluteUrl(imageEnclosure?.url, sourceLink);
  }

  const videoEnclosure = enclosures.find((entry) =>
    /video\//i.test(entry.type) || /\.mp4(?:[?#]|$)/i.test(entry.url));
  let videoUrl = absoluteUrl(videoEnclosure?.url, sourceLink);
  let embedded = false;
  if (!videoUrl) {
    const htmlVideo = $('video source[src]').toArray().map((element) => $(element).attr('src'))
      .find((url) => /\.mp4(?:[?#]|$)/i.test(url || ''));
    videoUrl = absoluteUrl(htmlVideo, sourceLink);
  }
  if (!videoUrl) {
    const iframeSrc = $('iframe[src]').toArray().map((element) => $(element).attr('src'))
      .map((url) => absoluteUrl(url, sourceLink)).find(isYouTubeUrl);
    if (iframeSrc) {
      videoUrl = toYouTubeEmbed(iframeSrc);
      embedded = Boolean(videoUrl);
    }
  }
  if (!videoUrl && isYouTubeUrl(sourceLink)) {
    videoUrl = toYouTubeEmbed(sourceLink);
    embedded = Boolean(videoUrl);
  }
  return { imageUrl, videoUrl, videoEmbedded: embedded };
}

function isYouTubeUrl(url) {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'youtube.com' || hostname.endsWith('.youtube.com') ||
      hostname === 'youtube-nocookie.com' || hostname.endsWith('.youtube-nocookie.com');
  } catch (_error) {
    return false;
  }
}

function toYouTubeEmbed(url) {
  try {
    const parsed = new URL(url);
    if (/^\/embed\//.test(parsed.pathname)) return parsed.href;
    const videoId = parsed.searchParams.get('v') || parsed.pathname.match(/\/(?:shorts|live)\/([^/]+)/)?.[1];
    return videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}` : null;
  } catch (_error) {
    return null;
  }
}

function findVideoInHtml(html, baseUrl) {
  const $ = cheerio.load(html || '');
  const sources = $('video[src], video source[src]')
    .toArray()
    .map((element) => ({
      url: $(element).attr('src'),
      type: $(element).attr('type') || '',
    }));
  const source = sources.find((entry) =>
    /video\//i.test(entry.type) || /\.(mp4|webm|m3u8)(?:[?#]|$)/i.test(entry.url || ''));
  const videoUrl = absoluteUrl(source?.url, baseUrl);
  if (videoUrl) return { videoUrl, videoEmbedded: false };

  const iframeUrl = $('iframe[src], iframe[data-src]')
    .toArray()
    .map((element) => $(element).attr('src') || $(element).attr('data-src'))
    .map((url) => absoluteUrl(url, baseUrl))
    .find(isYouTubeUrl);
  const embeddedUrl = iframeUrl ? toYouTubeEmbed(iframeUrl) : null;
  return { videoUrl: embeddedUrl, videoEmbedded: Boolean(embeddedUrl) };
}

async function discoverArticleVideo(sourceLink) {
  if (isYouTubeUrl(sourceLink)) {
    const videoUrl = toYouTubeEmbed(sourceLink);
    return { videoUrl, videoEmbedded: Boolean(videoUrl) };
  }
  if (!isPublicHttpUrl(sourceLink)) return { videoUrl: null, videoEmbedded: false };

  try {
    const response = await axios.get(sourceLink, {
      timeout: articleMediaTimeoutMs,
      maxRedirects: 3,
      beforeRedirect: (options) => {
        if (isBlockedHost(options.hostname)) throw new Error('Blocked redirect to a local network host.');
      },
      maxContentLength: 4 * 1024 * 1024,
      responseType: 'text',
      headers: { 'User-Agent': 'QuickChat RSS editor/1.0 (+https://quickchat.local)' },
    });
    return findVideoInHtml(response.data, sourceLink);
  } catch (_error) {
    return { videoUrl: null, videoEmbedded: false };
  }
}

function cleanText(html) {
  const $ = cheerio.load(html || '');
  $('script, style, noscript, svg, iframe, video, audio, form, button').remove();
  return $.root().text().replace(/\s+/g, ' ').trim();
}

async function rewriteSummary(title, text, character, matchingInterests) {
  const sourceText = `${title ? `Headline: ${title}\n\n` : ''}${text}`.slice(0, 5000);
  const relevantTopics = matchingInterests.join(', ');
  const response = await axios.post(modelUrl, {
    model,
    stream: false,
    messages: [
      {
        role: 'system',
        content: [
          'Write one original QuickChat post in this fictional persona’s voice. Do not claim human identity or invent personal experiences.',
          'Character behavior: ' + character.behavior,
          'The account is interested in: ' + character.interests.join(', ') + '.',
          'This story was selected because it matches: ' + relevantTopics + '.',
          'Keep the post factual, concise, creative, and distinct from the source layout. Return only the post paragraph.',
          'Do not include metadata, a greeting, a title label, a conversational preamble, or a made-up personal anecdote.',
        ].join('\n'),
      },
      { role: 'user', content: `Turn this article into one natural post that fits the account's interests. Preserve factual meaning.\n\n${sourceText}` },
    ],
    options: { num_ctx: 2048, num_predict: 180, temperature: 0.7 },
  }, { timeout: inferenceTimeoutMs });

  const summary = String(response.data?.message?.content || '').trim()
    .replace(/^\s*(?:summary|rewritten summary|here(?:'s| is) the summary)\s*:\s*/i, '')
    .replace(/^\s*\[[^\]]+\]\s*/, '')
    .replace(/\s*\n+\s*/g, ' ')
    .trim();
  if (!summary) throw new Error('The local model returned an empty summary.');
  return addCharacterTypo(summary, character.typoRate);
}

function addCharacterTypo(text, typoRate) {
  if (Math.random() >= Number(typoRate || 0)) return text;
  const words = [...text.matchAll(/\b[A-Za-z]{6,}\b/g)];
  if (!words.length) return text;
  const match = words[Math.floor(Math.random() * words.length)];
  const word = match[0];
  const position = 1 + Math.floor(Math.random() * (word.length - 2));
  const changed = word.length > 7
    ? word.slice(0, position) + word.slice(position + 1)
    : word.slice(0, position) + word[position + 1] + word[position] + word.slice(position + 2);
  return text.slice(0, match.index) + changed + text.slice(match.index + word.length);
}

function parseInterests(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
    return Array.isArray(parsed) ? parsed.map((interest) => String(interest).toLowerCase()) : [];
  } catch (_error) {
    return [];
  }
}

// Broad keywords that are shared by several topics. They only count when the
// character's primary (most specific) interest also matches the story, so a
// whale-migration story cannot be routed to an AI/startup account.
const GENERIC_TOPIC_KEYWORDS = new Set([
  'research', 'study', 'model', 'data', 'app', 'computer', 'digital', 'internet',
  'science', 'scientist', 'health', 'planet', 'earth', 'space', 'education', 'news',
  'business', 'technology', 'culture', 'design',
]);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchedTopicKeywords(text, topic) {
  const keywords = characterData.topicKeywords[topic] || [topic];
  return keywords.filter((keyword) => {
    const needle = String(keyword).toLowerCase();
    // Always match on word boundaries so "data" cannot fire on "metadata"
    // and "art" cannot fire on "startup".
    if (!/^[a-z0-9 ]+$/.test(needle)) return text.includes(needle);
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`, 'i').test(text);
  });
}

function textMatchesTopic(text, topic) {
  return matchedTopicKeywords(text, topic).length > 0;
}

function topicMatchStrength(text, topic) {
  const hits = matchedTopicKeywords(text, topic);
  const specific = hits.filter((keyword) => !GENERIC_TOPIC_KEYWORDS.has(keyword));
  // A character is only anchored to a story when at least one specific
  // keyword matched; generic words alone are not enough evidence.
  return specific.length;
}

function leadingInterest(character) {
  const interests = Array.isArray(character?.interests) ? character.interests : [];
  return String(interests[0] || '').toLowerCase();
}

function topicLockedToFeed(topic, feedId) {
  const feed = (characterData.feeds || []).find((entry) => entry.id === feedId);
  return Boolean(feed && Array.isArray(feed.topics) && feed.topics.includes(topic));
}

function selectCharacterForStory(storyText, allowedFeedIds) {
  const matches = matchingCharactersForStory(storyText, allowedFeedIds);
  if (!matches.length) return null;
  const topScore = matches[0].topicScore;
  const bestMatches = matches.filter((match) => match.topicScore === topScore);
  return bestMatches[Math.floor(Math.random() * bestMatches.length)];
}

function matchingCharactersForStory(storyText, allowedFeedIds, excludedAuthorId) {
  const normalizedText = String(storyText || '').toLowerCase();
  const feedIds = allowedFeedIds ? new Set(allowedFeedIds) : null;
  const matches = [];
  for (const account of characterAccounts) {
    const template = characterData.characters.find((character) => character.id === account.character_id);
    if (!template || account.automation_status !== 'active') continue;
    if (excludedAuthorId != null && Number(account.id) === Number(excludedAuthorId)) continue;
    if (feedIds && !template.feedIds.some((feedId) => feedIds.has(feedId))) continue;
    const interests = parseInterests(account.interests);
    const scored = interests
      .map((interest, index) => ({ interest, index, score: topicMatchStrength(normalizedText, interest) }))
      .filter((entry) => entry.score > 0)
      // Prefer the character's leading interests and tie-break by keyword strength.
      .sort((left, right) => (right.score - left.score) || (left.index - right.index));
    if (!scored.length) continue;
    const lead = scored[0].interest;
    // Relevance guard: a character only owns a story when its leading interest
    // (the identity it posts under) is what matched. Otherwise a tech account
    // whose 4th interest is "education" would post about school funding.
    if (lead !== leadingInterest(template) || !matchedTopicKeywords(normalizedText, lead).length) continue;
    if (feedIds) {
      const parentFeed = (characterData.feeds || []).find((entry) => entry.id === feedIds.values().next().value);
      if (parentFeed && !topicLockedToFeed(lead, parentFeed.id) &&
        !(parentFeed.topics || []).some((topic) => textMatchesTopic(normalizedText, topic))) {
        continue;
      }
    }
    const matchingInterests = scored.map((entry) => entry.interest);
    matches.push({
      account,
      character: { ...template, interests, behavior: account.personality_style || template.behavior },
      matchingInterests,
      leadInterest: lead,
      topicScore: scored[0].score,
    });
  }
  return matches.sort((left, right) =>
    (right.topicScore - left.topicScore) || (right.matchingInterests.length - left.matchingInterests.length));
}

async function getApplicationDatabase() {
  if (applicationDatabaseReady) return applicationDatabase;
  const candidate = applicationDatabase || require('./database');
  applicationDatabase = candidate;
  if (isProduction && candidate.type !== 'postgres') {
    throw new Error('The production application database must use PostgreSQL. Set NODE_ENV=production and DATABASE_URL.');
  }

  await waitForApplicationSchema(candidate);
  await ensureApplicationSourceLink(candidate);
  const accountSummary = await seedAiCharacterAccounts(candidate, { logger: log });
  log(`Character roster ready: ${accountSummary.created} created, ${accountSummary.existing} updated/existing, ${accountSummary.total} total.`);
  characterAccounts = await candidate.query(
    `SELECT id, fullname, username, character_id, location, interests, personality_style, automation_status
       FROM users WHERE is_synthetic = 1 AND character_id IS NOT NULL
         AND COALESCE(automation_status, 'active') = 'active'`,
  );
  const selfies = await generateCharacterSelfies(candidate, { logger: log });
  if (selfies.length) await publishCharacterSelfiePosts(candidate, selfies);
  applicationDatabaseReady = true;
  return applicationDatabase;
}

async function publishCharacterSelfiePosts(database, selfies) {
  for (const selfie of selfies) {
    const author = characterAccounts.find((account) => account.character_id === selfie.character.id);
    if (!author) continue;
    const sourceLink = `quickchat://ai-selfie/${selfie.character.id}`;
    const existing = await database.getOne('SELECT id FROM posts WHERE source_link = ? LIMIT 1', [sourceLink]);
    if (existing) continue;
    const firstInterest = selfie.character.interests[0] || 'culture';
    const caption = `A fresh portrait for my profile, with my curiosity still on ${selfie.character.interests.slice(0, 2).join(' and ')}.`;
    await database.insert(
      `INSERT INTO posts (author_id, body, kind, category, hashtags, target_interests, community_id, media, video_id, source_link)
       VALUES (?, ?, 'image', ?, ?, ?, NULL, ?, NULL, ?)`,
      [author.id, caption, firstInterest, JSON.stringify([]), JSON.stringify(selfie.character.interests),
        JSON.stringify([{ type: 'image', url: selfie.imageUrl }]), sourceLink],
    );
    log(`Published ${selfie.character.id}'s Pollinations selfie to Home and Explore.`);
  }
}

async function waitForApplicationSchema(database) {
  const deadline = Date.now() + positiveInteger(process.env.AI_POSTER_DB_WAIT_MS, 60000);
  let lastError;
  while (Date.now() < deadline) {
    try {
      await database.query('SELECT id FROM users LIMIT 1');
      await database.query('SELECT id FROM posts LIMIT 1');
      return;
    } catch (error) {
      lastError = error;
      await sleep(1000);
    }
  }
  throw new Error(`The app database did not finish initializing${lastError ? `: ${lastError.message}` : ''}`);
}

async function ensureApplicationSourceLink(database) {
  let columns;
  if (database.type === 'sqlite') {
    columns = new Set((await database.query('PRAGMA table_info(posts)')).map((row) => row.name.toLowerCase()));
  } else if (database.type === 'postgres') {
    columns = new Set((await database.query(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?',
      ['posts'],
    )).map((row) => row.column_name.toLowerCase()));
  } else {
    columns = new Set((await database.query('SHOW COLUMNS FROM posts')).map((row) => row.Field.toLowerCase()));
  }
  if (!columns.has('source_link')) {
    const sourceLinkType = database.type === 'mysql' ? 'VARCHAR(512)' : 'TEXT';
    await database.query(`ALTER TABLE posts ADD COLUMN source_link ${sourceLinkType}`);
  }

  if (database.type === 'mysql') {
    const existing = await database.getOne(
      'SELECT index_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND index_name = ?',
      ['posts_source_link_unique_idx'],
    );
    if (!existing) await database.query('CREATE UNIQUE INDEX posts_source_link_unique_idx ON posts (source_link)');
  } else {
    await database.query('CREATE UNIQUE INDEX IF NOT EXISTS posts_source_link_unique_idx ON posts (source_link)');
  }
}

async function publishToTimeline(post, database, logger = log) {
  const sourceLink = post.source_link || post.sourceLink;
  if (!sourceLink) return null;
  const imageUrl = post.image_url || post.imageUrl || null;
  const videoUrl = post.video_url || post.videoUrl || null;
  const embedded = Boolean(post.video_embedded || post.videoEmbedded || isYouTubeUrl(videoUrl));
  const media = [];
  if (imageUrl) media.push({ type: 'image', url: imageUrl });
  if (videoUrl) media.push({ type: 'video', url: videoUrl, ...(embedded ? { embed: true } : {}) });
  const kind = videoUrl ? 'video' : imageUrl ? 'image' : 'text';
  const title = post.source_title || post.title || 'Feed article';
  const summary = String(post.summary || '').trim();
  const author = characterAccounts.find((account) => Number(account.id) === Number(post.author_user_id));
  const authorId = Number(post.author_user_id);
  if (!author || !authorId) {
    logger(`Skipped "${title.slice(0, 90)}": no character from characters.json was assigned.`);
    return null;
  }
  const targetInterests = parseInterests(post.target_interests).length
    ? parseInterests(post.target_interests)
    : parseInterests(author?.interests);
  const category = post.category || targetInterests[0] || 'News';

  const existing = await database.getOne('SELECT id, media, kind FROM posts WHERE source_link = ? LIMIT 1', [sourceLink]);
  if (existing) {
    if (media.length) {
      let savedMedia = [];
      try {
        const parsed = typeof existing.media === 'string' ? JSON.parse(existing.media) : existing.media;
        if (Array.isArray(parsed)) savedMedia = parsed;
      } catch (_error) {
        savedMedia = [];
      }
      const mergedMedia = [...savedMedia];
      for (const attachment of media) {
        if (!mergedMedia.some((entry) => entry.type === attachment.type && entry.url === attachment.url)) {
          mergedMedia.push(attachment);
        }
      }
      if (mergedMedia.length !== savedMedia.length) {
        const updatedKind = videoUrl ? 'video' : existing.kind || kind;
        await database.update('UPDATE posts SET media = ?, kind = ? WHERE id = ?', [JSON.stringify(mergedMedia), updatedKind, existing.id]);
      }
    }
    return existing.id;
  }

  if (!summary) return null;

  try {
    const saved = await database.insert(
      `INSERT INTO posts (author_id, body, kind, category, hashtags, target_interests, community_id, media, video_id, source_link)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?)`,
      [
        authorId,
        summary,
        kind,
        category,
        JSON.stringify([]),
        JSON.stringify(targetInterests.length ? targetInterests : ['news']),
        JSON.stringify(media),
        sourceLink,
      ],
    );
    logger(`Published "${title.slice(0, 90)}" to Home and Explore.`);
    return saved?.id || null;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const duplicate = await database.getOne('SELECT id FROM posts WHERE source_link = ? LIMIT 1', [sourceLink]);
      if (duplicate) return duplicate.id;
    }
    throw error;
  }
}

async function publishStagedPosts(stage, database, feeds) {
  const staged = await listStagePosts(stage);
  let published = 0;
  for (const post of staged) {
    try {
      if (!post.author_user_id) {
        const match = selectCharacterForStory(`${post.source_title || ''} ${post.summary || ''}`, feeds.map((feed) => feed.id));
        if (!match) continue;
        post.author_user_id = match.account.id;
        post.category = match.matchingInterests[0];
        post.target_interests = JSON.stringify(match.character.interests);
        await stage.query(
          'UPDATE autonomous_posts SET author_user_id = ?, category = ?, target_interests = ? WHERE source_link = ? AND author_user_id IS NULL',
          [post.author_user_id, post.category, post.target_interests, post.source_link],
        );
      }
      const before = await database.getOne('SELECT id FROM posts WHERE source_link = ? LIMIT 1', [post.source_link]);
      await publishToTimeline(post, database);
      if (!before) published += 1;
    } catch (error) {
      log(`Could not publish saved story "${post.source_title || post.source_link}"`, error);
    }
  }
  if (published) log(`Published ${published} previously saved story/stories into the app feed.`);
}

async function processFeed(feedConfig, stage, database) {
  const feedUrl = feedConfig.url;
  let feed;
  try {
    if (feedConfig.localPath) {
      const xml = await fs.readFile(feedConfig.localPath, 'utf8');
      const wellFormedXml = xml.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);)/gi, '&amp;');
      feed = await parser.parseString(wellFormedXml);
    } else {
      feed = await fetchFeed(feedUrl);
    }
  } catch (error) {
    log(`Could not read feed ${feedUrl}`, error);
    return;
  }
  const items = Array.isArray(feed.items) ? feed.items : [];
  log(`Read ${items.length} item(s) from ${feedUrl}.`);
  let visited = 0;
  let publishedThisFeed = 0;
  let alreadyStaged = 0;
  let outsideInterests = 0;
  let missingDescription = 0;

  for (const item of items) {
    if (shuttingDown || visited >= maxItemsPerFeed) break;
    const sourceLink = absoluteUrl(item.link || item.guid, feedUrl);
    if (!sourceLink) continue;
    visited += 1;

    if (classifyAdultSource(sourceLink).isUnavailable) {
      log(`Skipped age-ambiguous item from ${feedConfig.name}.`);
      continue;
    }

    try {
      // Check the canonical link before parsing HTML or sending any text to the model.
      const staged = await getStagePost(stage, sourceLink);
      if (staged) {
        alreadyStaged += 1;
        if (!staged.author_user_id) {
          const match = selectCharacterForStory(`${staged.source_title || ''} ${staged.summary || ''}`, [feedConfig.id]);
          if (match) {
            staged.author_user_id = match.account.id;
            staged.category = match.matchingInterests[0];
            staged.target_interests = JSON.stringify(match.character.interests);
            await stage.query(
              'UPDATE autonomous_posts SET author_user_id = ?, category = ?, target_interests = ? WHERE source_link = ? AND author_user_id IS NULL',
              [staged.author_user_id, staged.category, staged.target_interests, sourceLink],
            );
          }
        }
        if (!staged.video_url) {
          const discovered = await discoverArticleVideo(sourceLink);
          if (discovered.videoUrl) {
            await stage.query(
              'UPDATE autonomous_posts SET video_url = ? WHERE source_link = ? AND video_url IS NULL',
              [discovered.videoUrl, sourceLink],
            );
            staged.video_url = discovered.videoUrl;
            staged.video_embedded = discovered.videoEmbedded;
            log(`Found an embedded video for ${sourceLink}.`);
          }
        }
        if (staged.author_user_id) {
          const existingTimelinePost = await database.getOne('SELECT id FROM posts WHERE source_link = ? LIMIT 1', [sourceLink]);
          const published = await publishToTimeline(staged, database);
          if (!existingTimelinePost && published) publishedThisFeed += 1;
        }
        log(`Already processed; skipped ${sourceLink}.`);
        continue;
      }

      const html = itemHtml(item);
      const title = String(item.title || '').replace(/\s+/g, ' ').trim();
      const text = cleanText(html);
      if (!text) {
        missingDescription += 1;
        log(`Skipped ${sourceLink}: the feed item had no readable description.`);
        continue;
      }
      const match = selectCharacterForStory(`${title} ${text}`, [feedConfig.id]);
      if (!match) {
        outsideInterests += 1;
        log(`Skipped "${title || sourceLink}": no active character follows this ${feedConfig.name} topic.`);
        continue;
      }
      const media = extractMedia(item, html, sourceLink);
      if (!media.videoUrl) Object.assign(media, await discoverArticleVideo(sourceLink));
      const summary = await rewriteSummary(title, text, match.character, match.matchingInterests);
      await saveStagePost(stage, {
        sourceLink,
        title,
        summary,
        imageUrl: media.imageUrl,
        videoUrl: media.videoUrl,
        authorUserId: match.account.id,
        category: match.leadInterest || match.matchingInterests[0],
        targetInterests: match.character.interests,
      });
      const saved = await getStagePost(stage, sourceLink);
      if (saved) {
        // Preserve whether the URL is an embeddable YouTube frame for the shared post card.
        if (media.videoEmbedded) saved.video_embedded = 1;
        const published = await publishToTimeline(saved, database);
        if (published) publishedThisFeed += 1;
      }
    } catch (error) {
      log(`Could not process ${sourceLink}`, error);
    } finally {
      if (!shuttingDown) await sleep(itemPauseMs);
    }
  }
  log(`${feedConfig.name}: checked ${visited}, published ${publishedThisFeed}, already staged ${alreadyStaged}, outside character interests ${outsideInterests}, no description ${missingDescription}.`);
}

async function publishOriginalCharacterPosts(database) {
  const config = await getGeminiConfig();
  if (!config.enabled || !config.apiKey) return;
  const limit = positiveInteger(process.env.AI_POSTER_CHARACTER_POSTS_PER_RUN, 3);
  const characters = characterData.characters || [];
  let published = 0;
  for (const account of characterAccounts) {
    if (published >= limit || shuttingDown) break;
    const character = characters.find((entry) => entry.id === account.character_id);
    if (!character) continue;
    const dayKey = new Date().toISOString().slice(0, 10);
    const sourceLink = `quickchat://ai-character/${encodeURIComponent(character.id)}/${dayKey}`;
    const exists = await database.getOne('SELECT id FROM posts WHERE source_link = ? LIMIT 1', [sourceLink]);
    if (exists) continue;
    try {
      const body = await generateGeminiText({
        system: [
          'Create one original, engaging social post for this clearly disclosed fictional AI character on QuickChat.',
          `Character personality: ${character.behavior}`,
          `Interests: ${(character.interests || []).join(', ')}.`,
          'Write in a distinct, natural voice. Do not claim to be human or invent real-world personal experiences, memories, work, travel, or offline activities.',
          'Make the post useful, entertaining, or conversational. Avoid engagement bait and do not ask for likes or follows. Return only the post text.',
        ].join('\\n'),
        prompt: 'Write a fresh standalone post for today. Keep it between 40 and 100 words.',
        temperature: 0.85,
        maxOutputTokens: 180,
      });
      const text = String(body || '').trim().slice(0, 5000);
      if (!text) continue;
      await database.insert(
        'INSERT INTO posts (author_id, body, kind, category, hashtags, target_interests, community_id, media, video_id, visibility, price_amount, price_currency, topics, keywords, audience_signals, source_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [Number(account.id), text, 'text', (character.interests || [])[0] || 'community', '[]', JSON.stringify(character.interests || []), null, '[]', null, 'public', null, null, '[]', '[]', '[]', sourceLink],
      );
      published += 1;
      await sleep(1200);
    } catch (error) { log(`Could not publish original post for AI character ${character.id}`, error); }
  }
  if (published) log(`Published ${published} original Gemini character post(s).`);
}
async function runOnce() {
  if (runInProgress || shuttingDown) return;
  runInProgress = true;
  try {
    const database = await getApplicationDatabase();
    await publishOriginalCharacterPosts(database);
    const feeds = rssPublishingDisabled ? [] : configuredFeeds();
    if (!rssPublishingDisabled) {
      if (!stageDatabase) {
        stageDatabase = createStageDatabase();
        await initializeStageDatabase(stageDatabase);
      }
      await publishStagedPosts(stageDatabase, database, feeds);
    } else {
      log('RSS polling and staged RSS publishing are disabled; the dedicated RSS worker owns feed publishing.');
    }
    if (process.env.AI_POSTER_STAGED_ONLY === '1') {
      log('Staged-story publishing pass complete; feed polling was skipped.');
      return;
    }
    // Only reply to humans who have already messaged an AI character. Do not cold-DM users or fabricate likes/follows.
    await respondToHumanMessages(database);
    if (rssPublishingDisabled) return;
    if (!feeds.length) {
      log('No valid URLs are configured in AI_POSTER_FEEDS.');
      return;
    }
    for (const feed of feeds) {
      if (shuttingDown) break;
      await processFeed(feed, stageDatabase, database);
    }

  } catch (error) {
    log('Scheduled run failed', error);
  } finally {
    runInProgress = false;
  }
}

function botCandidatesForHuman(user, contextText, limit = 5) {
  if (!characterAccounts.length) return [];
  const targetText = `${parseInterests(user.interests).join(' ')} ${user.bio || ''} ${contextText || ''}`;
  const matches = matchingCharactersForStory(targetText, null, user.id);
  const ordered = [...matches];
  const seen = new Set(matches.map((match) => Number(match.account.id)));
  const startAt = Math.abs(Number(user.id) || 0) % characterAccounts.length;
  for (let offset = 0; offset < characterAccounts.length; offset += 1) {
    const account = characterAccounts[(startAt + offset) % characterAccounts.length];
    if (seen.has(Number(account.id))) continue;
    const template = characterData.characters.find((character) => character.id === account.character_id);
    if (!template || account.automation_status !== 'active') continue;
    const interests = parseInterests(account.interests);
    ordered.push({
      account,
      character: { ...template, interests, behavior: account.personality_style || template.behavior },
      matchingInterests: interests.filter((interest) => textMatchesTopic(targetText.toLowerCase(), interest)).slice(0, 2)
        .concat(interests.length ? [] : ['culture']),
    });
    seen.add(Number(account.id));
  }
  return ordered.slice(0, limit);
}

async function listHumanPosts(database, limit = 60) {
  return database.query(
    `SELECT p.id, p.author_id, p.body, p.kind, p.category, p.hashtags, p.media, p.visibility, p.created_at,
            u.fullname AS author_name, u.interests AS author_interests, u.bio AS author_bio
       FROM posts p JOIN users u ON u.id = p.author_id
      WHERE COALESCE(u.is_synthetic, 0) = 0 AND p.community_id IS NULL
      ORDER BY p.created_at DESC, p.id DESC LIMIT ?`,
    [limit],
  );
}

function postEngagementTarget(post, maximum) {
  const text = String(post.body || '').trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  let score = 10;
  if (words >= 8) score += 1;
  if (words >= 20) score += 2;
  if (words >= 45) score += 2;
  if (words >= 90) score += 1;
  if (post.media && String(post.media) !== '[]') score += 2;
  if (post.hashtags && String(post.hashtags) !== '[]') score += 1;
  if (post.category) score += 1;
  if (String(post.kind || 'text') !== 'text') score += 1;
  return Math.max(1, Math.min(Number(maximum) || 1, score));
}

function postCommentTarget(post, maximum) {
  const text = String(post.body || '').trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  let score = 2;
  if (words >= 18) score += 1;
  if (words >= 45) score += 1;
  if (post.media && String(post.media) !== '[]') score += 1;
  if (post.hashtags && String(post.hashtags) !== '[]') score += 1;
  return Math.max(1, Math.min(Number(maximum) || 1, score));
}

async function followHumanUsers(database) {
  const followLimit = positiveInteger(process.env.AI_POSTER_MAX_FOLLOWS_PER_RUN, 40);
  const followsPerUser = positiveInteger(process.env.AI_POSTER_FOLLOWS_PER_USER, 3);
  const users = await database.query(
    `SELECT id, interests, bio FROM users WHERE COALESCE(is_synthetic, 0) = 0 ORDER BY id LIMIT ?`,
    [positiveInteger(process.env.AI_POSTER_HUMAN_USER_SCAN_LIMIT, 200)],
  );
  const posts = await listHumanPosts(database, 200);
  const postsByUser = new Map();
  for (const post of posts) {
    const userPosts = postsByUser.get(Number(post.author_id)) || [];
    userPosts.push(post);
    postsByUser.set(Number(post.author_id), userPosts);
  }

  let created = 0;
  for (const user of users) {
    if (created >= followLimit || shuttingDown) break;
    const userPosts = postsByUser.get(Number(user.id)) || [];
    const contextText = userPosts.map((post) => `${post.category || ''} ${post.hashtags || ''} ${post.body || ''}`).join(' ');
    const candidates = botCandidatesForHuman(user, contextText, characterAccounts.length);
    let followed = await database.getCount(
      `SELECT COUNT(*) AS count FROM follows f JOIN users bot ON bot.id = f.follower_id
        WHERE f.followed_id = ? AND bot.is_synthetic = 1`,
      [user.id],
    );
    for (const candidate of candidates) {
      if (created >= followLimit || followed >= followsPerUser) break;
      const existing = await database.getOne(
        'SELECT follower_id FROM follows WHERE follower_id = ? AND followed_id = ? LIMIT 1',
        [candidate.account.id, user.id],
      );
      if (existing) continue;
      try {
        await database.query('INSERT INTO follows (follower_id, followed_id) VALUES (?, ?)', [candidate.account.id, user.id]);
        await database.query(
          `INSERT INTO notifications (user_id, actor_id, type, text)
           VALUES (?, ?, 'follow', 'followed you')`,
          [user.id, candidate.account.id],
        );
        followed += 1;
        created += 1;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
  }
  if (created) log(`Added ${created} character follow(s) to regular user accounts.`);
}

async function followBackHumans(database) {
  const limit = positiveInteger(process.env.AI_POSTER_MAX_FOLLOW_BACKS_PER_RUN, 12);
  const pending = await database.query(
    `SELECT f.follower_id AS human_id, f.followed_id AS bot_id
       FROM follows f
       JOIN users human ON human.id = f.follower_id AND COALESCE(human.is_synthetic, 0) = 0
       JOIN users bot ON bot.id = f.followed_id AND COALESCE(bot.is_synthetic, 0) = 1
      WHERE COALESCE(bot.automation_status, 'active') = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM follows back
           WHERE back.follower_id = f.followed_id AND back.followed_id = f.follower_id
        )
      ORDER BY f.created_at DESC LIMIT ?`,
    [limit],
  );

  let created = 0;
  for (const row of pending) {
    if (shuttingDown) break;
    try {
      await database.query(
        'INSERT INTO follows (follower_id, followed_id) VALUES (?, ?)',
        [row.bot_id, row.human_id],
      );
      await database.query(
        `INSERT INTO notifications (user_id, actor_id, type, text)
         VALUES (?, ?, 'follow', 'followed you back')`,
        [row.human_id, row.bot_id],
      );
      created += 1;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  if (created) log(`Followed back ${created} regular user account(s).`);
  return created;
}

async function engageWithHumanPosts(database, options = {}) {
  if (engagementInProgress || shuttingDown) return;
  engagementInProgress = true;
  try {
    return await engageWithHumanPostsNow(database, options);
  } finally {
    engagementInProgress = false;
  }
}

async function engageWithHumanPostsNow(database, options = {}) {
  let posts = await listHumanPosts(database,
    positiveInteger(options.scanLimit, positiveInteger(process.env.AI_POSTER_HUMAN_POST_SCAN_LIMIT, 60)));
  const activeHours = Number(options.activeHours);
  if (Number.isFinite(activeHours) && activeHours > 0) {
    const cutoff = Date.now() - activeHours * 60 * 60 * 1000;
    posts = posts.filter((post) => {
      const createdAt = Date.parse(post.created_at);
      return Number.isFinite(createdAt) ? createdAt >= cutoff : true;
    });
  }

  const likesPerPost = positiveInteger(options.likesPerPost,
    positiveInteger(process.env.AI_POSTER_BOT_LIKES_PER_HUMAN_POST, 16));
  const commentsPerPost = positiveInteger(options.commentsPerPost,
    positiveInteger(process.env.AI_POSTER_BOT_COMMENTS_PER_HUMAN_POST, 4));
  const likeLimit = positiveInteger(options.likeLimit,
    positiveInteger(process.env.AI_POSTER_MAX_HUMAN_LIKES_PER_RUN, 60));
  const includeComments = options.includeComments !== false;
  const commentLimit = includeComments
    ? positiveInteger(options.commentLimit, positiveInteger(process.env.AI_POSTER_MAX_HUMAN_COMMENTS_PER_RUN, 12))
    : 0;
  let likes = 0;
  let comments = 0;

  for (const post of posts) {
    if (shuttingDown) break;
    const context = `${post.category || ''} ${post.hashtags || ''} ${post.body || ''}`;
    const user = { id: post.author_id, interests: post.author_interests, bio: post.author_bio };
    const matches = botCandidatesForHuman(user, context, characterAccounts.length);
    if (!matches.length) continue;

    const existingLikes = await database.query(
      `SELECT l.user_id FROM post_likes l JOIN users bot ON bot.id = l.user_id
        WHERE l.post_id = ? AND bot.is_synthetic = 1`,
      [post.id],
    );
    const likedBy = new Set(existingLikes.map((like) => Number(like.user_id)));
    const targetLikes = postEngagementTarget(post, likesPerPost);
    for (const candidate of matches) {
      if (likes >= likeLimit || likedBy.size >= targetLikes) break;
      if (likedBy.has(Number(candidate.account.id))) continue;
      try {
        await database.query('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)', [post.id, candidate.account.id]);
        await database.query(
          `INSERT INTO notifications (user_id, actor_id, type, post_id, text)
           VALUES (?, ?, 'like', ?, 'liked your post')`,
          [post.author_id, candidate.account.id, post.id],
        );
        likedBy.add(Number(candidate.account.id));
        likes += 1;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }

    if (comments >= commentLimit) continue;
    const existingBotReplies = await database.query(
      `SELECT r.author_id FROM post_replies r JOIN users bot ON bot.id = r.author_id
        WHERE r.post_id = ? AND bot.is_synthetic = 1`,
      [post.id],
    );
    const repliedBy = new Set(existingBotReplies.map((reply) => Number(reply.author_id)));
    const targetComments = postCommentTarget(post, commentsPerPost);
    if (repliedBy.size >= targetComments) continue;
    const commenters = matches.filter((candidate) =>
      Number(candidate.account.id) !== Number(post.author_id) && !repliedBy.has(Number(candidate.account.id)));
    for (const commenter of commenters) {
      if (comments >= commentLimit || repliedBy.size >= targetComments) break;
      try {
        const reply = await writeCharacterComment(post, commenter.character, commenter.matchingInterests);
        await database.insert('INSERT INTO post_replies (post_id, author_id, body) VALUES (?, ?, ?)',
          [post.id, commenter.account.id, reply]);
        await database.query(
          `INSERT INTO notifications (user_id, actor_id, type, post_id, text)
           VALUES (?, ?, 'reply', ?, 'replied to your post')`,
          [post.author_id, commenter.account.id, post.id],
        );
        repliedBy.add(Number(commenter.account.id));
        comments += 1;
        await sleep(itemPauseMs);
      } catch (error) {
        log(`Could not reply to regular user's post ${post.id}`, error);
      }
    }
  }
  if (likes || comments) log(`Engaged with regular users: ${likes} like(s), ${comments} comment(s).`);
}

async function startHumanConversations(database) {
  const messageLimit = positiveInteger(process.env.AI_POSTER_MAX_NEW_HUMAN_CONVERSATIONS_PER_RUN, 3);
  const posts = await listHumanPosts(database, positiveInteger(process.env.AI_POSTER_HUMAN_POST_SCAN_LIMIT, 60));
  const humanUsers = await database.query(
    `SELECT id, fullname, interests, bio FROM users
      WHERE COALESCE(is_synthetic, 0) = 0 ORDER BY id LIMIT ?`,
    [positiveInteger(process.env.AI_POSTER_HUMAN_USER_SCAN_LIMIT, 200)],
  );
  const days = positiveInteger(process.env.AI_POSTER_DM_ACTIVE_DAYS, 30);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const latestPostByUser = new Map();
  for (const post of posts) {
    if (Date.parse(post.created_at) < cutoff || latestPostByUser.has(Number(post.author_id))) continue;
    latestPostByUser.set(Number(post.author_id), post);
  }

  let created = 0;
  for (const human of humanUsers) {
    if (created >= messageLimit || shuttingDown) break;
    const post = latestPostByUser.get(Number(human.id)) || {
      author_id: human.id,
      author_name: human.fullname,
      author_interests: human.interests,
      author_bio: human.bio,
      body: '',
    };
    const existingBotConversation = await database.getOne(
      `SELECT c.id FROM conversations c
        JOIN conversation_members human ON human.conversation_id = c.id AND human.user_id = ?
        JOIN conversation_members botMember ON botMember.conversation_id = c.id AND botMember.user_id <> human.user_id
        JOIN users bot ON bot.id = botMember.user_id AND bot.is_synthetic = 1 LIMIT 1`,
      [post.author_id],
    );
    if (existingBotConversation) continue;
    const user = { id: post.author_id, interests: post.author_interests, bio: post.author_bio };
    const candidates = botCandidatesForHuman(user,
      `${post.category || ''} ${post.hashtags || ''} ${post.body || ''}`, 1);
    const candidate = candidates[0];
    if (!candidate) continue;

    try {
      const text = await writeCharacterOpener(post, candidate.character);
      const conversationId = await ensureConversation(database, candidate.account.id, post.author_id);
      await database.insert('INSERT INTO messages (conversation_id, sender_id, text) VALUES (?, ?, ?)',
        [conversationId, candidate.account.id, text]);
      await database.query(
        `INSERT INTO notifications (user_id, actor_id, type, text)
         VALUES (?, ?, 'message', 'sent you a message')`,
        [post.author_id, candidate.account.id],
      );
      created += 1;
      await sleep(itemPauseMs);
    } catch (error) {
      log(`Could not start a conversation with regular user ${post.author_id}`, error);
    }
  }
  if (created) log(`Started ${created} conversation(s) with active regular users.`);
}

async function ensureConversation(database, firstUserId, secondUserId) {
  const lowId = Math.min(Number(firstUserId), Number(secondUserId));
  const highId = Math.max(Number(firstUserId), Number(secondUserId));
  const pairKey = `${lowId}:${highId}`;
  let conversation = await database.getOne('SELECT id FROM conversations WHERE pair_key = ? LIMIT 1', [pairKey]);
  if (conversation) return conversation.id;
  try {
    conversation = await database.insert('INSERT INTO conversations (pair_key) VALUES (?)', [pairKey]);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    conversation = await database.getOne('SELECT id FROM conversations WHERE pair_key = ? LIMIT 1', [pairKey]);
  }
  if (!conversation?.id) throw new Error('Could not create the direct-message conversation.');
  await database.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [conversation.id, lowId]);
  await database.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [conversation.id, highId]);
  return conversation.id;
}

async function respondToHumanMessages(database) {
  if (messageReplyInProgress || shuttingDown) return;
  const geminiConfig = await getGeminiConfig();
  if (!geminiConfig.enabled || !geminiConfig.apiKey) return;
  messageReplyInProgress = true;
  try {
    const responseLimit = positiveInteger(process.env.AI_POSTER_MAX_MESSAGE_REPLIES_PER_RUN, 5);
    const pending = await database.query(
      `SELECT m.conversation_id, m.sender_id AS human_id,
              bot.id AS bot_id, bot.character_id, bot.interests, bot.personality_style
         FROM messages m
         JOIN users human ON human.id = m.sender_id AND COALESCE(human.is_synthetic, 0) = 0
         JOIN conversation_members recipient ON recipient.conversation_id = m.conversation_id AND recipient.user_id <> m.sender_id
         JOIN users bot ON bot.id = recipient.user_id AND bot.is_synthetic = 1
        WHERE m.id = (SELECT MAX(latest.id) FROM messages latest WHERE latest.conversation_id = m.conversation_id)
        ORDER BY m.id ASC LIMIT ?`,
      [responseLimit],
    );
    let sent = 0;
    for (const incoming of pending) {
      if (shuttingDown) break;
      const character = characterData.characters.find((entry) => entry.id === incoming.character_id);
      if (!character) continue;
      const interests = parseInterests(incoming.interests);
      const persona = { ...character, interests, behavior: incoming.personality_style || character.behavior };
      try {
        const history = await database.query(
          'SELECT sender_id, text FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 8',
          [incoming.conversation_id],
        );
        const typingStartedAt = Date.now();
        const typingUntil = typingStartedAt + Math.max(inferenceTimeoutMs + 5000, 10000);
        await database.update(
          'UPDATE users SET typing_until = ?, typing_conversation_id = ? WHERE id = ?',
          [typingUntil, incoming.conversation_id, incoming.bot_id],
        );
        try {
          const text = await writeCharacterMessageReply(persona, history.reverse(), incoming.bot_id);
          const typingRemainder = Math.max(0, 2500 - (Date.now() - typingStartedAt));
          if (typingRemainder) await sleep(typingRemainder);
          await database.insert('INSERT INTO messages (conversation_id, sender_id, text) VALUES (?, ?, ?)',
            [incoming.conversation_id, incoming.bot_id, text]);
          await database.query(
            `INSERT INTO notifications (user_id, actor_id, type, text)
             VALUES (?, ?, 'message', 'sent you a message')`,
            [incoming.human_id, incoming.bot_id],
          );
          sent += 1;
        } finally {
          await database.update(
            'UPDATE users SET typing_until = NULL, typing_conversation_id = NULL WHERE id = ?',
            [incoming.bot_id],
          );
        }
        await sleep(itemPauseMs);
      } catch (error) {
        log(`Could not reply to a message from regular user ${incoming.human_id}`, error);
      }
    }
    if (sent) log(`Sent ${sent} reply/replies to regular user messages.`);
  } finally {
    messageReplyInProgress = false;
  }
}

async function writeCharacterOpener(post, character) {
  if (!String(post.body || '').trim()) {
    return requestCharacterMessage(character,
      `Start a low-pressure chat with a QuickChat user. Use one of your interests (${character.interests.slice(0, 2).join(', ')}) as an easy topic, in a short observation or question. Don't act like you know the person, don't use generic praise, and don't invent things you did, read, watched, or experienced.`,
      32);
  }
  return requestCharacterMessage(character,
    `Start a casual chat about one specific detail in this post. Make it sound relaxed, not like networking or customer support. Keep it to one short sentence, maybe two. Avoid stock openers and generic praise. Don't claim you read, watched, did, or experienced anything outside this chat. A question is optional; don't force one.\n\nPost: ${String(post.body || '').slice(0, 1600)}`,
    32);
}

async function writeCharacterMessageReply(character, history, botId) {
  const transcript = history.map((message) =>
    `${Number(message.sender_id) === Number(botId) ? 'Character' : 'User'}: ${message.text}`).join('\n');
  return requestCharacterMessage(character,
    `Reply to the latest message like a relaxed friend texting. Match the user's tone and length; a one-word message deserves a short reply. React to what they actually said. Don't summarize, lecture, overexplain, give unsolicited advice, or repeat stock phrases like "that's a great point." Don't always end with a question or steer every chat toward your interests. Never invent offline actions, memories, weekend plans, reading, travel, or personal experiences. Use one or two short sentences. Conversation:\n${transcript}`,
    45);
}

async function requestCharacterMessage(character, prompt, maxWords) {
  const response = await axios.post(modelUrl, {
    model,
    stream: false,
    messages: [
      {
        role: 'system',
        content: [
          'Write a relaxed, natural chat message with this person’s established personality. It should read like an ordinary friend-to-friend text, not a polished assistant response.',
          `Character behavior: ${character.behavior}`,
          `Background interests (mention only if naturally relevant): ${character.interests.join(', ')}.`,
          `Keep it under ${maxWords} words. Use contractions and ordinary texting language where they fit. Vary phrasing and sentence length. Avoid corporate/assistant phrasing, generic validation, summaries, lists, and filler. Don't force slang, questions, or emojis. Never invent offline actions, memories, weekend plans, reading, travel, personal experiences, or human identity. Return only the message, with no label or preamble.`,
        ].join('\n'),
      },
      { role: 'user', content: prompt },
    ],
    options: { num_ctx: 1536, num_predict: 72, temperature: 0.88 },
  }, { timeout: inferenceTimeoutMs });
  const message = String(response.data?.message?.content || '').trim()
    .replace(/^\s*(?:message|reply)\s*:\s*/i, '')
    .replace(/\s*\n+\s*/g, ' ')
    .trim();
  if (!message) throw new Error('The local model returned an empty direct message.');
  return addCharacterTypo(message.slice(0, 1000), character.typoRate);
}

async function engageWithRecentPosts(database) {
  const likeLimit = positiveInteger(process.env.AI_POSTER_MAX_LIKES_PER_RUN, 80);
  const commentLimit = positiveInteger(process.env.AI_POSTER_MAX_COMMENTS_PER_RUN, 12);
  const likesPerPost = positiveInteger(process.env.AI_POSTER_BOT_POST_LIKES_PER_POST, 8);
  const commentsPerPost = positiveInteger(process.env.AI_POSTER_BOT_POST_COMMENTS_PER_POST, 2);
  const scanLimit = positiveInteger(process.env.AI_POSTER_ENGAGEMENT_SCAN_LIMIT, 80);
  const posts = await database.query(
    `SELECT p.id, p.author_id, p.body, p.kind, p.category, p.hashtags, p.media, p.visibility,
            p.created_at, p.community_id, p.source_link, u.is_synthetic AS author_is_synthetic
       FROM posts p JOIN users u ON u.id = p.author_id
       WHERE p.community_id IS NULL AND COALESCE(u.is_synthetic, 0) = 1
         AND (p.source_link IS NULL OR p.source_link NOT LIKE 'quickchat://ai-selfie/%')
       ORDER BY p.created_at DESC, p.id DESC LIMIT ?`,
    [scanLimit],
  );
  let likes = 0;
  let comments = 0;
  const commentsByActor = new Map();

  for (const post of posts) {
    if (shuttingDown) break;
    const storyText = `${post.category || ''} ${post.hashtags || ''} ${post.body || ''}`;
    const matches = matchingCharactersForStory(storyText, null, post.author_id);
    if (!matches.length) continue;

    const existingLikes = await database.query(
      `SELECT l.user_id FROM post_likes l JOIN users bot ON bot.id = l.user_id
        WHERE l.post_id = ? AND bot.is_synthetic = 1`,
      [post.id],
    );
    const likedBy = new Set(existingLikes.map((like) => Number(like.user_id)));
    const targetLikes = postEngagementTarget(post, likesPerPost);
    for (const match of matches) {
      if (likes >= likeLimit || likedBy.size >= targetLikes) break;
      if (likedBy.has(Number(match.account.id))) continue;
      try {
        await database.query('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)',
          [post.id, match.account.id]);
        likedBy.add(Number(match.account.id));
        likes += 1;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }

    if (comments >= commentLimit) continue;
    const existingReplies = await database.query(
      `SELECT r.author_id FROM post_replies r JOIN users bot ON bot.id = r.author_id
        WHERE r.post_id = ? AND bot.is_synthetic = 1`,
      [post.id],
    );
    const repliedBy = new Set(existingReplies.map((reply) => Number(reply.author_id)));
    const targetComments = postCommentTarget(post, commentsPerPost);
    if (repliedBy.size >= targetComments) continue;
    const commenters = matches.filter((match) =>
      Number(match.account.id) !== Number(post.author_id) &&
      !repliedBy.has(Number(match.account.id)) &&
      (commentsByActor.get(Number(match.account.id)) || 0) < 2);
    for (const commenter of commenters) {
      if (comments >= commentLimit || repliedBy.size >= targetComments) break;
      try {
        const reply = await writeCharacterComment(post, commenter.character, commenter.matchingInterests);
        await database.insert(
          'INSERT INTO post_replies (post_id, author_id, body) VALUES (?, ?, ?)',
          [post.id, commenter.account.id, reply],
        );
        repliedBy.add(Number(commenter.account.id));
        commentsByActor.set(Number(commenter.account.id), (commentsByActor.get(Number(commenter.account.id)) || 0) + 1);
        comments += 1;
        await sleep(itemPauseMs);
      } catch (error) {
        log(`Could not write a character reply on post ${post.id}`, error);
      }
    }
  }
  if (likes || comments) log(`Engagement pass added ${likes} like(s) and ${comments} character comment(s).`);
}

async function writeCharacterComment(post, character, matchingInterests) {
  const response = await axios.post(modelUrl, {
    model,
    stream: false,
    messages: [
      {
        role: 'system',
        content: [
          'Write one brief, relevant reply in this fictional persona’s voice. Do not claim human identity or invent personal experiences.',
          `Character behavior: ${character.behavior}`,
          `Interests: ${character.interests.join(', ')}. This post matches: ${matchingInterests.join(', ')}.`,
          'Add one useful observation or a natural question. Keep it under 35 words. Return only the comment, with no greeting, metadata, or preamble.',
        ].join('\n'),
      },
      { role: 'user', content: `Reply to this QuickChat post:\n\n${String(post.body || '').slice(0, 2500)}` },
    ],
    options: { num_ctx: 1536, num_predict: 80, temperature: 0.75 },
  }, { timeout: inferenceTimeoutMs });
  const comment = String(response.data?.message?.content || '').trim()
    .replace(/^\s*(?:comment|reply)\s*:\s*/i, '')
    .replace(/\s*\n+\s*/g, ' ')
    .trim();
  if (!comment) throw new Error('The local model returned an empty comment.');
  return addCharacterTypo(comment.slice(0, 500), character.typoRate);
}

async function runSocialPass() {
  // Automated likes and follows are intentionally disabled; public engagement must be genuine.
}

async function closeConnections() {
  const closers = [];
  if (scheduledJob) scheduledJob.cancel();
  if (messageReplyJob) messageReplyJob.cancel();
  if (socialJob) socialJob.cancel();
  if (stageDatabase) closers.push(stageDatabase.close());
  if (applicationDatabase) closers.push(applicationDatabase.close());
  await Promise.allSettled(closers);
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Received ${signal}; waiting for the active run to finish.`);
  while (runInProgress || messageReplyInProgress || socialInProgress) await sleep(250);
  await closeConnections();
}

async function start() {
  const feeds = rssPublishingDisabled ? [] : configuredFeeds();
  const geminiConfig = await getGeminiConfig();
  log(`Gemini character engine: ${geminiConfig.enabled && geminiConfig.apiKey ? 'enabled' : 'disabled'}.`);
  if (rssPublishingDisabled) log('RSS publishing disabled; the dedicated RSS worker owns all feed posts.');
  else if (!feeds.length) log('No valid URLs are configured in AI_POSTER_FEEDS.');
  log(`Starting with ${feeds.length} feed(s), Gemini ${geminiConfig.enabled ? geminiConfig.model : 'disabled'}, schedule "${scheduleExpression}".`);
  if (process.env.AI_POSTER_RUN_ONCE === '1') {
    await runOnce();
    await closeConnections();
    return;
  }

  // Finish database setup before scheduling the fast jobs. Otherwise the first
  // pass spends minutes working through feeds before direct messages are served.
  const database = await getApplicationDatabase();
  scheduledJob = schedule.scheduleJob(scheduleExpression, () => { void runOnce(); });
  if (!scheduledJob) throw new Error(`Invalid AI_POSTER_SCHEDULE cron expression: ${scheduleExpression}`);
  messageReplyJob = schedule.scheduleJob(messageScheduleExpression, () => {
    void (async () => {
      if (messageReplyInProgress || shuttingDown || !applicationDatabaseReady) return;
      try {
        await respondToHumanMessages(database);
      } catch (error) {
        log('Scheduled direct-message reply pass failed', error);
      }
    })();
  });
  if (!messageReplyJob) throw new Error(`Invalid AI_POSTER_MESSAGE_SCHEDULE cron expression: ${messageScheduleExpression}`);
  socialJob = schedule.scheduleJob(socialScheduleExpression, () => { void runSocialPass(); });
  if (!socialJob) throw new Error(`Invalid AI_POSTER_SOCIAL_SCHEDULE cron expression: ${socialScheduleExpression}`);
  log(`Direct-message replies scheduled with "${messageScheduleExpression}" and social activity with "${socialScheduleExpression}".`);
  await runOnce();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { void shutdown(signal).finally(() => process.exit(0)); });
}

start().catch(async (error) => {
  log('Fatal startup error', error);
  await closeConnections();
  process.exitCode = 1;
});
