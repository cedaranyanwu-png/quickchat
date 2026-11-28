const { JWT } = require('google-auth-library');
const axios = require('axios');
const cheerio = require('cheerio');

const SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters';
const API_BASE = 'https://searchconsole.googleapis.com/webmasters/v3';
const INSPECTION_API_BASE = 'https://searchconsole.googleapis.com/v1/urlInspection';

function getConfiguration() {
  const rawCredentials = String(process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON || '').trim();
  const configuredSiteUrl = String(process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || '').trim();
  // URL-prefix properties at the origin root are canonicalized by Google with
  // a trailing slash. Normalize once so every Search Console endpoint uses
  // the exact same property identifier.
  let siteUrl = configuredSiteUrl;
  try {
    const parsedSiteUrl = new URL(configuredSiteUrl);
    if (parsedSiteUrl.pathname === '/' && !parsedSiteUrl.search && !parsedSiteUrl.hash) {
      siteUrl = parsedSiteUrl.origin + '/';
    }
  } catch (_error) {
    // Keep the raw value so the existing configuration diagnostics can report it.
  }
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
  const googleError = error?.response?.data?.error || {};
  const status = Number(error?.googleHttpStatus || error?.response?.status || error?.code || 0);
  const googleMessage = String(error?.googleMessage || googleError.message || '').trim();
  const googleReason = String(error?.googleReason || googleError.errors?.[0]?.reason || googleError.status || '').trim();
  const detail = [googleReason, googleMessage].filter(Boolean).join(': ');

  if (status === 401) return detail || 'Google rejected the service-account credentials. Check the Railway service-account JSON variable and key validity.';
  if (status === 403) {
    return 'Google Search Console returned 403' + (detail ? ' (' + detail + ')' : '.') +
      ' Confirm that this service account has access to the exact property configured in GOOGLE_SEARCH_CONSOLE_SITE_URL, that every inspected URL belongs to that property, and that the Search Console API is enabled in the same Google Cloud project as the service-account key.';
  }
  if (status === 404) return detail || 'Google could not find this Search Console property or sitemap. Check the exact property identifier and sitemap URL.';
  if (status === 400) return detail || 'Google rejected the request. Check the Search Console property identifier and inspected URL.';
  if (status === 503) return error.message;
  return detail || error.message || 'Google Search Console request failed.';
}

