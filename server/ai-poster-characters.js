const fs = require('node:fs/promises');
const path = require('node:path');
const axios = require('axios');
const characterData = require('./models/data/characters.json');

let faker;
let localizedFakers = {};
try {
  const fakerPackage = require('@faker-js/faker');
  faker = fakerPackage.faker;
  localizedFakers = {
    ng: fakerPackage.fakerEN_NG,
    gh: fakerPackage.fakerEN_GH,
    za: fakerPackage.fakerEN_ZA,
    ke: fakerPackage.fakerEN_NG,
    ca: fakerPackage.fakerEN_CA,
    us: fakerPackage.fakerEN_US,
  };
} catch (_error) {
  // Keep existing installs bootable while optional profile dependencies are unavailable.
}

const characters = characterData.characters;
const supportedRandomUserNationalities = new Set(['ca', 'us']);

async function seedAiCharacterAccounts(database, options = {}) {
  const logger = options.logger || (() => {});
  await ensureCharacterIdColumn(database);

  const allUsers = await database.query(
    'SELECT id, username, character_id, is_synthetic, avatar_url, picture FROM users ORDER BY id',
  );
  const reservedUsernames = new Set(allUsers
    .filter((user) => !Number(user.is_synthetic))
    .map((user) => String(user.username || '').toLowerCase()));
  const roster = new Map();
  for (const user of allUsers) {
    if (user.character_id && characters.some((character) => character.id === user.character_id)) {
      roster.set(user.character_id, user);
    }
  }

  // Upgrade older synthetic rows in place so existing posts keep their author IDs.
  const legacyRows = allUsers.filter((user) => Number(user.is_synthetic) && !user.character_id);
  let legacyIndex = 0;
  for (const user of legacyRows) {
    while (legacyIndex < characters.length && roster.has(characters[legacyIndex].id)) legacyIndex += 1;
    if (legacyIndex >= characters.length) break;
    const character = characters[legacyIndex++];
    const account = buildAccount(character, characterIndex(character));
    const username = usernameFor(character, characterIndex(character));
    const avatar = character.region === 'African' ? null : user.avatar_url || user.picture || null;
    await updateCharacterAccount(database, user.id, character, account, username, avatar);
    const migrated = { ...user, character_id: character.id, username, avatar_url: avatar, picture: avatar };
    roster.set(character.id, migrated);
    logger(`[AI poster] Migrated ${character.id} to the character roster as @${username}.`);
  }

  // Existing character rows get canonical identities, local settings, and clean handles.
  for (const character of characters) {
    const user = roster.get(character.id);
    if (!user) continue;
    const index = characterIndex(character);
    const account = buildAccount(character, index);
    const username = reserveUsername(usernameFor(character, index), character, reservedUsernames, user.id);
    const avatar = character.region === 'African' ? null : user.avatar_url || user.picture || null;
    await updateCharacterAccount(database, user.id, character, account, username, avatar);
    roster.set(character.id, { ...user, character_id: character.id, username, avatar_url: avatar, picture: avatar });
  }

  const missing = characters
    .map((character) => ({ character, index: characterIndex(character) }))
    .filter((entry) => !roster.has(entry.character.id));
  const profilePools = await loadRandomUserProfiles(missing, logger);
  let created = 0;
  for (const entry of missing) {
    const nat = entry.character.randomUserNat;
    const profile = supportedRandomUserNationalities.has(nat)
      ? profilePools.get(nat)?.shift() || {}
      : {};
    const account = buildAccount(entry.character, entry.index, profile);
    const username = reserveUsername(usernameFor(entry.character, entry.index), entry.character, reservedUsernames);
    try {
      const saved = await database.insert(
        `INSERT INTO users
          (fullname, name, username, email, password, interests, bio, location, avatar_url, picture,
           createdat, verified, is_synthetic, automation_status, personality_style, character_id)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0, 1, 'active', ?, ?)`,
        [account.fullname, account.fullname, username,
          `ai-poster-${entry.character.id}@quickchat.local`, JSON.stringify(account.interests), account.bio,
          entry.character.location, account.avatarUrl, account.avatarUrl, account.personalityStyle, entry.character.id],
      );
      if (saved?.id) roster.set(entry.character.id, { id: saved.id, username, character_id: entry.character.id });
      reservedUsernames.add(username.toLowerCase());
      created += 1;
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
      const existing = await database.getOne('SELECT id, username, character_id FROM users WHERE character_id = ? LIMIT 1', [entry.character.id]);
      if (existing) roster.set(entry.character.id, existing);
    }
  }

  const total = await database.getCount('SELECT COUNT(*) AS count FROM users WHERE is_synthetic = 1 AND character_id IS NOT NULL');
  return { created, existing: Math.max(0, total - created), total, roster: [...roster.values()] };
}

