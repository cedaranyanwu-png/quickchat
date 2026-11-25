const { JWT } = require('google-auth-library');

const SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters';
const API_BASE = 'https://searchconsole.googleapis.com/webmasters/v3';

function getConfiguration() {
  const rawCredentials = String(process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON || '').trim();
  const siteUrl = String(process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || '').trim();
  const publicAppUrl = String(process.env.PUBLIC_APP_URL || '').trim().replace(/[/]$/, '');

  if (!rawCredentials) {
    const error = new Error('Google Search Console service account credentials are not configured.');
    error.status = 503;
    throw error;
  }
  if (!siteUrl) {
    const error = new Error('GOOGLE_SEARCH_CONSOLE_SITE_URL is not configured.');
    error.status = 503;
    throw error;
  }
  if (!publicAppUrl) {
    const error = new Error('PUBLIC_APP_URL must be configured before submitting a sitemap.');
    error.status = 503;
    throw error;
  }

  let credentials;
  try {
    credentials = JSON.parse(rawCredentials);
  } catch (_error) {
    const error = new Error('Google Search Console service account JSON is not valid JSON.');
    error.status = 503;
    throw error;
  }

  if (credentials.type !== 'service_account' || !credentials.client_email || !credentials.private_key) {
    const error = new Error('The configured Google credential is not a complete service account key.');
    error.status = 503;
    throw error;
  }

  return {
    credentials,
    siteUrl,
    sitemapUrl: publicAppUrl + '/sitemap.xml',
  };
}

function getSafeGoogleError(error) {
  const status = Number(error?.response?.status || error?.code || 0);
  const googleMessage = String(error?.response?.data?.error?.message || '').trim();
  if (status === 401) return 'Google rejected the service-account credentials. Create a new key and check the Railway variable.';
  if (status === 403) return 'Google denied access. Confirm that the service-account email is an owner of this exact Search Console property and that the Search Console API is enabled.';
  if (status === 404) return 'Google could not find this Search Console property or sitemap. Check the exact property URL and sitemap URL.';
  if (status === 400) return googleMessage || 'Google rejected the request. Check the Search Console property and sitemap URL.';
  if (status === 503) return error.message;
  return googleMessage || error.message || 'Google Search Console request failed.';
}

async function requestGoogle(method, pathname) {
  const { credentials } = getConfiguration();
  const client = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [SEARCH_CONSOLE_SCOPE],
  });
  try {
    const response = await client.request({
      url: API_BASE + pathname,
      method,
      timeout: 20000,
    });
    return response.data || {};
  } catch (error) {
    const safe = new Error(getSafeGoogleError(error));
    safe.status = Number(error?.response?.status) >= 400 && Number(error?.response?.status) < 500 ? 400 : 502;
    throw safe;
  }
}

function encodePath(value) {
  return encodeURIComponent(value).replace(/%2F/gi, '%2F');
}

async function getStatus() {
  let config;
  try {
    config = getConfiguration();
  } catch (error) {
    return {
      configured: false,
      connected: false,
      propertyUrl: String(process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || '').trim(),
      sitemapUrl: '',
      message: error.message,
    };
  }

  try {
    const data = await requestGoogle('GET', '/sites');
    const sites = Array.isArray(data.siteEntry) ? data.siteEntry : [];
    const property = sites.find((site) => String(site.siteUrl || '').replace(/[/]$/, '') === config.siteUrl.replace(/[/]$/, '') || site.siteUrl === config.siteUrl);
    return {
      configured: true,
      connected: Boolean(property),
      propertyUrl: config.siteUrl,
      sitemapUrl: config.sitemapUrl,
      permissionLevel: property?.permissionLevel || null,
      message: property
        ? 'Google Search Console access is working for this property.'
        : 'Credentials work, but this service account cannot access the configured property. Add its email as an owner of the exact property.',
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      propertyUrl: config.siteUrl,
      sitemapUrl: config.sitemapUrl,
      message: getSafeGoogleError(error),
    };
  }
}

async function listSitemaps() {
  const { siteUrl } = getConfiguration();
  const data = await requestGoogle('GET', '/sites/' + encodePath(siteUrl) + '/sitemaps');
  return Array.isArray(data.sitemap) ? data.sitemap : [];
}

async function submitSitemap() {
  const { siteUrl, sitemapUrl } = getConfiguration();
  const parsedSitemap = new URL(sitemapUrl);
  if (!['http:', 'https:'].includes(parsedSitemap.protocol)) {
    const error = new Error('PUBLIC_APP_URL must use HTTP or HTTPS.');
    error.status = 400;
    throw error;
  }

  const encodedSite = encodePath(siteUrl);
  const encodedSitemap = encodePath(sitemapUrl);
  await requestGoogle('PUT', '/sites/' + encodedSite + '/sitemaps/' + encodedSitemap);
  return {
    submitted: true,
    propertyUrl: siteUrl,
    sitemapUrl,
    message: 'Sitemap submission request sent to Google Search Console. Google will decide when to crawl and index its URLs.',
  };
}

module.exports = { getStatus, listSitemaps, submitSitemap };
