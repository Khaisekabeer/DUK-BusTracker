import axios from 'axios';
import { getToken } from './storage';

const BASE_URL = 'http://10.37.12.17:5004'; // Physical device Wi-Fi IP

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor to attach JWT token
api.interceptors.request.use(
  async (config) => {
    const token = await getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  /**
   * Register a new user — backend sends OTP to the provided email.
   */
  register: (name: string, email: string, boardingStopId: number) =>
    api.post('/auth/register', { name, email, boarding_stop_id: boardingStopId }),

  /**
   * Verify the OTP that was emailed to the user.
   */
  verifyOtp: (email: string, otp: string) =>
    api.post('/auth/verify', { email, otp }),

  updateDeviceToken: (deviceToken: string, notificationsOn: boolean = true) =>
    api.put('/auth/device-token', { device_token: deviceToken, notifications_on: notificationsOn }),

  updatePreferences: (prefs: any) =>
    api.patch('/auth/preferences', prefs),
};

// ── Tracking ──────────────────────────────────────────────────────────────────
export const trackingApi = {
  /**
   * Fetch all bus boarding stops from the backend.
   */
  getStops: () => api.get('/api/v1/stops'),

  /**
   * Get the current live location of the bus.
   */
  getLatest: () => api.get('/api/v1/latest'),

  getTripState: () => api.get('/api/v1/trip_state'),

  getRouteHistory: () => api.get('/api/v1/route_history'),

  getEta: (stopId: number) => api.get(`/api/v1/eta?stop_id=${stopId}`),

  getHistoryForDate: (dateStr: string) => api.get(`/api/v1/history/${dateStr}`),
  
  submitSuggestion: (suggestion: string, trip: string = '', location: string = '') => 
    api.post('/api/v1/suggestion', { suggestion, trip, location }),
};

export default api;