async function ensureCharacterIdColumn(database) {
  let columns;
  if (database.type === 'sqlite') {
    columns = new Set((await database.query('PRAGMA table_info(users)')).map((row) => row.name.toLowerCase()));
  } else if (database.type === 'postgres') {
    columns = new Set((await database.query(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?',
      ['users'],
    )).map((row) => row.column_name.toLowerCase()));
  } else {
    columns = new Set((await database.query('SHOW COLUMNS FROM users')).map((row) => row.Field.toLowerCase()));
  }
  if (!columns.has('character_id')) await database.query('ALTER TABLE users ADD COLUMN character_id TEXT');
}

async function updateCharacterAccount(database, userId, character, account, username, avatarUrl) {
  await database.update(
    `UPDATE users SET fullname = ?, name = ?, username = ?, interests = ?, bio = ?, location = ?,
       avatar_url = ?, picture = ?, is_synthetic = 1, automation_status = 'active',
       personality_style = ?, character_id = ? WHERE id = ?`,
    [account.fullname, account.fullname, username, JSON.stringify(account.interests), account.bio,
      character.location, avatarUrl, avatarUrl, account.personalityStyle, character.id, userId],
  );
}

async function loadRandomUserProfiles(entries, logger) {
  const counts = new Map();
  for (const entry of entries) {
    const nat = entry.character.randomUserNat;
    if (supportedRandomUserNationalities.has(nat)) counts.set(nat, (counts.get(nat) || 0) + 1);
  }

  const pools = new Map();
  await Promise.all([...counts].map(async ([nat, count]) => {
    try {
      const response = await axios.get('https://randomuser.me/api/', {
        params: { results: count, nat, seed: `quickchat-ai-poster-${nat}-v2`, inc: 'picture' },
        timeout: positiveInteger(process.env.AI_POSTER_PROFILE_API_TIMEOUT_MS, 8000, 30000),
        maxRedirects: 2,
      });
      pools.set(nat, Array.isArray(response.data?.results) ? response.data.results : []);
    } catch (error) {
      logger(`[AI poster] RandomUser photo lookup failed for ${nat}; Faker will supply profile details: ${error.message}`);
      pools.set(nat, []);
    }
  }));
  return pools;
}

function buildAccount(character, index, profile = {}) {
  const identity = identityFor(character, index);
  const avatarUrl = character.region === 'African' ? null : profile.picture?.large || profile.picture?.medium || null;
  return {
    fullname: identity.fullname,
    location: character.location,
    avatarUrl,
    interests: character.interests,
    bio: `${character.behavior} Interests: ${character.interests.join(', ')}.`,
    personalityStyle: character.behavior,
  };
}

function identityFor(character, index) {
  const localFaker = localizedFakers[character.randomUserNat] || faker;
  if (!localFaker) {
    return { fullname: character.id.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' '), username: character.usernameKey };
  }
  localFaker.seed(4_901 + index * 37);
  const firstName = localFaker.person.firstName();
  const lastName = localFaker.person.lastName();
  const fullname = `${firstName} ${lastName}`;
  localFaker.seed(7_103 + index * 41);
  let username = localFaker.internet.username({ firstName, lastName });
  username = String(username || `${firstName}${lastName}`).toLowerCase()
    .replace(/[^a-z0-9]+/g, '').slice(0, 26);
  if (!username) username = `${character.usernameKey}${index + 1}`;
  return { fullname, username };
}

function usernameFor(character, index) {
  return identityFor(character, index).username;
}

