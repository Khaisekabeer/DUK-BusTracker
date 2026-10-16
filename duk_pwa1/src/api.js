/**
 * api.js
 * Centralized backend API client.
 */

import { getToken, saveToken, clearToken, getRefreshToken, saveRefreshToken, clearRefreshToken } from './storage';

const BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const DEFAULT_TIMEOUT_MS = 30000;

let apiToken = getToken() || '';
// Guard to prevent concurrent refresh attempts (e.g. 3 requests fail simultaneously)
let _refreshPromise = null;

export function setApiToken(token) {
  apiToken = token || '';
  if (apiToken) saveToken(apiToken);
  else clearToken();
}

export function getApiToken() {
  return apiToken;
}

export function clearApiToken() {
  setApiToken('');
}

/**
 * Builds the WebSocket endpoint from the configured backend base URL.
 *
 * The access token is NOT placed in the query string (query strings leak into
 * access logs, proxies and browser history). The caller passes it to the
 * WebSocket constructor as a Sec-WebSocket-Protocol subprotocol instead —
 * see getWsBusProtocols().
 */
export function getWsBusUrl() {
  const base = BASE_URL || window.location.origin;
  const url = new URL('/api/v1/ws/bus', base);

  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

  return url.toString();
}

/**
 * Returns the Sec-WebSocket-Protocol value for the bus WebSocket handshake:
 * ["bearer", "<jwt>"]. Browsers can't set arbitrary WS headers, so the
 * subprotocol is the standard way to carry a credential out of the URL.
 * Returns null when there is no token (unauthenticated handshake).
 */
