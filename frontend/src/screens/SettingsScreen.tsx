/**
 * SettingsScreen.tsx — DUK Bus Tracker Android
 * Mirrors Settings.jsx from the PWA exactly:
 *  - Profile section: name, email, boarding stop (changeable), destination stop (optional)
 *  - Proximity Alert: toggle + boarding/destination alert stop selectors
 *  - Push Notifications: toggle
 *  - Logout
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import Colors from '../theme/colors';
import { getUser, saveUser, clearAll, getToken } from '../services/storage';
import { authApi, trackingApi } from '../services/api';
import TopBar from '../components/TopBar';

// ── Stop Select Bottom-Sheet ─────────────────────────────────────────────────
function StopSelectModal({
  visible,
  title,
  stops,
  selectedStopId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  stops: any[];
  selectedStopId: number | null;
  onSelect: (stop: any) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={M.overlay}>
        <TouchableOpacity style={M.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={M.sheet}>
          <View style={M.handle} />
          <View style={M.sheetHeader}>
            <Text style={M.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={M.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.black} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={stops}
            keyExtractor={item => String(item.id)}
            showsVerticalScrollIndicator
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[M.stopItem, item.id === selectedStopId && M.stopItemActive]}
                onPress={() => onSelect(item)}
                activeOpacity={0.7}
              >
                <Text style={[M.stopItemText, item.id === selectedStopId && M.stopItemTextActive]}>
                  {item.name}
                </Text>
                {item.id === selectedStopId && (
                  <Ionicons name="checkmark" size={18} color={Colors.mintDark} />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function SettingsScreen({ navigation }: any) {
  const [user, setUser] = useState<any>(null);
  const [stops, setStops] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  // Proximity alert
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [boardingAlertStopId, setBoardingAlertStopId] = useState<number | null>(null);
  const [destinationAlertStopId, setDestinationAlertStopId] = useState<number | null>(null);
  const [boardingAlertEdit, setBoardingAlertEdit] = useState(false);
  const [destinationAlertEdit, setDestinationAlertEdit] = useState(false);

  // Push notifications
  const [notifEnabled, setNotifEnabled] = useState(false);

  // Destination stop
  const [hasCustomDest, setHasCustomDest] = useState(false);
  const [boardingEdit, setBoardingEdit] = useState(false);
  const [destinationEdit, setDestinationEdit] = useState(false);

  useEffect(() => {
    getUser().then((u: any) => {
      if (u) {
        setUser(u);
        if (u.destination_stop_id) setHasCustomDest(true);
        if (typeof u.proximity_alert_enabled !== 'undefined') setAlertEnabled(u.proximity_alert_enabled);
        if (typeof u.boarding_alert_stop_id !== 'undefined') setBoardingAlertStopId(u.boarding_alert_stop_id);
        if (typeof u.destination_alert_stop_id !== 'undefined') setDestinationAlertStopId(u.destination_alert_stop_id);
        if (typeof u.notifications_on !== 'undefined') setNotifEnabled(u.notifications_on);
      }
    });
    trackingApi.getStops()
      .then((res: any) => { if (Array.isArray(res.data) && res.data.length) setStops(res.data); })
      .catch(() => {});
  }, []);

  const currentStopName = stops.find(s => s.id === user?.boarding_stop_id)?.name || 'Not set';
  const currentDestName = stops.find(s => s.id === user?.destination_stop_id)?.name || 'Not set';

  const handleBack = async () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      const token = await getToken();
      navigation.reset({ index: 0, routes: [{ name: token ? 'RouteView' : 'ProfileSetup' }] });
    }
  };

  const handleBoardingChange = async (stop: any) => {
    setBoardingEdit(false);
    const updated = { ...user, boarding_stop_id: stop.id };
    await saveUser(updated);
    setUser(updated);
  };

  const handleDestinationChange = async (stop: any) => {
    setDestinationEdit(false);
    const updated = { ...user, destination_stop_id: stop.id };
    await saveUser(updated);
    setUser(updated);
  };

  const handleCustomDestToggle = async (val: boolean) => {
    setHasCustomDest(val);
    if (!val) {
      const updated = { ...user, destination_stop_id: null, destination_alert_stop_id: null };
      await saveUser(updated);
      setUser(updated);
      setSaving(true);
      try { await authApi.updatePreferences({ destination_alert_stop_id: null }); } catch {}
      finally { setSaving(false); }
    }
  };

  const handleAlertToggle = async (val: boolean) => {
    setAlertEnabled(val);
    setSaving(true);
    const updated = { ...user, proximity_alert_enabled: val };
    await saveUser(updated);
    setUser(updated);
    try { await authApi.updatePreferences({ proximity_alert_enabled: val }); } catch {}
    finally { setSaving(false); }
  };

  const handleNotifToggle = async (val: boolean) => {
    setNotifEnabled(val);
    setSaving(true);
    const updated = { ...user, notifications_on: val };
    await saveUser(updated);
    setUser(updated);
    try { await authApi.updatePreferences({ notifications_on: val }); } catch {}
    finally { setSaving(false); }
  };

  const handleBoardingAlertChange = async (stop: any) => {
    setBoardingAlertEdit(false);
    setBoardingAlertStopId(stop.id);
    const updated = { ...user, boarding_alert_stop_id: stop.id };
    await saveUser(updated);
    setUser(updated);
    setSaving(true);
    try { await authApi.updatePreferences({ boarding_alert_stop_id: stop.id }); } catch {}
    finally { setSaving(false); }
  };

  const handleDestinationAlertChange = async (stop: any) => {
    setDestinationAlertEdit(false);
    setDestinationAlertStopId(stop.id);
    const updated = { ...user, destination_alert_stop_id: stop.id };
    await saveUser(updated);
    setUser(updated);
    setSaving(true);
    try { await authApi.updatePreferences({ destination_alert_stop_id: stop.id }); } catch {}
    finally { setSaving(false); }
  };

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
            await clearAll();
            navigation.reset({ index: 0, routes: [{ name: 'ProfileSetup' }] });
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={S.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bgGray} />
      <TopBar showBack onBack={handleBack} />

      <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={S.screenTitle}>Settings</Text>

        {/* ── Profile ───────────────────────────────────────────────── */}
        <Text style={S.sectionLabel}>Profile</Text>
        <View style={S.card}>
          {/* Name */}
          <View style={S.row}>
            <View style={S.rowContent}>
              <Text style={S.rowLabel}>Name</Text>
              <Text style={S.rowValue}>{user?.name || '—'}</Text>
            </View>
          </View>

          <View style={S.divider} />

          {/* Email */}
          <View style={S.row}>
            <View style={S.rowContent}>
              <Text style={S.rowLabel}>Email</Text>
              <Text style={S.rowValue} numberOfLines={1}>{user?.email || 'Not set'}</Text>
            </View>
          </View>

          <View style={S.divider} />

          {/* Boarding Stop */}
          <View style={S.row}>
            <View style={S.rowContent}>
              <Text style={S.rowLabel}>Boarding Stop</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
                <Text style={S.rowValue}>{currentStopName}</Text>
                <TouchableOpacity onPress={() => setBoardingEdit(true)}>
                  <Text style={S.changeLink}>Change</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={S.divider} />

          {/* Custom Destination Toggle */}
          <View style={S.row}>
            <View style={[S.rowContent, { flex: 1 }]}>
              <Text style={S.rowLabel}>Different Destination Point</Text>
            </View>
            <Switch
              value={hasCustomDest}
              onValueChange={handleCustomDestToggle}
              trackColor={{ false: Colors.separator, true: Colors.mint }}
              thumbColor={Colors.white}
              ios_backgroundColor={Colors.separator}
              disabled={saving}
            />
          </View>

          {/* Destination Stop (conditional) */}
          {hasCustomDest && (
            <>
              <View style={S.divider} />
              <View style={S.row}>
                <View style={S.rowContent}>
                  <Text style={S.rowLabel}>Destination Stop</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
                    <Text style={S.rowValue}>{currentDestName}</Text>
                    <TouchableOpacity onPress={() => setDestinationEdit(true)}>
                      <Text style={S.changeLink}>Change</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </>
          )}
        </View>

        {/* ── Preferences ───────────────────────────────────────────── */}
        <Text style={S.sectionLabel}>Preferences</Text>
        <View style={S.card}>
          {/* Proximity Alert toggle */}
          <View style={S.row}>
            <View style={[S.rowContent, { flex: 1 }]}>
              <Text style={S.rowLabel}>Proximity Alert</Text>
              <Text style={S.rowValue}>{alertEnabled ? 'Enabled' : 'Disabled'}</Text>
            </View>
            <Switch
              value={alertEnabled}
              onValueChange={handleAlertToggle}
              trackColor={{ false: Colors.separator, true: Colors.mint }}
              thumbColor={Colors.white}
              ios_backgroundColor={Colors.separator}
              disabled={saving}
            />
          </View>

          {alertEnabled && (
            <>
              <View style={S.divider} />
              {/* Boarding Alert Stop */}
              <View style={S.row}>
                <View style={S.rowContent}>
                  <Text style={S.rowLabel}>Boarding Alert Stop</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
                    <Text style={S.rowValue}>
                      {stops.find(s => s.id === boardingAlertStopId)?.name || 'Not set'}
                    </Text>
                    <TouchableOpacity onPress={() => setBoardingAlertEdit(true)} disabled={saving}>
                      <Text style={S.changeLink}>Change</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Destination Alert Stop (only if custom dest enabled) */}
              {hasCustomDest && (
                <>
                  <View style={S.divider} />
                  <View style={S.row}>
                    <View style={S.rowContent}>
                      <Text style={S.rowLabel}>Destination Alert Stop</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
                        <Text style={S.rowValue}>
                          {stops.find(s => s.id === destinationAlertStopId)?.name || 'Not set'}
                        </Text>
                        <TouchableOpacity onPress={() => setDestinationAlertEdit(true)} disabled={saving}>
                          <Text style={S.changeLink}>Change</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </>
              )}
            </>
          )}
        </View>

        {/* ── Notifications ─────────────────────────────────────────── */}
        <Text style={S.sectionLabel}>Notifications</Text>
        <View style={S.card}>
          <View style={S.row}>
            <View style={[S.rowContent, { flex: 1 }]}>
              <Text style={S.rowLabel}>Push Notifications</Text>
              <Text style={S.rowValue}>{notifEnabled ? 'Enabled' : 'Disabled'}</Text>
            </View>
            <Switch
              value={notifEnabled}
              onValueChange={handleNotifToggle}
              trackColor={{ false: Colors.separator, true: Colors.mint }}
              thumbColor={Colors.white}
              ios_backgroundColor={Colors.separator}
              disabled={saving}
            />
          </View>
        </View>

        {saving && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <ActivityIndicator size="small" color={Colors.mintDark} />
            <Text style={{ fontSize: 13, color: Colors.medGray }}>Saving…</Text>
          </View>
        )}

        {/* Version */}
        <Text style={S.versionText}>DUK Bus Tracker v1.0 Android</Text>

        {/* Logout */}
        <TouchableOpacity style={S.logoutRow} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={18} color={Colors.medGray} />
          <Text style={S.logoutText}>Log Out</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* ── Stop-Select Modals ──────────────────────────────────────── */}
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
        title="Select Boarding Alert Stop"
        stops={stops}
        selectedStopId={boardingAlertStopId}
        onSelect={handleBoardingAlertChange}
        onClose={() => setBoardingAlertEdit(false)}
      />
      <StopSelectModal
        visible={destinationAlertEdit}
        title="Select Destination Alert Stop"
        stops={stops}
        selectedStopId={destinationAlertStopId}
        onSelect={handleDestinationAlertChange}
        onClose={() => setDestinationAlertEdit(false)}
      />
    </SafeAreaView>
  );
}

