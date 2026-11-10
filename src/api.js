// Override this in the React environment when the API is hosted elsewhere.
// Keep API calls same-origin when Express serves the React build and API together.
const configuredApiUrl = (process.env.REACT_APP_API_URL || '').trim().replace(/\/+$/, '');
export const API_BASE_URL = configuredApiUrl || '/api';

// Which environment this build targets. `server/.env` keeps the matching
// APP_ENV so the API knows whether it is serving localhost or the live domain.
export const APP_ENV = (process.env.REACT_APP_ENV || 'local').trim().toLowerCase();
export const SITE_URL = (process.env.REACT_APP_SITE_URL || '').trim().replace(/\/+$/, '');

// Public runtime configuration (Google client ID, push key, features). The API
// is the source of truth so one build works on localhost and on the live domain.
let runtimeConfigPromise = null;
export function loadRuntimeConfig() {
  if (!runtimeConfigPromise) {
    runtimeConfigPromise = fetch(`${API_BASE_URL}/config`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  }
  return runtimeConfigPromise;
}

// Absolute URL for share links and notification targets.
export function absoluteAppUrl(path = '/') {
  const base = SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

// Shared authenticated request helper: page components only describe the resource
// they need, while this module consistently adds the current session token and
// turns API errors into messages that can be shown in the UI.
export async function apiRequest(path, options = {}) {
  const { headers: suppliedHeaders = {}, body, ...requestOptions } = options;
  const headers = { ...suppliedHeaders };
  const token = localStorage.getItem('token');
  if (token) headers.Authorization = `Bearer ${token}`;

  const isRawBody = typeof Blob !== 'undefined' && body instanceof Blob;
  const isFormBody = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isRawBody && !isFormBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
      ...requestOptions,
      headers,
      ...(body === undefined ? {} : { body: isRawBody || isFormBody ? body : JSON.stringify(body) }),
    });
  } catch (networkError) {
    if (networkError?.name === 'AbortError') throw networkError;
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('quickchat:network-error'));
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('You are offline. Check your internet connection and QuickChat will reconnect automatically.');
    }
    throw new Error('QuickChat could not reach the server. Check your connection and try again.');
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('quickchat:network-restored'));
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    if ((response.status === 401 || data?.code === 'EMAIL_NOT_VERIFIED') && token) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('quickchat:session-expired'));
    }
    const requestError = new Error(data?.message || `Request failed (${response.status}).`);
    requestError.code = data?.code;
    requestError.email = data?.email;
    throw requestError;
  }
  return data;
}

// Independent administration requests use a dedicated token and never read the
// ordinary QuickChat user's token.
export async function adminRequest(path, options = {}) {
  const { headers: suppliedHeaders = {}, body, ...requestOptions } = options;
  const headers = { ...suppliedHeaders };
  const token = localStorage.getItem('adminToken');
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
      ...requestOptions,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (networkError) {
    if (networkError?.name === 'AbortError') throw networkError;
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('quickchat:network-error'));
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('You are offline. Check your internet connection and QuickChat will reconnect automatically.');
    }
    throw new Error('QuickChat could not reach the server. Check your connection and try again.');
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('quickchat:network-restored'));
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) localStorage.removeItem('adminToken');
    throw new Error(data?.message || `Request failed (${response.status}).`);
  }
  return data;
}

// Uploads use the server's raw-file endpoint; the returned URL is saved in the
// profile or post record so every device can render the same user-uploaded file.
export function uploadMedia(file) {
  return apiRequest('/media', {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  });
}


// Resolve media/profile URLs returned by the API. Relative upload paths must stay
// on the API origin when the React app and API are hosted on different origins.
export function resolveMediaUrl(value) {
  if (!value || typeof value !== 'string') return '';
  const url = value.trim();
  if (!url) return '';
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (url.startsWith('//')) return `${typeof window !== 'undefined' ? window.location.protocol : 'https:'}${url}`;
  const apiOrigin = API_BASE_URL.startsWith('http') ? API_BASE_URL.replace(/\/api\/?$/, '') : '';
  if (url.startsWith('/')) return apiOrigin ? `${apiOrigin}${url}` : url;
  return apiOrigin ? `${apiOrigin}/${url}` : `/${url}`;
}

// Convert browser-specific fetch failures into concise, app-native messages.
export function normalizeNetworkError(error) {
  if (error?.name === 'AbortError') return error.message || 'Request cancelled.';
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'You are offline. Check your internet connection and QuickChat will reconnect automatically.';
  }
  if (error instanceof TypeError || /failed to fetch|networkerror|load failed|connection/i.test(error?.message || '')) {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('quickchat:network-error'));
    return 'QuickChat could not reach the server. Check your connection and try again.';
  }
  return error?.message || 'QuickChat could not complete that request. Try again.';
}