function reserveUsername(candidate, character, reserved, currentUserId) {
  let base = String(candidate || character.usernameKey).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 22);
  if (!base) base = character.usernameKey;
  let username = base;
  let suffix = 1;
  const used = (value) => reserved.has(value.toLowerCase());
  while (used(username)) {
    const tail = `${character.usernameKey}${suffix++}`;
    username = `${base.slice(0, 28 - tail.length)}${tail}`;
  }
  reserved.add(username.toLowerCase());
  return username;
}

function characterIndex(character) {
  return characters.findIndex((entry) => entry.id === character.id);
}

async function generateCharacterSelfies(database, options = {}) {
  const logger = options.logger || (() => {});
  const apiKey = String(process.env.POLLINATIONS_API_KEY || '').trim();
  if (!apiKey) {
    logger('[AI poster] Pollinations selfies are paused; set POLLINATIONS_API_KEY in server/.env to enable them.');
    return [];
  }

  const uploadDirectory = path.join(__dirname, 'uploads', 'ai-character-selfies');
  await fs.mkdir(uploadDirectory, { recursive: true });
  const accounts = await database.query(
    'SELECT id, fullname, character_id FROM users WHERE is_synthetic = 1 AND character_id IS NOT NULL',
  );
  const byCharacter = new Map(accounts.map((account) => [account.character_id, account]));
  const selfies = [];

  for (const character of characters) {
    const account = byCharacter.get(character.id);
    if (!account) continue;
    try {
      let filename = await findExistingSelfie(uploadDirectory, character.id);
      if (!filename) filename = await requestPollinationsSelfie(character, account, uploadDirectory, apiKey);
      const imageUrl = `/uploads/ai-character-selfies/${filename}`;
      await database.update('UPDATE users SET avatar_url = ?, picture = ? WHERE id = ?', [imageUrl, imageUrl, account.id]);
      selfies.push({ character, account, imageUrl });
    } catch (error) {
      logger(`[AI poster] Could not create a Pollinations selfie for ${character.id}`, error);
    }
  }
  return selfies;
}

async function findExistingSelfie(directory, characterId) {
  for (const extension of ['jpg', 'png', 'webp']) {
    const filename = `${characterId}.${extension}`;
    try {
      await fs.access(path.join(directory, filename));
      return filename;
    } catch (_error) {
      // Try the next supported image extension.
    }
  }
  return null;
}

async function requestPollinationsSelfie(character, account, directory, apiKey) {
  const prompt = [
    `Create a realistic, warm, natural head-and-shoulders selfie portrait of a fictional AI social character named ${account.fullname}.`,
    `They are based in ${character.location} and enjoy ${character.interests.join(', ')}.`,
    'Make this look like a casual front-camera selfie in soft daylight, friendly expression, simple background, natural clothing, square composition.',
    'This is an original fictional character, not a portrait of a real public figure. Avoid text, logos, watermarks, stereotypes, and extra people.',
  ].join(' ');
  const params = {
    model: process.env.POLLINATIONS_IMAGE_MODEL || 'flux',
    width: 512,
    height: 512,
    seed: 25_000 + characterIndex(character) * 113,
  };
  const response = await axios.get(`https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}`, {
    params,
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'image/*' },
    responseType: 'arraybuffer',
    timeout: positiveInteger(process.env.POLLINATIONS_TIMEOUT_MS, 120000, 240000),
    maxContentLength: 8 * 1024 * 1024,
    maxBodyLength: 8 * 1024 * 1024,
  });
  const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('image/')) throw new Error(`Pollinations returned ${contentType || 'a non-image response'}.`);
  const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const filename = `${character.id}.${extension}`;
  await fs.writeFile(path.join(directory, filename), Buffer.from(response.data));
  return filename;
}

function positiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function isUniqueConstraint(error) {
  return ['23505', 'SQLITE_CONSTRAINT', 'ER_DUP_ENTRY'].includes(error?.code) ||
    /unique constraint|duplicate key/i.test(String(error?.message || ''));
}

module.exports = { characterData, generateCharacterSelfies, seedAiCharacterAccounts, usernameFor };
