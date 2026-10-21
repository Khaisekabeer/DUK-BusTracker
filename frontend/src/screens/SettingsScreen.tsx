/**
 * SettingsScreen.tsx — DUK Bus Tracker Android
 * Exact mirror of Settings.jsx from duk_pwa1 (Liquid Glass UI):
 *  - TopBar with back arrow and centered "Settings" title
 *  - Profile section card (Name, Email, Boarding Stop, Destination Stop)
 *  - Notifications section:
 *      - Enable all Notifications (master toggle card)
 *      - When enabled (sub-card):
 *          - Pickup Notification (toggle + change link)
 *          - Drop-off Notification (toggle + change link)
 *          - Trip Started (toggle + description)
 *          - Delay Notification (toggle + description)
 *          - General Announcements (toggle + description)
 *          - Vibrate on Notification (toggle)
 *          - Sound on Notification (toggle)
 *  - Version text & Log Out button
 *  - Floating StopSelectModal matching duk_pwa1
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  Switch,
  Modal,
  FlatList,
  ActivityIndicator,
  ToastAndroid,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import Sound from 'react-native-sound';
import Colors from '../theme/colors';
import {
  getUser,
  saveUser,
  clearSession,
  getToken,
  getAlertSettings,
  saveAlertSettings,
  saveAlertStash,
  getAlertStash,
} from '../services/storage';
import type { AlarmTone } from '../services/storage';
import { authApi, trackingApi } from '../services/api';
import { registerForPushNotificationsAsync } from '../services/firebaseService';
import TopBar from '../components/TopBar';

// Helper for Android Toast / alert feedback
const showToast = (message: string) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert('', message);
  }
};

// ── Stop Select Modal (matches duk_pwa1 StopSelectModal) ─────────────────────
function StopSelectModal({
  visible,
  title,
  stops,
  selectedStopId,
  onSelect,
  onClose,
  showNone = false,
  noneLabel = 'Not Set',
}: {
  visible: boolean;
  title: string;
  stops: any[];
  selectedStopId: number | null;
  onSelect: (stop: any | null) => void;
  onClose: () => void;
  showNone?: boolean;
  noneLabel?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={M.overlay}>
        <TouchableOpacity style={M.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={M.card}>
          <View style={M.header}>
            <Text style={M.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={M.closeBtn} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={Colors.black} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={showNone ? [{ id: null, name: noneLabel }, ...stops] : stops}
            keyExtractor={item => String(item.id)}
            showsVerticalScrollIndicator={true}
            contentContainerStyle={{ paddingBottom: 8 }}
            renderItem={({ item }) => {
              const isSelected = item.id === selectedStopId || (!item.id && !selectedStopId);
              return (
                <TouchableOpacity
                  style={[M.stopItem, isSelected && M.stopItemActive]}
                  onPress={() => onSelect(item.id === null ? null : item)}
                  activeOpacity={0.7}
                >
                  <Text style={[M.stopItemText, isSelected && M.stopItemTextActive]}>
                    {item.name}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark" size={18} color={Colors.mintDark} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

// ── Alarm Tone Options & Modal ──────────────────────────────────────────────
const ALARM_TONE_OPTIONS: { value: AlarmTone; label: string; icon: any; description: string }[] = [
  { value: 'default', label: 'Default', icon: 'notifications-outline', description: 'System default notification sound' },
  { value: 'gentle', label: 'Gentle', icon: 'musical-note-outline', description: 'Soft, subtle notification tone' },
  { value: 'urgent', label: 'Urgent', icon: 'volume-high-outline', description: 'Louder, attention-grabbing tone' },
  { value: 'silent', label: 'Silent', icon: 'volume-mute-outline', description: 'No sound, vibration only' },
];

function AlarmToneModal({
  visible,
  selectedTone,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedTone: AlarmTone;
  onSelect: (tone: AlarmTone) => void;
  onClose: () => void;
}) {
  const handleSelectWithPreview = (tone: AlarmTone) => {
    if (tone === 'gentle' || tone === 'urgent') {
      try {
        const s = new Sound(`${tone}_tone.mp3`, Sound.MAIN_BUNDLE, (error) => {
          if (!error) {
            s.play(() => s.release());
          }
        });
      } catch {
        // audio playback non-blocking
      }
    }
    onSelect(tone);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={M.overlay}>
        <TouchableOpacity style={M.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={M.card}>
          <View style={M.header}>
            <Text style={M.title}>Select Notification Sound</Text>
            <TouchableOpacity onPress={onClose} style={M.closeBtn} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={Colors.black} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={ALARM_TONE_OPTIONS}
            keyExtractor={item => item.value}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 8 }}
            renderItem={({ item }) => {
              const isSelected = item.value === selectedTone;
              return (
                <TouchableOpacity
                  style={[M.stopItem, isSelected && M.stopItemActive]}
                  onPress={() => handleSelectWithPreview(item.value)}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
                    <View style={[AT.toneIconWrap, isSelected && AT.toneIconWrapActive]}>
                      <Ionicons
                        name={item.icon}
                        size={20}
                        color={isSelected ? Colors.mintDark : Colors.medGray}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[M.stopItemText, isSelected && M.stopItemTextActive]}>
                        {item.label}
                      </Text>
                      <Text style={AT.toneDesc}>{item.description}</Text>
                    </View>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark" size={20} color={Colors.mintDark} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

// ── Main Settings Screen ─────────────────────────────────────────────────────
export default function SettingsScreen({ navigation }: any) {
  const [user, setUser] = useState<any>(null);
  const [stops, setStops] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingNotif, setSavingNotif] = useState(false);

  // Stop pickers
  const [boardingEdit, setBoardingEdit] = useState(false);
  const [destinationEdit, setDestinationEdit] = useState(false);
  const [boardingAlertEdit, setBoardingAlertEdit] = useState(false);
  const [destinationAlertEdit, setDestinationAlertEdit] = useState(false);

  // Proximity stop alert selections
  const [boardingAlertStopId, setBoardingAlertStopId] = useState<number | null>(null);
  const [destinationAlertStopId, setDestinationAlertStopId] = useState<number | null>(null);

  // Master alerts & audio/vibration toggles
  const [masterAlertsEnabled, setMasterAlertsEnabled] = useState(false);
  const [vibrateEnabled, setVibrateEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [alarmTone, setAlarmTone] = useState<AlarmTone>('default');
  const [alarmToneEdit, setAlarmToneEdit] = useState(false);

  // Fine-grained push notification preferences (server-synced)
  const [notifyTripStarted, setNotifyTripStarted] = useState(true);
  const [notifyDelays, setNotifyDelays] = useState(true);
  const [notifyAdminBroadcasts, setNotifyAdminBroadcasts] = useState(true);

  useEffect(() => {
    // 1. Load local alert preferences
    getAlertSettings().then(settings => {
      setVibrateEnabled(settings.vibrateEnabled);
      setSoundEnabled(settings.soundEnabled);
      setAlarmTone(settings.alarmTone || (settings.soundEnabled === false ? 'silent' : 'default'));
      setMasterAlertsEnabled(settings.masterAlertsEnabled);
    });

    // 2. Load user & server-stored preferences
    getUser().then((u: any) => {
      if (u) {
        setUser(u);
        if (typeof u.boarding_alert_stop_id !== 'undefined') {
          setBoardingAlertStopId(u.boarding_alert_stop_id);
        }
        if (typeof u.destination_alert_stop_id !== 'undefined') {
          setDestinationAlertStopId(u.destination_alert_stop_id);
        }
        setNotifyTripStarted(u.notify_trip_started !== false);
        setNotifyDelays(u.notify_delays !== false);
        setNotifyAdminBroadcasts(u.notify_admin_broadcasts !== false);
      }
    });

    // 3. Fetch live stops list
    trackingApi.getStops()
      .then((res: any) => {
        if (Array.isArray(res.data) && res.data.length) {
          setStops(res.data);
        }
      })
      .catch(() => {});
  }, []);

  const currentStopName = stops.find(s => s.id === user?.boarding_stop_id)?.name || 'Not set';
  const currentDestName = stops.find(s => s.id === (user?.destination_stop_id || user?.boarding_stop_id))?.name || 'Not set';

  // Navigate back to Route
  const handleBack = async () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      const token = await getToken();
      navigation.reset({ index: 0, routes: [{ name: token ? 'RouteView' : 'ProfileSetup' }] });
    }
  };

  // ── Profile Updates ────────────────────────────────────────────────────────
  const handleBoardingChange = async (stop: any) => {
    setBoardingEdit(false);
    const updated = { ...user, boarding_stop_id: stop.id };
    await saveUser(updated);
    setUser(updated);
    setSaving(true);
    try {
      await authApi.updatePreferences({ boarding_stop_id: stop.id } as any);
      showToast(`Boarding stop updated to ${stop.name}`);
    } catch {
      showToast('Could not save boarding stop.');
    } finally {
      setSaving(false);
    }
  };

  const handleDestinationChange = async (stop: any) => {
    setDestinationEdit(false);
    const updated = { ...user, destination_stop_id: stop.id };
    await saveUser(updated);
    setUser(updated);
    setSaving(true);
    try {
      await authApi.updatePreferences({ destination_stop_id: stop.id });
      showToast(`Destination stop updated to ${stop.name}`);
    } catch {
      showToast('Could not save destination stop.');
    } finally {
      setSaving(false);
    }
  };

  // ── Master Notifications Toggle ───────────────────────────────────────────
  const handleMasterAlertsToggle = async (val: boolean) => {
    setMasterAlertsEnabled(val);
    const toneToSave = soundEnabled ? (alarmTone === 'silent' ? 'default' : alarmTone) : 'silent';
    await saveAlertSettings({
      vibrateEnabled,
      soundEnabled,
      alarmTone: toneToSave,
      masterAlertsEnabled: val,
    });

    if (val) {
      registerForPushNotificationsAsync().catch(() => {});
      // Restore previous pickup/drop-off stops from stash so selection isn't lost
      const stash = await getAlertStash();
      if (!boardingAlertStopId && stash.boarding) {
        const bStop = stops.find(s => s.id === stash.boarding) || { id: stash.boarding, name: 'your stop' };
        await handleBoardingAlertChange(bStop);
      }
      if (!destinationAlertStopId && stash.destination) {
        const dStop = stops.find(s => s.id === stash.destination) || { id: stash.destination, name: 'your stop' };
        await handleDestinationAlertChange(dStop);
      }
    } else {
      // Remember current selections before clearing them, then null stops server-side
      await saveAlertStash({ boarding: boardingAlertStopId, destination: destinationAlertStopId });
      if (boardingAlertStopId) await handleBoardingAlertChange(null);
      if (destinationAlertStopId) await handleDestinationAlertChange(null);
    }
  };

  // ── Pickup & Drop-off Proximity Alerts ────────────────────────────────────
  const handleBoardingAlertToggle = async (val: boolean) => {
    if (val) {
      registerForPushNotificationsAsync().catch(() => {});
      setBoardingAlertEdit(true);
    } else {
      await handleBoardingAlertChange(null);
    }
  };

  const handleDestinationAlertToggle = async (val: boolean) => {
    if (val) {
      registerForPushNotificationsAsync().catch(() => {});
      setDestinationAlertEdit(true);
    } else {
      await handleDestinationAlertChange(null);
    }
  };

  const handleBoardingAlertChange = async (stop: any) => {
    setBoardingAlertEdit(false);
    const stopId = stop ? stop.id : null;
    setBoardingAlertStopId(stopId);
    const updated = { ...user, boarding_alert_stop_id: stopId };
    await saveUser(updated);
    setUser(updated);
    setSaving(true);
    try {
      await authApi.updatePreferences({ boarding_alert_stop_id: stopId });
      showToast(stop ? `Pick-up notification updated to ${stop.name}` : 'Pick-up notification disabled');
    } catch {
      showToast('Could not save pick-up alert.');
    } finally {
      setSaving(false);
    }
  };

  const handleDestinationAlertChange = async (stop: any) => {
    setDestinationAlertEdit(false);
    const stopId = stop ? stop.id : null;
    setDestinationAlertStopId(stopId);
    const updated = { ...user, destination_alert_stop_id: stopId };
    await saveUser(updated);
    setUser(updated);
    setSaving(true);
    try {
      await authApi.updatePreferences({ destination_alert_stop_id: stopId });
      showToast(stop ? `Drop-off notification updated to ${stop.name}` : 'Drop-off notification disabled');
    } catch {
      showToast('Could not save drop-off alert.');
    } finally {
      setSaving(false);
    }
  };

  // ── Push Notification Preferences ─────────────────────────────────────────
  const handleNotifyToggle = async (field: string, val: boolean, setter: (v: boolean) => void) => {
    setter(val);
    if (val) {
      registerForPushNotificationsAsync().catch(() => {});
    }
    const updated = { ...user, [field]: val };
    await saveUser(updated);
    setUser(updated);
    setSavingNotif(true);
    try {
      await authApi.updatePreferences({ [field]: val } as any);
      showToast(val ? 'Notification enabled' : 'Notification disabled');
    } catch {
      showToast('Could not save preference.');
    } finally {
      setSavingNotif(false);
    }
  };

  // ── Vibrate & Sound Toggles ───────────────────────────────────────────────
  const handleVibrateToggle = async (val: boolean) => {
    setVibrateEnabled(val);
    await saveAlertSettings({
      vibrateEnabled: val,
      soundEnabled,
      alarmTone,
      masterAlertsEnabled,
    });
  };

  const handleSoundToggle = async (val: boolean) => {
    setSoundEnabled(val);
    const updatedTone = val ? (alarmTone === 'silent' ? 'default' : alarmTone) : 'silent';
    setAlarmTone(updatedTone);
    await saveAlertSettings({
      vibrateEnabled,
      soundEnabled: val,
      alarmTone: updatedTone,
      masterAlertsEnabled,
    });
  };

  const handleAlarmToneChange = async (tone: AlarmTone) => {
    setAlarmToneEdit(false);
    setAlarmTone(tone);
    const isSoundOn = tone !== 'silent';
    setSoundEnabled(isSoundOn);
    await saveAlertSettings({
      vibrateEnabled,
      soundEnabled: isSoundOn,
      alarmTone: tone,
      masterAlertsEnabled,
    });
    const label = ALARM_TONE_OPTIONS.find(o => o.value === tone)?.label || tone;
    showToast(`Sound updated to ${label}`);
  };

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await authApi.logout();
            } catch {
              // Server logout error ignored; session cleared locally
            }
            await clearSession();
            navigation.reset({ index: 0, routes: [{ name: 'ProfileSetup' }] });
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={S.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bgGray} />
      <TopBar showBack onBack={handleBack} title="Settings" />

      <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={S.screenTitle}>Settings</Text>

        {/* ── Profile Section ───────────────────────────────────────── */}
        <Text style={S.sectionLabel}>Profile</Text>
        <View style={S.card}>
          {/* Name */}
          <View style={S.row}>
            <View style={S.rowContent}>
              <Text style={S.rowLabel}>Name</Text>
              <Text style={S.rowValue}>{user?.name || '—'}</Text>
            </View>
          </View>

          {/* Email */}
          <View style={S.row}>
            <View style={S.rowContent}>
              <Text style={S.rowLabel}>Email</Text>
              <Text style={S.rowValue} numberOfLines={1}>{user?.email || 'Not set'}</Text>
            </View>
          </View>

          {/* Boarding Stop */}
          <View style={S.row}>
            <View style={S.rowContent}>
              <Text style={S.rowLabel}>Boarding Stop</Text>
              <View style={S.valueWithAction}>
                <Text style={S.rowValue}>{currentStopName}</Text>
                <TouchableOpacity onPress={() => setBoardingEdit(true)} activeOpacity={0.7}>
                  <Text style={S.changeLink}>Change</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Destination Stop */}
          <View style={[S.row, S.rowLast]}>
            <View style={S.rowContent}>
              <Text style={S.rowLabel}>Destination Stop</Text>
              <View style={S.valueWithAction}>
                <Text style={S.rowValue}>{currentDestName}</Text>
                <TouchableOpacity onPress={() => setDestinationEdit(true)} activeOpacity={0.7}>
                  <Text style={S.changeLink}>Change</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* ── Notifications Section ───────────────────────────────────── */}
        <Text style={S.sectionLabel}>Notifications</Text>

        {/* Master Toggle Card */}
        <View style={S.card}>
          <View style={[S.rowBetween, S.rowLast]}>
            <Text style={S.rowLabelBold}>Enable all Notifications</Text>
            <Switch
              value={masterAlertsEnabled}
              onValueChange={handleMasterAlertsToggle}
              trackColor={{ false: Colors.separator, true: Colors.mintDark }}
              thumbColor={Colors.white}
              ios_backgroundColor={Colors.separator}
            />
          </View>
        </View>

        {/* Sub-notifications Card (visible when master enabled) */}
        {masterAlertsEnabled && (
          <View style={[S.card, { marginTop: 16 }]}>
            {/* Pickup Notification */}
            <View style={S.rowColumn}>
              <View style={S.rowTopBetween}>
                <Text style={S.rowLabelBold}>Pickup Notification</Text>
                <Switch
                  value={boardingAlertStopId !== null}
                  onValueChange={handleBoardingAlertToggle}
                  trackColor={{ false: Colors.separator, true: Colors.mintDark }}
                  thumbColor={Colors.white}
                  ios_backgroundColor={Colors.separator}
                  disabled={saving}
                />
              </View>
              <View style={S.valueWithAction}>
                <Text style={S.rowValue}>
                  {boardingAlertStopId
                    ? (stops.find(s => s.id === boardingAlertStopId)?.name || 'Not set')
                    : 'Not Set'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    registerForPushNotificationsAsync().catch(() => {});
                    setBoardingAlertEdit(true);
                  }}
                  disabled={saving}
                  activeOpacity={0.7}
                >
                  <Text style={S.changeLink}>Change</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Drop-off Notification */}
            <View style={S.rowColumn}>
              <View style={S.rowTopBetween}>
                <Text style={S.rowLabelBold}>Drop-off Notification</Text>
                <Switch
                  value={destinationAlertStopId !== null}
                  onValueChange={handleDestinationAlertToggle}
                  trackColor={{ false: Colors.separator, true: Colors.mintDark }}
                  thumbColor={Colors.white}
                  ios_backgroundColor={Colors.separator}
                  disabled={saving}
                />
              </View>
              <View style={S.valueWithAction}>
                <Text style={S.rowValue}>
                  {destinationAlertStopId
                    ? (stops.find(s => s.id === destinationAlertStopId)?.name || 'Not set')
                    : 'Not Set'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    registerForPushNotificationsAsync().catch(() => {});
                    setDestinationAlertEdit(true);
                  }}
                  disabled={saving}
                  activeOpacity={0.7}
                >
                  <Text style={S.changeLink}>Change</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Trip Started */}
            <View style={S.rowBetween}>
              <View style={S.rowTextGroup}>
                <Text style={S.rowLabelBold}>Trip Started</Text>
                <Text style={S.descText}>When the bus begins its journey</Text>
              </View>
              <Switch
                value={notifyTripStarted}
                onValueChange={val => handleNotifyToggle('notify_trip_started', val, setNotifyTripStarted)}
                trackColor={{ false: Colors.separator, true: Colors.mintDark }}
                thumbColor={Colors.white}
                ios_backgroundColor={Colors.separator}
                disabled={savingNotif}
              />
            </View>

            {/* Delay Notification */}
            <View style={S.rowBetween}>
              <View style={S.rowTextGroup}>
                <Text style={S.rowLabelBold}>Delay Notification</Text>
                <Text style={S.descText}>When your bus is running late</Text>
              </View>
              <Switch
                value={notifyDelays}
                onValueChange={val => handleNotifyToggle('notify_delays', val, setNotifyDelays)}
                trackColor={{ false: Colors.separator, true: Colors.mintDark }}
                thumbColor={Colors.white}
                ios_backgroundColor={Colors.separator}
                disabled={savingNotif}
              />
            </View>

            {/* General Announcements */}
            <View style={S.rowBetween}>
              <View style={S.rowTextGroup}>
                <Text style={S.rowLabelBold}>General Announcements</Text>
                <Text style={S.descText}>University broadcasts from admin</Text>
              </View>
              <Switch
                value={notifyAdminBroadcasts}
                onValueChange={val => handleNotifyToggle('notify_admin_broadcasts', val, setNotifyAdminBroadcasts)}
                trackColor={{ false: Colors.separator, true: Colors.mintDark }}
                thumbColor={Colors.white}
                ios_backgroundColor={Colors.separator}
                disabled={savingNotif}
              />
            </View>

            {/* Vibrate on Notification */}
            <View style={S.rowBetween}>
              <Text style={S.rowLabelBold}>Vibrate on Notification</Text>
              <Switch
                value={vibrateEnabled}
                onValueChange={handleVibrateToggle}
                trackColor={{ false: Colors.separator, true: Colors.mintDark }}
                thumbColor={Colors.white}
                ios_backgroundColor={Colors.separator}
              />
            </View>

            {/* Sound on Notification */}
            <View style={[S.rowBetween, !soundEnabled && S.rowLast]}>
              <Text style={S.rowLabelBold}>Sound on Notification</Text>
              <Switch
                value={soundEnabled}
                onValueChange={handleSoundToggle}
                trackColor={{ false: Colors.separator, true: Colors.mintDark }}
                thumbColor={Colors.white}
                ios_backgroundColor={Colors.separator}
              />
            </View>

            {/* Notification Sound Selection */}
            {soundEnabled && (
              <View style={[S.rowBetween, S.rowLast]}>
                <View style={S.rowTextGroup}>
                  <Text style={S.rowLabelBold}>Notification Sound</Text>
                  <Text style={S.descText}>
                    {ALARM_TONE_OPTIONS.find(o => o.value === alarmTone)?.label || 'Default'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setAlarmToneEdit(true)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={S.changeLink}>Change</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {(saving || savingNotif) && (
          <View style={S.savingIndicator}>
            <ActivityIndicator size="small" color={Colors.mintDark} />
            <Text style={S.savingText}>Saving…</Text>
          </View>
        )}

        {/* Version Info */}
        <Text style={S.versionText}>Version 1.0.0 Android</Text>

        {/* Log Out Button (subtle, text-based) */}
        <TouchableOpacity style={S.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={18} color="#888" />
          <Text style={S.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Stop Selection Modals ────────────────────────────────────── */}
      <StopSelectModal
        visible={boardingEdit}
        title="Select Boarding Stop"
        stops={stops}
        selectedStopId={user?.boarding_stop_id}
        onSelect={handleBoardingChange}
        onClose={() => setBoardingEdit(false)}
      />
      <StopSelectModal
        visible={destinationEdit}
        title="Select Destination Stop"
        stops={stops}
        selectedStopId={user?.destination_stop_id}
        onSelect={handleDestinationChange}
        onClose={() => setDestinationEdit(false)}
      />
      <StopSelectModal
        visible={boardingAlertEdit}
        title="Choose stop where you need to get alert"
        stops={stops}
        selectedStopId={boardingAlertStopId}
        onSelect={handleBoardingAlertChange}
        onClose={() => setBoardingAlertEdit(false)}
      />
      <StopSelectModal
        visible={destinationAlertEdit}
        title="Choose stop where you need to get alert"
        stops={stops}
        selectedStopId={destinationAlertStopId}
        onSelect={handleDestinationAlertChange}
        onClose={() => setDestinationAlertEdit(false)}
      />
      <AlarmToneModal
        visible={alarmToneEdit}
        selectedTone={alarmTone}
        onSelect={handleAlarmToneChange}
        onClose={() => setAlarmToneEdit(false)}
      />
    </SafeAreaView>
  );
}

// ── Alarm Tone Modal Styles ──────────────────────────────────────────────────
const AT = StyleSheet.create({
  toneIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bgGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toneIconWrapActive: {
    backgroundColor: Colors.mintLighter,
  },
  toneDesc: {
    fontSize: 13,
    color: Colors.medGray,
    marginTop: 2,
  },
});

// ── Stop Modal Styles (matches duk_pwa1 StopSelectModal) ─────────────────────
const M = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  backdrop: {
    ...(StyleSheet.absoluteFill as any),
  },
  card: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    backgroundColor: Colors.white,
    borderRadius: 28,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.black,
    flex: 1,
    paddingRight: 8,
  },
  closeBtn: {
    padding: 4,
  },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginVertical: 4,
    backgroundColor: Colors.bgGray,
  },
  stopItemActive: {
    backgroundColor: Colors.mintLighter,
  },
  stopItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.black,
    flex: 1,
  },
  stopItemTextActive: {
    fontWeight: '700',
    color: Colors.mintText,
  },
});

