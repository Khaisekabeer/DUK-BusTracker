/**
 * api.ts — DUK Bus Tracker mobile API client.
 * All requests go through Nginx on the production server,
 * which proxies /api/* to the mega_gateway backend (port 8000).
 *
 * For local development with an Android emulator, use:
 *   http://10.0.2.2       (emulator → laptop localhost, nginx on port 80)
 * For a physical device on the same WiFi, use your laptop's local IP:
 *   http://192.168.x.x
 * For the production server:
 *   http://103.156.188.62
 */

 
import axios from 'axios';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearSession, getRefreshToken, saveToken, saveRefreshToken } from './storage';
import { resetToLogin } from './navigation';

import
{API_BASE_URL } from '@env';

const BASE_URL = API_BASE_URL || 'https://103.156.188.62';
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ── JWT Interceptor — auto-attaches token to every request ─────────────────
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('jwt_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// ── Response Interceptor — handles 401 Unauthorized ────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise(function(resolve, reject) {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = 'Bearer ' + token;
          return api(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        isRefreshing = false;
        await clearSession();
        resetToLogin();
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${BASE_URL}/api/v1/auth/refresh`, { refresh_token: refreshToken });
        await saveToken(data.access_token);
        if (data.refresh_token) {
          await saveRefreshToken(data.refresh_token);
        }
        api.defaults.headers.common['Authorization'] = 'Bearer ' + data.access_token;
        originalRequest.headers.Authorization = 'Bearer ' + data.access_token;
        processQueue(null, data.access_token);
        return api(originalRequest);
      } catch (err) {
        processQueue(err, null);
        await clearSession();
        resetToLogin();
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ── Auth ───────────────────────────────────────────────────────────────────
export const authApi = {
  /**
   * Step 1 — Submit name + @duk.ac.in email → backend sends OTP email.
   * Backend also accepts an optional boarding_stop_id to pre-populate profile.
   */
  register: (name: string, email: string, boarding_stop_id?: number | null) =>
    api.post('/api/v1/auth/register', { name, email, boarding_stop_id }),

  googleLogin: (credential: string) =>
    api.post('/api/v1/auth/google', { credential }),

  /**
   * Step 2 — Submit OTP code → returns JWT + user object on success.
   * Response: { access_token, token_type, user: { id, name, email, boarding_stop_id } }
   */
  verify: (email: string, otp: string) =>
    api.post('/api/v1/auth/verify', { email, otp }),

  /**
   * Logs out the user from the backend by invalidating the token.
   * Sends the refresh_token in the body so the server can revoke it.
   */
  logout: async () => {
    const { getRefreshToken } = await import('./storage');
    const refreshToken = await getRefreshToken();
    return api.post('/api/v1/auth/logout', refreshToken ? { refresh_token: refreshToken } : undefined);
  },

  /**
   * Update user preferences (requires JWT).
   * Accepts any combination of profile + notification fields.
   */
  updatePreferences: (prefs: {
    boarding_stop_id?: number | null;
    destination_stop_id?: number | null;
    proximity_alert_enabled?: boolean;
    proximity_alert_type?: string;
    proximity_alert_value?: number;
    proximity_alert_for?: string;
    notifications_on?: boolean;
    boarding_alert_stop_id?: number | null;
    destination_alert_stop_id?: number | null;
    notify_trip_started?: boolean;
    notify_delays?: boolean;
    notify_admin_broadcasts?: boolean;
  }) => api.patch('/api/v1/auth/preferences', prefs),

  updateDeviceToken: (deviceToken: string, notificationsOn: boolean = true) =>
    api.put('/api/v1/auth/device-token', { device_token: deviceToken, notifications_on: notificationsOn }),

  getMyNotifications: () => 
    api.get('/api/v1/notifications'),
};

// ── Tracking ───────────────────────────────────────────────────────────────
export const trackingApi = {
  /**
   * All bus stops from the database (for profile setup dropdown).
   */
  getStops: () => api.get('/api/v1/stops'),

  /**
   * Latest GPS ping — lat, lon, speed, is_live flag.
   */
  getLatest: () => api.get('/api/v1/latest'),

  /**
   * Current trip state — Morning/Evening trip, idle, or offline.
   * Response: { trip, status, next_trip_time? }
   */
  getTripState: () => api.get('/api/v1/trip_state'),

  getRouteHistory: (tripId?: number | null) => 
    api.get(`/api/v1/route_history${tripId ? `?trip_id=${tripId}` : ''}`),

  /**
   * ML-predicted ETA to a specific bus stop.
   * Response: { stop_id, stop_name, eta_minutes, confidence, status }
   */
  getEta: (stop_id: number) => api.get('/api/v1/eta', { params: { stop_id } }),

  /**
   * All ML-predicted ETAs
   */
  getAllEtas: () => api.get('/api/v1/eta/all'),

  /**
   * GPS breadcrumb trail for a specific date (YYYY-MM-DD).
   * Used to draw the blue "where the bus has been" line on the map.
   * Response: Array of { lat, lon, speed_kmh, recorded_at }
   */
  getHistoryForDate: (dateStr: string) => api.get(`/api/v1/history/${dateStr}`),

  /**
   * Complete historical snapped route trace for a specific trip ID.
   * Response: Array of [lon, lat] coordinates.
   */
  getTripTrace: (tripId: number) => api.get(`/api/v1/trip_trace/${tripId}`),

  /**
   * Get the road geometry between two GPS coordinates
   */
  getRouteSegment: (lat1: number, lon1: number, lat2: number, lon2: number) =>
    api.get(`/api/v1/route_segment?lat1=${lat1}&lon1=${lon1}&lat2=${lat2}&lon2=${lon2}`),

  getRouteGeometry: (tripId?: number | null, direction?: string | null) => {
    const params = new URLSearchParams();
    if (tripId) params.append('trip_id', tripId.toString());
    if (direction) params.append('direction', direction);
    params.append('t', Date.now().toString());
    return api.get(`/api/v1/route_geometry?${params.toString()}`);
  },

  /**
   * Snap arbitrary GPS points to road coordinates via OSRM.
   */
  snapRoute: (points: any[]) => api.post('/api/v1/snap_route', { points }),

  /**
   * Current trip's snapped GPS trail — the blue "where the bus has been" line.
   * Response: { coordinates: [[lon, lat], ...], trip_status, started_at, ended_at }
   */
  getCurrentTrace: () => api.get('/api/v1/current_trace'),

  /**
   * Builds the WebSocket endpoint from the configured backend base URL.
   */
  getWsUrl: async () => {
    const token = await AsyncStorage.getItem('jwt_token');
    const wsBase = BASE_URL.replace(/^http/, 'ws');
    return `${wsBase}/api/v1/ws/bus${token ? `?token=${token}` : ''}`;
  },
};


// ── Suggestions ────────────────────────────────────────────────────────────
export const suggestionApi = {
  /**
   * Submit a text suggestion — works without auth (user_id attached if logged in).
   * @param suggestion  The suggestion text (max 500 chars).
   * @param trip        Optional trip label (e.g. "Morning Trip").
   * @param location    Optional location string.
   */
  submit: (suggestion: string, trip = '', location = '') =>
    api.post('/api/v1/suggestion', { suggestion, trip, location }),
};

export default api;
