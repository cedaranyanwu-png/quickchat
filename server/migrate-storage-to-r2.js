const crypto = require('crypto');

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
  let k = hmac('AWS4' + secret, date); k = hmac(k, region); k = hmac(k, 's3'); return hmac(k, 'aws4_request');
}
function urlFor(c, key) {
  const u = new URL(c.endpoint);
  u.pathname = '/' + encodeURIComponent(c.bucket) + '/' + String(key).split('/').map(encodeURIComponent).join('/');
  u.search = ''; return u;
}
function headers(c, method, u, payloadHash) {
  const amz = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''), date = amz.slice(0,8);
  const h = { host:u.host, 'x-amz-content-sha256':payloadHash, 'x-amz-date':amz };
  const names = Object.keys(h).sort(), canonical = names.map(n=>n+':'+h[n].trim()+'\n').join(''), signed=names.join(';');
  const canonicalRequest=[method,u.pathname,'',canonical,signed,payloadHash].join('\n');
  const scope=date+'/'+c.region+'/s3/aws4_request';
  const sts=['AWS4-HMAC-SHA256',amz,scope,crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\\n');
  const sig=crypto.createHmac('sha256',signingKey(c.secretKey,date,c.region)).update(sts).digest('hex');
  return {...h,Authorization:'AWS4-HMAC-SHA256 Credential='+c.accessKey+'/'+scope+', SignedHeaders='+signed+', Signature='+sig};
}
function emptyHash(){return crypto.createHash('sha256').update('').digest('hex');}
async function list(c,prefix=''){
  const u=new URL(c.endpoint); u.pathname='/'+encodeURIComponent(c.bucket); u.searchParams.set('list-type','2'); if(prefix)u.searchParams.set('prefix',prefix);
  const r=await fetch(u,{headers:headers(c,'GET',u,emptyHash())}); if(!r.ok)throw new Error('List failed '+r.status+' '+await r.text());
  const x=await r.text(); return [...x.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m=>m[1].replace(/&amp;/g,'&'));
}
async function copy(src,dst,key,targetKey){
  const get=await fetch(urlFor(src,key),{headers:headers(src,'GET',urlFor(src,key),emptyHash())});
  if(!get.ok)throw new Error('GET '+key+' failed '+get.status);
  const data=Buffer.from(await get.arrayBuffer()), u=urlFor(dst,targetKey || key), h=crypto.createHash('sha256').update(data).digest('hex'), hs=headers(dst,'PUT',u,h);
  hs['content-length']=String(data.length);
  const put=await fetch(u,{method:'PUT',headers:hs,body:data}); if(!put.ok)throw new Error('PUT '+key+' failed '+put.status+' '+await put.text());
  console.log('migrated',key,data.length,'bytes');
}
(async()=>{
  const src=cfg('RAILWAY_S3'), dst=cfg('R2');
  const keys=await list(src);
  console.log('Found',keys.length,'objects in Railway storage.');
  for(const key of keys){
    let target=key;
    if(!target.startsWith('uploads/') && !target.startsWith('backup/')) target='uploads/'+target;
    await copy(src,dst,key,target);
  }
  console.log('Migration complete.');
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