// ── Screen Styles (aligned pixel-for-pixel with duk_pwa1 liquid-glass) ───────
const S = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bgGray,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 120,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.black,
    marginBottom: 24,
    marginTop: 4,
  },

  // Section label — 13px uppercase bold tracking
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.medGray,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },

  // Card — 24px radius, liquid-glass elevation & border
  card: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 6,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },

  // Rows
  row: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.black,
    marginBottom: 3,
  },
  rowLabelBold: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.black,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.medGray,
  },
  valueWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  changeLink: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.mintDark,
    textDecorationLine: 'underline',
  },

  // Row between (e.g. Master toggle, Vibrate, Sound, etc.)
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  rowTextGroup: {
    flex: 1,
    paddingRight: 16,
  },
  descText: {
    fontSize: 13,
    color: Colors.medGray,
    marginTop: 3,
    lineHeight: 18,
  },

  // Proximity alerts column layout
  rowColumn: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
    gap: 3,
  },
  rowTopBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },

  // Saving indicator
  savingIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginVertical: 12,
  },
  savingText: {
    fontSize: 14,
    color: Colors.medGray,
  },

  // Version
  versionText: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
    marginTop: 32,
    marginBottom: -8,
  },

  // Logout button
  logoutBtn: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    width: '100%',
  },
  logoutText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#888',
  },
});