// ── Stop Modal Styles ────────────────────────────────────────────────────────
const M = StyleSheet.create({
  overlay:         { flex: 1, justifyContent: 'flex-end' },
  backdrop:        { ...StyleSheet.absoluteFill as any, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:           { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%', paddingBottom: 0, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 20 },
  handle:          { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.separator, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.separator },
  sheetTitle:      { fontSize: 17, fontWeight: '700', color: Colors.black },
  closeBtn:        { padding: 4 },
  stopItem:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, marginHorizontal: 8, marginVertical: 2 },
  stopItemActive:  { backgroundColor: Colors.mintLighter },
  stopItemText:    { fontSize: 15, fontWeight: '500', color: Colors.black },
  stopItemTextActive: { fontWeight: '700', color: Colors.mintText },
});

// ── Main Styles ──────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  safeArea:      { flex: 1, backgroundColor: Colors.bgGray },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 },
  screenTitle:   { fontSize: 26, fontWeight: '800', color: Colors.black, marginBottom: 20, marginTop: 4 },

  // Section label (like PWA's settings-section-label)
  sectionLabel:  { fontSize: 13, fontWeight: '700', color: Colors.medGray, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4, marginTop: 4 },

  // Card
  card:          { backgroundColor: Colors.white, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },

  // Rows
  row:           { flexDirection: 'row', paddingVertical: 14, alignItems: 'center' },
  rowContent:    { flex: 1 },
  rowLabel:      { fontSize: 13, color: Colors.medGray, fontWeight: '500', marginBottom: 2 },
  rowValue:      { fontSize: 16, fontWeight: '600', color: Colors.black },
  changeLink:    { fontSize: 14, fontWeight: '600', color: Colors.mintDark, textDecorationLine: 'underline' },

  divider:       { height: 1, backgroundColor: Colors.separator, marginHorizontal: -16 },

  // Logout
  versionText:   { fontSize: 12, color: Colors.lightGray, textAlign: 'center', marginBottom: 8, marginTop: 8 },
  logoutRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, marginTop: 4 },
  logoutText:    { fontSize: 16, fontWeight: '600', color: Colors.medGray },
});