export function getWsBusProtocols() {
  const token = getApiToken();
  return token ? ['bearer', token] : null;
}

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${BASE_URL}${path}`;
}

/**
 * Public wrapper around the internal silent-refresh routine. Callers outside the
 * HTTP layer (e.g. the WebSocket reconnect path) use this to swap an expired
 * access token for a fresh one without forcing the user to log in again.
 * Resolves true if a valid token is now in storage, false otherwise.
 */
export async function refreshSession() {
  return _silentRefresh();
}

function dispatchApiEvent(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * Safe JSON/text response parser.
 */
async function parseResponse(res) {
  if (res.status === 204) return null;

  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return res.json().catch(() => null);
  }

  return res.text().catch(() => '');
}

/**
 * Shared fetch wrapper.
 * Handles:
 * - JWT auth header
 * - timeout
 * - server/offline/session-expired events
 * - JSON parsing
 */
export async function apiFetch(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    timeout = DEFAULT_TIMEOUT_MS,
    silent = false,
    _skipRefresh = false,   // internal flag — prevents infinite loop on /refresh calls
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const isFormData = body instanceof FormData;
  const requestHeaders = {
    ...(body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
    ...headers
  };

  try {
    const res = await fetch(buildUrl(path), {
      method,
      body,
      headers: requestHeaders,
      signal: controller.signal
    });

    const payload = await parseResponse(res);

    if (!res.ok) {
      if (res.status === 401 && !_skipRefresh) {
        // Access token expired — try silent refresh before giving up
        const refreshed = await _silentRefresh();
        if (refreshed) {
          // Retry original request with the new token
          return apiFetch(path, { ...options, _skipRefresh: true });
        } else {
          // Refresh also failed — force logout
          dispatchApiEvent('api:unauthorized');
        }
      } else if (res.status === 401) {
        // We already tried refreshing — force logout
        dispatchApiEvent('api:unauthorized');
      } else if (!silent && res.status >= 500) {
        dispatchApiEvent('api:server-error');
      }

      let detail = payload?.detail || payload?.message;
      if (!detail) {
        if (typeof payload === 'string') {
          // Prevent raw HTML from Cloudflare 502/522 pages from rendering in toasts
          detail = payload.trim().startsWith('<') 
            ? `Server error (${res.status}). Please try again later.` 
            : payload;
        } else {
          detail = `Request failed with status ${res.status}`;
        }
      }

      const error = new Error(detail);
      error.status = res.status;
      error.payload = payload;

      throw error;
    }

    return payload;
  } catch (error) {
    if (!silent && error.name !== 'AbortError') {
      dispatchApiEvent('api:offline', error);
    }

    if (error.name === 'AbortError') {
      const timeoutError = new Error('Request timed out. Please try again.');
      timeoutError.status = 408;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Silently exchanges the refresh token for a new access token.
 * Returns true if successful, false if refresh token is also expired/invalid.
 * Uses a shared promise to prevent multiple simultaneous refresh calls.
 */
async function _silentRefresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  // Deduplicate concurrent refresh attempts
  if (!_refreshPromise) {
    _refreshPromise = apiFetch('/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
      _skipRefresh: true,
      silent: true,
    }).then(data => {
      setApiToken(data.access_token);
      saveRefreshToken(data.refresh_token);  // Store rotated refresh token
      return true;
    }).catch((error) => {
      // Only clear tokens if the server explicitly rejected the refresh token (401/403/400).
      // If it's a network drop (no status) or server crash (5xx), keep the tokens!
      if (error && (error.status === 401 || error.status === 403 || error.status === 400)) {
        clearToken();
        clearRefreshToken();
      }
      return false;
    }).finally(() => {
      _refreshPromise = null;
    });
  }

  return _refreshPromise;
}

/* Auth */
export function register(name, email, boarding_stop_id) {
  return apiFetch('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, boarding_stop_id })
  });
}

export function verify(email, otp) {
  return apiFetch('/api/v1/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ email, otp })
  });
}

export function logoutApi() {
  const rToken = getRefreshToken();
  return apiFetch('/api/v1/auth/logout', {
    method: 'POST',
    body: rToken ? JSON.stringify({ refresh_token: rToken }) : undefined,
    _skipRefresh: true,  // If this 401s, we are already logged out
    silent: true,
  });
}

export function updatePreferences(prefs) {
  return apiFetch('/api/v1/auth/preferences', {
    method: 'PATCH',
    body: JSON.stringify(prefs)
  });
}

/* Tracking */
export function getStops() {
  return apiFetch('/api/v1/stops');
}

export function getLatestGps() {
  return apiFetch('/api/v1/latest', { silent: true });
}

export function getTripState() {
  return apiFetch('/api/v1/trip_state', { silent: true });
}

export function getRouteHistory(tripId = null) {
  const query = tripId ? `?trip_id=${encodeURIComponent(tripId)}` : '';
  return apiFetch(`/api/v1/route_history${query}`, { silent: true });
}

export function getEta(stopId) {
  return apiFetch(`/api/v1/eta?stop_id=${encodeURIComponent(stopId)}`, {
    silent: true
  });
}

export function getAllEtas() {
  return apiFetch('/api/v1/eta/all', { silent: true });
}

export function getRouteGeometry(tripId = null, direction = null) {
  const params = new URLSearchParams();
  if (tripId) params.set('trip_id', tripId);
  if (direction) params.set('direction', direction);
  params.set('t', Date.now());
  return apiFetch(`/api/v1/route_geometry?${params.toString()}`);
}

export function getRouteSegment(lat1, lon1, lat2, lon2) {
  const params = new URLSearchParams({
    lat1,
    lon1,
    lat2,
    lon2
  });

  return apiFetch(`/api/v1/route_segment?${params.toString()}`);
}



/* Suggestions */
export function submitSuggestion(suggestion, trip = '', location = '') {
  return apiFetch('/api/v1/suggestion', {
    method: 'POST',
    body: JSON.stringify({ suggestion, trip, location })
  });
}

/* Notifications */
export function getMyNotifications() {
  return apiFetch('/api/v1/notifications', { silent: true });
}

export function markNotificationRead(id) {
  return apiFetch(`/api/v1/notifications/${encodeURIComponent(id)}/read`, {
    method: 'PUT'
  });
}
