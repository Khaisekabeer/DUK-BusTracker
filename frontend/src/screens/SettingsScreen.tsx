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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import Colors from '../theme/colors';
import { getUser, clearAll, getToken } from '../services/storage';
import TopBar from '../components/TopBar';

export default function SettingsScreen({ navigation }: any) {
  const [tripType, setTripType] = useState<'Morning' | 'Evening'>('Morning');
  const [alarmEnabled, setAlarmEnabled] = useState(true);
  const [alertType, setAlertType] = useState<'time' | 'stops' | 'both'>('time');
  const [alertMinutes, setAlertMinutes] = useState(10);
  const [alarmSound, setAlarmSound] = useState<'Standard' | 'Loud' | 'Chime'>('Standard');
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    getUser().then((u: any) => { if (u) setUser(u); });
  }, []);

  // Smart back — if there's something to go back to, go back; else go to RouteView
  const handleBack = async () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      const token = await getToken();
      if (token) {
        navigation.reset({ index: 0, routes: [{ name: 'RouteView' }] });
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'ProfileSetup' }] });
      }
    }
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
            navigation.reset({
              index: 0,
              routes: [{ name: 'ProfileSetup' }],
            });
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

        {/* Profile & Trip Info */}
        <View style={S.card}>
          <Text style={S.cardTitle}>Profile & Trip Info</Text>

          <View style={S.row}>
            <View style={S.iconContainer}>
              <Ionicons name="person-outline" size={18} color={Colors.mintDark} />
            </View>
            <View style={S.rowContent}>
              <Text style={S.rowLabel}>User Name</Text>
              <Text style={S.rowValue}>{user?.name || 'User'}</Text>
            </View>
          </View>
          <View style={S.divider} />

          <View style={S.row}>
            <View style={S.iconContainer}>
              <Ionicons name="mail-outline" size={18} color={Colors.mintDark} />
            </View>
            <View style={S.rowContent}>
              <Text style={S.rowLabel}>Email</Text>
              <Text style={S.rowValue} numberOfLines={1}>{user?.email || 'user@duk.ac.in'}</Text>
            </View>
          </View>
          <View style={S.divider} />

          <View style={S.row}>
            <View style={S.iconContainer}>
              <Ionicons name="options-outline" size={18} color={Colors.mintDark} />
            </View>
            <View style={S.rowContent}>
              <Text style={S.rowLabel}>Active Schedule</Text>
              <View style={S.segmentContainer}>
                {(['Morning', 'Evening'] as const).map(opt => (
                  <TouchableOpacity
                    key={opt}
                    style={[S.segmentBtn, tripType === opt && S.segmentBtnActive]}
                    onPress={() => setTripType(opt)}
                    activeOpacity={0.8}
                  >
                    <Text style={[S.segmentText, tripType === opt && S.segmentTextActive]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* Notification Setup */}
        <View style={S.card}>
          <Text style={S.cardTitle}>Notification Setup</Text>

          {/* Enable toggle */}
          <View style={S.row}>
            <View style={S.iconContainer}>
              <Ionicons name="alarm-outline" size={18} color={Colors.mintDark} />
            </View>
            <View style={S.rowContent}>
              <Text style={S.rowValue}>Enable Notifications</Text>
              <Text style={S.rowLabel}>Alert when bus is nearby</Text>
            </View>
            <Switch
              value={alarmEnabled}
              onValueChange={setAlarmEnabled}
              trackColor={{ false: Colors.separator, true: Colors.mint }}
              thumbColor={Colors.white}
              ios_backgroundColor={Colors.separator}
            />
          </View>
          <View style={S.divider} />

          {/* Vibration toggle */}
          <View style={S.row}>
            <View style={S.iconContainer}>
              <Ionicons name="phone-portrait-outline" size={18} color={Colors.mintDark} />
            </View>
            <View style={S.rowContent}>
              <Text style={S.rowValue}>Vibration Haptics</Text>
              <Text style={S.rowLabel}>Vibrate on alarm warning</Text>
            </View>
            <Switch
              value={vibrationEnabled}
              onValueChange={setVibrationEnabled}
              trackColor={{ false: Colors.separator, true: Colors.mint }}
              thumbColor={Colors.white}
              ios_backgroundColor={Colors.separator}
            />
          </View>
          <View style={S.divider} />

          {/* Alert Boundary Mode */}
          <View style={S.row}>
            <View style={S.iconContainer}>
              <Ionicons name="notifications-circle-outline" size={18} color={Colors.mintDark} />
            </View>
            <View style={S.rowContent}>
              <Text style={S.rowLabel}>Alert Boundary Mode</Text>
              <View style={S.segmentContainer}>
                {(['time', 'stops', 'both'] as const).map(mode => (
                  <TouchableOpacity
                    key={mode}
                    style={[S.segmentBtn, alertType === mode && S.segmentBtnActive]}
                    onPress={() => setAlertType(mode)}
                    activeOpacity={0.8}
                  >
                    <Text style={[S.segmentText, alertType === mode && S.segmentTextActive]}>{mode.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
          <View style={S.divider} />

          {/* Alert Lead Time */}
          <View style={S.row}>
            <View style={S.iconContainer}>
              <Ionicons name="timer-outline" size={18} color={Colors.mintDark} />
            </View>
            <View style={S.rowContent}>
              <Text style={S.rowLabel}>Proximity Alert Lead Time</Text>
              <View style={S.segmentContainer}>
                {[5, 10, 15].map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[S.segmentBtn, alertMinutes === m && S.segmentBtnActive]}
                    onPress={() => setAlertMinutes(m)}
                    activeOpacity={0.8}
                  >
                    <Text style={[S.segmentText, alertMinutes === m && S.segmentTextActive]}>{m} min</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
          <View style={S.divider} />

          {/* Alarm Sound */}
          <View style={S.row}>
            <View style={S.iconContainer}>
              <Ionicons name="volume-medium-outline" size={18} color={Colors.mintDark} />
            </View>
            <View style={S.rowContent}>
              <Text style={S.rowLabel}>Alarm Ringtone</Text>
              <View style={S.segmentContainer}>
                {(['Standard', 'Loud', 'Chime'] as const).map(sound => (
                  <TouchableOpacity
                    key={sound}
                    style={[S.segmentBtn, alarmSound === sound && S.segmentBtnActive]}
                    onPress={() => setAlarmSound(sound)}
                    activeOpacity={0.8}
                  >
                    <Text style={[S.segmentText, alarmSound === sound && S.segmentTextActive]}>{sound}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* Logout — subtle, text-based */}
        <TouchableOpacity style={S.logoutRow} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={18} color={Colors.medGray} />
          <Text style={S.logoutText}>Log Out</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safeArea:           { flex: 1, backgroundColor: Colors.bgGray },
  scrollContent:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  screenTitle:        { fontSize: 28, fontWeight: '800', color: Colors.black, marginBottom: 20, marginTop: 4 },
  card:               { backgroundColor: Colors.white, borderRadius: 16, padding: 18, marginBottom: 20, borderWidth: 1, borderColor: Colors.separator },
  cardTitle:          { fontSize: 13, fontWeight: '700', color: Colors.medGray, marginBottom: 12, letterSpacing: 0.4 },
  row:                { flexDirection: 'row', paddingVertical: 10, alignItems: 'center' },
  iconContainer:      { width: 28, alignItems: 'center' },
  rowContent:         { flex: 1, paddingLeft: 10 },
  rowLabel:           { fontSize: 12, color: Colors.lightGray, fontWeight: '500', marginTop: 2 },
  rowValue:           { fontSize: 14, fontWeight: '600', color: Colors.black },
  divider:            { height: 1, backgroundColor: Colors.separator, marginVertical: 2 },
  // Segmented selectors
  segmentContainer:   { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgGray, borderRadius: 10, padding: 3, marginTop: 8, alignSelf: 'flex-start' },
  segmentBtn:         { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  segmentBtnActive:   { backgroundColor: Colors.white, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  segmentText:        { fontSize: 12, fontWeight: '600', color: Colors.medGray },
  segmentTextActive:  { color: Colors.mintText },
  // Minimal logout
  logoutRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, marginTop: 4 },
  logoutText:         { fontSize: 14, fontWeight: '600', color: Colors.medGray },
});