async function requestGoogle(method, pathname, data = undefined, baseUrl = API_BASE) {
  const { credentials } = getConfiguration();
  const client = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [SEARCH_CONSOLE_SCOPE],
  });
  try {
    const response = await client.request({
      url: baseUrl + pathname,
      method,
      timeout: 20000,
      ...(data !== undefined ? { data } : {}),
    });
    return response.data || {};
  } catch (error) {
    const googleError = error?.response?.data?.error || {};
    const safe = new Error(getSafeGoogleError(error));
    safe.googleHttpStatus = Number(error?.response?.status || 0) || null;
    safe.googleMessage = String(googleError.message || '').trim();
    safe.googleReason = String(googleError.errors?.[0]?.reason || googleError.status || '').trim();
    safe.status = safe.googleHttpStatus >= 400 && safe.googleHttpStatus < 500 ? 400 : 502;
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

  const diagnostics = {
    credentials: 'valid',
    api: 'unknown',
    configuredProperty: config.siteUrl,
    propertyFound: false,
    permissionLevel: null,
  };

  try {
    // Ask Google for the exact property identifier first. Google defines
    // siteUrl as the Search Console property identifier, including the
    // trailing slash for URL-prefix properties.
    const property = await requestGoogle(
      'GET',
      '/sites/' + encodePath(config.siteUrl),
    );

    diagnostics.api = 'accessible';
    diagnostics.googleReturnedProperty = property.siteUrl || null;
    diagnostics.propertyFound = property.siteUrl === config.siteUrl;
    diagnostics.permissionLevel = property.permissionLevel || null;

    if (diagnostics.propertyFound) {
      return {
        configured: true,
        connected: true,
        propertyUrl: config.siteUrl,
        sitemapUrl: config.sitemapUrl,
        permissionLevel: diagnostics.permissionLevel,
        diagnostics,
        message: 'Google Search Console access is working for this exact property.',
      };
    }

    return {
      configured: true,
      connected: false,
      propertyUrl: config.siteUrl,
      sitemapUrl: config.sitemapUrl,
      permissionLevel: diagnostics.permissionLevel,
      diagnostics,
      message: 'Google returned a different property identifier than the one configured in QuickChat. Use the exact Search Console property URL, including the trailing slash.',
    };
  } catch (error) {
    // If the exact-property request fails, list the accessible properties.
    // This separates an account-wide authorization failure from a property
    // mismatch and gives the Admin UI actionable diagnostics.
    try {
      const data = await requestGoogle('GET', '/sites');
      diagnostics.api = 'accessible';
      const sites = Array.isArray(data.siteEntry) ? data.siteEntry : [];
      const property = sites.find((site) => site.siteUrl === config.siteUrl);
      const googleProperties = sites.map((site) => ({
        siteUrl: String(site.siteUrl || ''),
        permissionLevel: String(site.permissionLevel || 'unknown'),
      }));

      if (property) {
        diagnostics.propertyFound = true;
        diagnostics.permissionLevel = property.permissionLevel || null;
        return {
          configured: true,
          connected: true,
          propertyUrl: config.siteUrl,
          sitemapUrl: config.sitemapUrl,
          permissionLevel: diagnostics.permissionLevel,
          diagnostics,
          googleReturnedProperty: property.siteUrl || null,
          googleProperties,
          message: 'Google Search Console access is working for this exact property.',
        };
      }

      return {
        configured: true,
        connected: false,
        propertyUrl: config.siteUrl,
        sitemapUrl: config.sitemapUrl,
        permissionLevel: null,
        diagnostics,
        googleReturnedProperty: null,
        googleProperties,
        message: 'Google Search Console is accessible. The property list below shows the exact identifiers Google returns for this service account. Select the matching property and use its identifier in GOOGLE_SEARCH_CONSOLE_SITE_URL.',
      };
    } catch (listError) {
      return {
        configured: true,
        connected: false,
        propertyUrl: config.siteUrl,
        sitemapUrl: config.sitemapUrl,
        permissionLevel: null,
        diagnostics: {
          ...diagnostics,
          api: 'denied',
          googleError: getSafeGoogleError(listError),
        },
        message: getSafeGoogleError(listError),
      };
    }
  }
}
async function listSitemaps() {
  const { siteUrl } = getConfiguration();
  const data = await requestGoogle('GET', '/sites/' + encodePath(siteUrl) + '/sitemaps');
  return Array.isArray(data.sitemap) ? data.sitemap : [];
}

async function getSearchAnalytics(days = 28) {
  const { siteUrl } = getConfiguration();
  const safeDays = Math.max(1, Math.min(90, Number(days) || 28));
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - safeDays + 1);
  const iso = (date) => date.toISOString().slice(0, 10);

  const query = async (dimensions, rowLimit = 10) => requestGoogle(
    'POST',
    '/sites/' + encodePath(siteUrl) + '/searchAnalytics/query',
    { startDate: iso(start), endDate: iso(end), dimensions, rowLimit, dataState: 'final' },
  );

  const [totals, pages, queries, countries, devices] = await Promise.all([
    query([], 1),
    query(['page'], 50),
    query(['query'], 50),
    query(['country'], 50),
    query(['device'], 10),
  ]);
  const totalRow = Array.isArray(totals.rows) ? totals.rows[0] : null;
  const mapRows = (rows, keyName) => (Array.isArray(rows) ? rows : []).map((row) => ({
    [keyName]: row.keys?.[0] || '',
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    ctr: Number(row.ctr || 0),
    position: Number(row.position || 0),
  }));
  return {
    startDate: iso(start),
    endDate: iso(end),
    totals: {
      clicks: Number(totalRow?.clicks || 0),
      impressions: Number(totalRow?.impressions || 0),
      ctr: Number(totalRow?.ctr || 0),
      position: Number(totalRow?.position || 0),
    },
    pages: mapRows(pages.rows, 'page'),
    queries: mapRows(queries.rows, 'query'),
    countries: mapRows(countries.rows, 'country'),
    devices: mapRows(devices.rows, 'device'),
  };
}

