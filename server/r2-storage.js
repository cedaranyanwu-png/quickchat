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
  const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedNames, payloadHash].join('\n');
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
async function deleteObject(config, key) {
  const url = objectUrl(config, key);
  const response = await fetch(url, { method: 'DELETE', headers: signedHeaders(config, 'DELETE', url, emptyHash()) });
  if (!response.ok && response.status !== 404) throw new Error('R2 delete failed (' + response.status + ').');
}
async function listObjects(config, prefix = '') {
  const url = new URL(config.endpoint);
  url.pathname = '/' + encodeURIComponent(config.bucket);
  url.searchParams.set('list-type', '2');
  if (prefix) url.searchParams.set('prefix', prefix);
  const response = await fetch(url, { method: 'GET', headers: signedHeaders(config, 'GET', url, emptyHash()) });
  if (!response.ok) throw new Error('R2 list failed (' + response.status + '): ' + (await response.text()).slice(0, 300));
  const xml = await response.text();
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => ({ key: decodeXml(m[1]) }));
}
function decodeXml(value) { return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"); }
async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}
async function streamToBuffer(response) { return response.ok ? Buffer.from(await response.arrayBuffer()) : null; }
function streamToNode(response) { return response.body ? Readable.fromWeb(response.body) : null; }

module.exports = { configFromEnv, objectUrl, putFile, putBuffer, getObject, deleteObject, listObjects, streamToBuffer, streamToNode };
