const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');

function cfg(prefix) {
  const endpoint = process.env[prefix + '_ENDPOINT'];
  const bucket = process.env[prefix + '_BUCKET'];
  const region = process.env[prefix + '_REGION'] || 'auto';
  const accessKey = process.env[prefix + '_ACCESS_KEY_ID'];
  const secretKey = process.env[prefix + '_SECRET_ACCESS_KEY'];
  if (![endpoint, bucket, accessKey, secretKey].every(Boolean)) throw new Error(prefix + ' storage credentials are incomplete.');
  return { endpoint: endpoint.replace(/\/$/, ''), bucket, region, accessKey, secretKey };
}
function hmac(key, value) { return crypto.createHmac('sha256', key).update(value, 'utf8').digest(); }
function signingKey(secret, date, region) {
  let key = hmac('AWS4' + secret, date);
  key = hmac(key, region);
  key = hmac(key, 's3');
  return hmac(key, 'aws4_request');
}
function awsEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase());
}
function canonicalQuery(url) {
  return [...url.searchParams.entries()]
    .map(([key, value]) => [awsEncode(key), awsEncode(value)])
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
    .map(([key, value]) => key + '=' + value)
    .join('&');
}
function urlFor(config, key) {
  const url = new URL(config.endpoint);
  url.pathname = '/' + awsEncode(config.bucket) + '/' + String(key).split('/').map(awsEncode).join('/');
  url.search = '';
  return url;
}
function signedHeaders(config, method, url, payloadHash, extraHeaders = {}) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const headers = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, ...extraHeaders };
  const names = Object.keys(headers).map((name) => name.toLowerCase()).sort();
  const canonicalHeaders = names.map((name) => name + ':' + String(headers[name]).trim().replace(/\s+/g, ' ') + '\n').join('');
  const signedNames = names.join(';');
  const canonicalRequest = [method, url.pathname, canonicalQuery(url), canonicalHeaders, signedNames, payloadHash].join('\n');
  const scope = date + '/' + config.region + '/s3/aws4_request';
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const signature = crypto.createHmac('sha256', signingKey(config.secretKey, date, config.region)).update(stringToSign).digest('hex');
  return { ...headers, Authorization: 'AWS4-HMAC-SHA256 Credential=' + config.accessKey + '/' + scope + ', SignedHeaders=' + signedNames + ', Signature=' + signature };
}
function emptyHash() { return crypto.createHash('sha256').update('').digest('hex'); }
function decodeXml(value) {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
async function listPage(config, token) {
  const url = new URL(config.endpoint);
  url.pathname = '/' + awsEncode(config.bucket);
  url.searchParams.set('list-type', '2');
  url.searchParams.set('max-keys', '1000');
  if (token) url.searchParams.set('continuation-token', token);
  const response = await fetch(url, { headers: signedHeaders(config, 'GET', url, emptyHash()) });
  if (!response.ok) throw new Error('Source list failed (' + response.status + '): ' + (await response.text()).slice(0, 500));
  const xml = await response.text();
  const keys = [...xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)].map((match) => decodeXml(match[1]));
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const nextToken = (xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/) || [])[1];
  if (truncated && !nextToken) throw new Error('Source storage returned a truncated page without a continuation token.');
  return { keys, nextToken: nextToken ? decodeXml(nextToken) : null, truncated };
}
async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}
async function copy(src, dst, key, targetKey) {
  const sourceUrl = urlFor(src, key);
  const get = await fetch(sourceUrl, { headers: signedHeaders(src, 'GET', sourceUrl, emptyHash()) });
  if (!get.ok) throw new Error('GET ' + key + ' failed (' + get.status + '): ' + (await get.text()).slice(0, 300));
  const tempPath = path.join(os.tmpdir(), 'quickchat-r2-' + crypto.randomUUID());
  try {
    await pipeline(get.body, fs.createWriteStream(tempPath, { flags: 'wx' }));
    const stat = await fs.promises.stat(tempPath);
    const targetUrl = urlFor(dst, targetKey);
    const headers = signedHeaders(dst, 'PUT', targetUrl, await sha256File(tempPath));
    headers['content-length'] = String(stat.size);
    const put = await fetch(targetUrl, { method: 'PUT', headers, body: fs.createReadStream(tempPath), duplex: 'half' });
    if (!put.ok) throw new Error('PUT ' + targetKey + ' failed (' + put.status + '): ' + (await put.text()).slice(0, 300));
    console.log('MIGRATED', JSON.stringify({ key, targetKey, bytes: stat.size }));
    return stat.size;
  } finally {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
  }
}
(async () => {
  const src = cfg('RAILWAY_S3');
  const dst = cfg('R2');
  let token = null;
  let totalObjects = 0;
  let totalBytes = 0;
  do {
    const page = await listPage(src, token);
    console.log('SOURCE_PAGE', JSON.stringify({ objects: page.keys.length, truncated: page.truncated }));
    for (const key of page.keys) {
      const targetKey = key.startsWith('uploads/') || key.startsWith('backup/') ? key : 'uploads/' + key;
      totalBytes += await copy(src, dst, key, targetKey);
      totalObjects += 1;
    }
    token = page.nextToken;
  } while (token);
  console.log('R2_MIGRATION_COMPLETE', JSON.stringify({ totalObjects, totalBytes }));
})().catch((error) => {
  console.error('R2_MIGRATION_FAILED', error.stack || error);
  process.exit(1);
});
