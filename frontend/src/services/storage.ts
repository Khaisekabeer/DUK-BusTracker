/**
 * storage.ts
 * Helper functions for persisting session data using AsyncStorage.
 * Stores the JWT access token and basic user info locally on the device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'jwt_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY  = 'user_data';

export interface StoredUser {
  id:              string;
  name:            string;
  email:           string;
  boarding_stop_id: number | null;
}

// ── Token ──────────────────────────────────────────────────────────────────

export async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function saveRefreshToken(token: string): Promise<void> {
  await AsyncStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
}

// ── User ───────────────────────────────────────────────────────────────────

export async function saveUser(user: StoredUser): Promise<void> {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function getUser(): Promise<StoredUser | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

// ── Alert Settings ─────────────────────────────────────────────────────────

const ALERT_SETTINGS_KEY = 'alert_settings';

export type AlarmTone = 'default' | 'gentle' | 'urgent' | 'silent';

export interface AlertSettings {
  vibrateEnabled: boolean;
  soundEnabled: boolean;
  alarmTone: AlarmTone;
  masterAlertsEnabled: boolean;
}

const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  vibrateEnabled: true,
  soundEnabled: true,
  alarmTone: 'default',
  masterAlertsEnabled: false,
};

export async function saveAlertSettings(settings: AlertSettings): Promise<void> {
  await AsyncStorage.setItem(ALERT_SETTINGS_KEY, JSON.stringify(settings));
}

export async function getAlertSettings(): Promise<AlertSettings> {
  const raw = await AsyncStorage.getItem(ALERT_SETTINGS_KEY);
  if (!raw) return DEFAULT_ALERT_SETTINGS;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.alarmTone) {
      parsed.alarmTone = parsed.soundEnabled === false ? 'silent' : 'default';
    }
    if (typeof parsed.soundEnabled === 'undefined') {
      parsed.soundEnabled = parsed.alarmTone !== 'silent';
    }
    return { ...DEFAULT_ALERT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_ALERT_SETTINGS;
  }
}

// ── Alert Stash ────────────────────────────────────────────────────────────
// When the master "Enable all Notifications" toggle is turned off, we stash
// the current pickup/drop-off stop IDs so they can be restored when the
// toggle is turned back on — mirrors PWA saveAlertStash/getAlertStash.

const ALERT_STASH_KEY = 'alert_stash';

export interface AlertStash {
  boarding: number | null;
  destination: number | null;
}

export async function saveAlertStash(stash: AlertStash): Promise<void> {
  await AsyncStorage.setItem(ALERT_STASH_KEY, JSON.stringify(stash));
}

export async function getAlertStash(): Promise<AlertStash> {
  const raw = await AsyncStorage.getItem(ALERT_STASH_KEY);
  if (!raw) return { boarding: null, destination: null };
  try {
    const s = JSON.parse(raw);
    return { boarding: s.boarding ?? null, destination: s.destination ?? null };
  } catch {
    return { boarding: null, destination: null };
  }
}

// ── Clear ──────────────────────────────────────────────────────────────────

export async function clearSession(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(TOKEN_KEY),
    AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
    AsyncStorage.removeItem(USER_KEY),
  ]);
}