async function fetchSitemapUrls(sitemapUrl, maxUrls = 25) {
  const urls = [];
  const seenSitemaps = new Set();
  const queue = [sitemapUrl];

  while (queue.length && urls.length < maxUrls) {
    const current = queue.shift();
    if (!current || seenSitemaps.has(current)) continue;
    seenSitemaps.add(current);
    const response = await axios.get(current, { timeout: 15000, responseType: 'text' });
    const $ = cheerio.load(response.data, { xmlMode: true });
    const children = $('sitemapindex > sitemap > loc').map((_, el) => $(el).text().trim()).get();
    if (children.length) {
      queue.push(...children.slice(0, 10));
      continue;
    }
    $('urlset > url > loc').each((_, el) => {
      const url = $(el).text().trim();
      if (url && !urls.includes(url) && urls.length < maxUrls) urls.push(url);
    });
  }
  return urls;
}

async function inspectUrls(limit = 25) {
  const { siteUrl, sitemapUrl } = getConfiguration();
  const safeLimit = Math.max(1, Math.min(250, Number(limit) || 25));
  const urls = await fetchSitemapUrls(sitemapUrl, safeLimit);
  const results = [];
  const concurrency = 5;

  async function inspectOne(inspectionUrl) {
    try {
      const data = await requestGoogle(
        'POST',
        '/index:inspect',
        { inspectionUrl, siteUrl },
        INSPECTION_API_BASE,
      );
      const result = data.inspectionResult || {};
      const status = result.indexStatusResult || {};
      return {
        url: inspectionUrl,
        indexed: status.verdict === 'PASS',
        verdict: status.verdict || 'UNKNOWN',
        coverageState: status.coverageState || 'Not reported',
        indexingState: status.indexingState || 'Not reported',
        lastCrawlTime: status.lastCrawlTime || null,
        googleCanonical: status.googleCanonical || '',
        userCanonical: status.userCanonical || '',
      };
    } catch (error) {
      return {
        url: inspectionUrl,
        indexed: false,
        verdict: 'ERROR',
        coverageState: getSafeGoogleError(error),
        indexingState: 'Not inspected',
        lastCrawlTime: null,
        googleCanonical: '',
        userCanonical: '',
      };
    }
  }

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    results.push(...await Promise.all(batch.map(inspectOne)));
  }

  const counts = results.reduce((acc, item) => {
    if (item.indexed) acc.indexed += 1;
    else if (item.verdict === 'ERROR') acc.errors += 1;
    else acc.notIndexed += 1;
    const key = item.coverageState || 'Not reported';
    acc.coverage[key] = (acc.coverage[key] || 0) + 1;
    return acc;
  }, { indexed: 0, notIndexed: 0, errors: 0, coverage: {} });

  return {
    checked: results.length,
    indexed: counts.indexed,
    notIndexed: counts.notIndexed,
    errors: counts.errors,
    coverage: counts.coverage,
    urls: results,
  };
}

async function getIndexingOverview() {
  const sitemaps = await listSitemaps();
  const totals = sitemaps.reduce((acc, sitemap) => {
    const contents = Array.isArray(sitemap.contents) ? sitemap.contents : [];
    for (const content of contents) {
      acc.submitted += Number(content.submitted || 0);
      acc.indexed += Number(content.indexed || 0);
    }
    return acc;
  }, { submitted: 0, indexed: 0 });
  return { sitemaps, totals };
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

module.exports = { getStatus, listSitemaps, submitSitemap, getSearchAnalytics, inspectUrls, getIndexingOverview };
