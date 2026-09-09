/**
 * storage.ts
 * Helper functions for persisting session data using AsyncStorage.
 * Stores the JWT access token and basic user info locally on the device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'jwt_token';
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
  alarmTone: AlarmTone;
}

const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  vibrateEnabled: true,
  alarmTone: 'default',
};

export async function saveAlertSettings(settings: AlertSettings): Promise<void> {
  await AsyncStorage.setItem(ALERT_SETTINGS_KEY, JSON.stringify(settings));
}

export async function getAlertSettings(): Promise<AlertSettings> {
  const raw = await AsyncStorage.getItem(ALERT_SETTINGS_KEY);
  if (!raw) return DEFAULT_ALERT_SETTINGS;
  try {
    return { ...DEFAULT_ALERT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_ALERT_SETTINGS;
  }
}

// ── Clear ──────────────────────────────────────────────────────────────────

export async function clearSession(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(TOKEN_KEY),
    AsyncStorage.removeItem(USER_KEY),
  ]);
}
