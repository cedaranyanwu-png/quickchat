const crypto = require('crypto');
const fs = require('fs');
const { Readable } = require('stream');

function configFromEnv(prefix = 'R2') {
  const endpoint = process.env[prefix + '_ENDPOINT'];
  const bucket = process.env[prefix + '_BUCKET'];
  const region = process.env[prefix + '_REGION'] || 'auto';
  const accessKey = process.env[prefix + '_ACCESS_KEY_ID'];
  const secretKey = process.env[prefix + '_SECRET_ACCESS_KEY'];
  if (![endpoint, bucket, accessKey, secretKey].every(Boolean)) return null;
  return { endpoint: endpoint.replace(/\/$/, ''), bucket, region, accessKey, secretKey };
}

function hmac(key, value) { return crypto.createHmac('sha256', key).update(value, 'utf8').digest(); }
function signingKey(secret, date, region) {
  const dateKey = hmac('AWS4' + secret, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, 's3');
  return hmac(serviceKey, 'aws4_request');
}
function objectUrl(config, key) {
  const url = new URL(config.endpoint);
  url.pathname = '/' + encodeURIComponent(config.bucket) + '/' + String(key).split('/').map(encodeURIComponent).join('/');
  url.search = '';
  return url;
}
function signedHeaders(config, method, url, payloadHash, contentType = '') {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const headers = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  if (contentType) headers['content-type'] = contentType;
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((name) => name + ':' + headers[name].trim() + '\n').join('');
  const signedNames = names.join(';');
  const canonicalQuery = [...url.searchParams.entries()].map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)]).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])).map(([key, value]) => key + '=' + value).join('&');
  const canonicalRequest = [method, url.pathname, canonicalQuery, canonicalHeaders, signedNames, payloadHash].join('\n');
  const scope = date + '/' + config.region + '/s3/aws4_request';
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const signature = crypto.createHmac('sha256', signingKey(config.secretKey, date, config.region)).update(stringToSign).digest('hex');
  return { ...headers, Authorization: 'AWS4-HMAC-SHA256 Credential=' + config.accessKey + '/' + scope + ', SignedHeaders=' + signedNames + ', Signature=' + signature };
}
function emptyHash() { return crypto.createHash('sha256').update('').digest('hex'); }

async function putFile(config, key, filePath, contentType) {
  const url = objectUrl(config, key);
  const stat = await fs.promises.stat(filePath);
  const headers = signedHeaders(config, 'PUT', url, await sha256File(filePath), contentType);
  headers['content-length'] = String(stat.size);
  const response = await fetch(url, { method: 'PUT', headers, body: fs.createReadStream(filePath), duplex: 'half' });
  if (!response.ok) throw new Error('R2 upload failed (' + response.status + '): ' + (await response.text()).slice(0, 300));
  return { key, size: stat.size };
}
async function putBuffer(config, key, data, contentType) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const url = objectUrl(config, key);
  const headers = signedHeaders(config, 'PUT', url, crypto.createHash('sha256').update(buffer).digest('hex'), contentType);
  headers['content-length'] = String(buffer.length);
  const response = await fetch(url, { method: 'PUT', headers, body: buffer });
  if (!response.ok) throw new Error('R2 upload failed (' + response.status + '): ' + (await response.text()).slice(0, 300));
  return { key, size: buffer.length };
}
async function getObject(config, key, range) {
  const url = objectUrl(config, key);
  const headers = signedHeaders(config, 'GET', url, emptyHash());
  if (range) headers.range = range;
  return fetch(url, { method: 'GET', headers });
}
async function headObject(config, key) {
  const url = objectUrl(config, key);
  const response = await fetch(url, { method: 'HEAD', headers: signedHeaders(config, 'HEAD', url, emptyHash()) });
  if (!response.ok && response.status !== 404) throw new Error('R2 object check failed (' + response.status + ').');
  return response.status !== 404;
}
async function deleteObject(config, key) {
  const url = objectUrl(config, key);
  const response = await fetch(url, { method: 'DELETE', headers: signedHeaders(config, 'DELETE', url, emptyHash()) });
  if (!response.ok && response.status !== 404) throw new Error('R2 delete failed (' + response.status + ').');
}
async function listObjects(config, prefix = '') {
  const objects = [];
  let token = '';
  do {
    const url = new URL(config.endpoint);
    url.pathname = '/' + encodeURIComponent(config.bucket);
    url.searchParams.set('list-type', '2');
    url.searchParams.set('max-keys', '1000');
    if (prefix) url.searchParams.set('prefix', prefix);
    if (token) url.searchParams.set('continuation-token', token);
    const response = await fetch(url, { method: 'GET', headers: signedHeaders(config, 'GET', url, emptyHash()) });
    if (!response.ok) throw new Error('R2 list failed (' + response.status + '): ' + (await response.text()).slice(0, 300));
    const xml = await response.text();
    const entries = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)];
    if (entries.length) {
      for (const entry of entries) {
        const key = entry[1].match(/<Key>([^<]+)<\/Key>/);
        const size = entry[1].match(/<Size>(\d+)<\/Size>/);
        const modified = entry[1].match(/<LastModified>([^<]+)<\/LastModified>/);
        if (key) objects.push({ key: decodeXml(key[1]), size: size ? Number(size[1]) : null, lastModified: modified ? decodeXml(modified[1]) : null });
      }
    } else {
      for (const match of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) objects.push({ key: decodeXml(match[1]) });
    }
    const truncated = /<IsTruncated>true<\/IsTruncated>/i.test(xml);
    const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/i);
    token = truncated && next ? decodeXml(next[1]) : '';
    if (truncated && !token) throw new Error('R2 returned a truncated listing without a continuation token.');
  } while (token);
  return objects;
}

async function getAllConfigs() {
  const configs = [];
  try {
    const { getSetting } = require('./platform-settings');
    const raw = await getSetting('r2_buckets', '');
    if (raw) {
      const saved = JSON.parse(raw);
      const buckets = Array.isArray(saved.buckets) ? saved.buckets.filter((item) => item.enabled !== false && [item.endpoint, item.bucket, item.accessKey, item.secretKey].every(Boolean)) : [];
      buckets.sort((a, b) => (a.id === saved.activeId ? -1 : b.id === saved.activeId ? 1 : 0));
      for (const item of buckets) configs.push({ endpoint: String(item.endpoint).replace(/\/$/, ''), bucket: item.bucket, region: item.region || 'auto', accessKey: item.accessKey, secretKey: item.secretKey, id: item.id, name: item.name || item.bucket });
    }
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Saved R2 bucket configuration is invalid JSON.');
    throw error;
  }
  if (!configs.length) {
    const fallback = configFromEnv('R2');
    if (fallback) configs.push({ ...fallback, id: 'railway-env', name: fallback.bucket });
  }
  return configs;
}

async function getActiveConfig() {
  const configs = await getAllConfigs();
  return configs[0] || null;
}

function decodeXml(value) { return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"); }
async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}
async function streamToBuffer(response) { return response.ok ? Buffer.from(await response.arrayBuffer()) : null; }
function streamToNode(response) { return response.body ? Readable.fromWeb(response.body) : null; }

module.exports = { configFromEnv, getActiveConfig, getAllConfigs, objectUrl, putFile, putBuffer, getObject, headObject, deleteObject, listObjects, streamToBuffer, streamToNode };
