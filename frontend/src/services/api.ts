import axios from 'axios';

const BASE_URL = 'http://10.0.2.2:5000'; // Android emulator → localhost; change for device

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  /**
   * Register a new user — backend sends OTP to the provided email.
   */
  register: (name: string, email: string, boardingPointId: number) =>
    api.post('/auth/register', { name, email, boarding_point_id: boardingPointId }),

  /**
   * Verify the OTP that was emailed to the user.
   */
  verifyOtp: (email: string, otp: string) =>
    api.post('/auth/verify-otp', { email, otp }),
};

// ── Tracking ──────────────────────────────────────────────────────────────────
export const trackingApi = {
  /**
   * Fetch all bus boarding stops from the backend.
   */
  getStops: () => api.get('/tracking/stops'),

  /**
   * Get the current live location of the bus.
   */
  getBusLocation: () => api.get('/tracking/live'),
};

export default api;
