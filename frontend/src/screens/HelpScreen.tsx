import React from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import Colors from '../theme/colors';
import TopBar from '../components/TopBar';

export default function HelpScreen({ navigation }: any) {
  return (
    <SafeAreaView style={S.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bgGray} />
      <TopBar showBack onBack={() => navigation.goBack()} />

      <View style={S.titleContainer}>
        <Text style={S.screenTitle}>Help & Guidelines</Text>
      </View>
      <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>

        <View style={S.section}>
          <View style={S.headerRow}>
            <Ionicons name="shield-checkmark" size={20} color={Colors.mintDark} style={S.icon} />
            <Text style={S.sectionTitle}>Getting Started</Text>
          </View>
          <Text style={S.text}>
            Welcome to the <Text style={S.bold}>DUK Bus Tracker</Text>! This app is designed exclusively for the Digital University Kerala community to effortlessly track the DUK bus, be notified of delays, get predictions on arrival time, and receive smart alerts.
          </Text>
          <Text style={S.text}>
            Upon your first login, you need to verify your identity using your <Text style={S.bold}>@duk.ac.in</Text> or <Text style={S.bold}>@iiitmk.ac.in</Text> email and an OTP. You also need to select your morning boarding/evening destination stops, which helps the app provide personalized ETAs.
          </Text>
        </View>

        <View style={S.section}>
          <View style={S.headerRow}>
            <Ionicons name="time" size={20} color={Colors.mintDark} style={S.icon} />
            <Text style={S.sectionTitle}>Route View & Timeline</Text>
          </View>
          <Text style={S.text}>
            The <Text style={S.bold}>Route View</Text> is your main dashboard. It provides a chronological timeline of the current bus trip (Morning or Evening).
          </Text>
          <View style={S.bulletItem}>
            <Text style={S.bullet}>•</Text>
            <Text style={S.bulletText}><Text style={S.bold}>Live Tracking:</Text> As the bus moves, the timeline progresses, highlighting passed stops and showing the next immediate stop.</Text>
          </View>
          <View style={S.bulletItem}>
            <Text style={S.bullet}>•</Text>
            <Text style={S.bulletText}><Text style={S.bold}>ML-Powered ETA:</Text> The app uses AI to predict delays or early arrivals based on live traffic and historical data.</Text>
          </View>
        </View>

        <View style={S.section}>
          <View style={S.headerRow}>
            <Ionicons name="map" size={20} color={Colors.mintDark} style={S.icon} />
            <Text style={S.sectionTitle}>Map View & 3D Mode</Text>
          </View>
          <Text style={S.text}>
            Switch to the <Text style={S.bold}>Map View</Text> to see the bus on an interactive map.
          </Text>
          <View style={S.bulletItem}>
            <Text style={S.bullet}>•</Text>
            <Text style={S.bulletText}><Text style={S.bold}>Auto-Follow:</Text> The map centers automatically on the bus as it moves. If you pan away, tap the crosshair icon to re-center.</Text>
          </View>
          <View style={S.bulletItem}>
            <Text style={S.bullet}>•</Text>
            <Text style={S.bulletText}><Text style={S.bold}>Interactive Stops:</Text> Tap any stop on the map to see its scheduled time and real-time distance from the bus.</Text>
          </View>
          <View style={S.bulletItem}>
            <Text style={S.bullet}>•</Text>
            <Text style={S.bulletText}><Text style={S.bold}>Zoom Controls:</Text> Use two fingers to pinch and zoom, or use the + and - buttons on the right side.</Text>
          </View>
        </View>

        <View style={S.section}>
          <View style={S.headerRow}>
            <Ionicons name="notifications" size={20} color={Colors.mintDark} style={S.icon} />
            <Text style={S.sectionTitle}>Smart Alerts</Text>
          </View>
          <Text style={S.text}>
            Never miss a bus again. You can enable <Text style={S.bold}>Smart Alerts</Text> in Settings to receive proximity notifications.
          </Text>
          <View style={S.bulletItem}>
            <Text style={S.bullet}>•</Text>
            <Text style={S.bulletText}><Text style={S.bold}>Pickup Notification:</Text> Get alerted exactly when the bus arrives at your selected stop.</Text>
          </View>
          <View style={S.bulletItem}>
            <Text style={S.bullet}>•</Text>
            <Text style={S.bulletText}><Text style={S.bold}>Drop-off Notification:</Text> Receive a reminder to gather your belongings when the bus reached the selected stop from your destination.</Text>
          </View>
        </View>

        <View style={S.section}>
          <View style={S.headerRow}>
            <Ionicons name="bus" size={20} color={Colors.mintDark} style={S.icon} />
            <Text style={S.sectionTitle}>Bus Statuses Explained</Text>
          </View>
          <Text style={S.text}>
            You might see different trip statuses at the top of your screen:
          </Text>
          <View style={S.bulletItem}>
            <Text style={S.bullet}>•</Text>
            <Text style={S.bulletText}><Text style={S.bold}>Active/In Service:</Text> The bus is on its scheduled route and transmitting live location data.</Text>
          </View>
          <View style={S.bulletItem}>
            <Text style={S.bullet}>•</Text>
            <Text style={S.bulletText}><Text style={S.bold}>Delayed:</Text> The bus is running behind schedule. The app will show estimated how many minutes late it is.</Text>
          </View>
        </View>

        <View style={S.section}>
          <View style={S.headerRow}>
            <Ionicons name="settings" size={20} color={Colors.mintDark} style={S.icon} />
            <Text style={S.sectionTitle}>Settings & Preferences</Text>
          </View>
          <Text style={S.text}>
            Tap the <Text style={S.bold}>menu icon</Text> (top left) to access Settings, where you can:
          </Text>
          <View style={S.bulletItem}>
            <Text style={S.bullet}>•</Text>
            <Text style={S.bulletText}>Change your default Boarding Stop or Destination Stop.</Text>
          </View>
          <View style={S.bulletItem}>
            <Text style={S.bullet}>•</Text>
            <Text style={S.bulletText}>Toggle Smart Alerts and configure custom trigger stops.</Text>
          </View>
        </View>

        <View style={[S.section, { borderBottomWidth: 0, marginBottom: 20 }]}>
          <View style={S.headerRow}>
            <Ionicons name="help-circle" size={20} color={Colors.mintDark} style={S.icon} />
            <Text style={S.sectionTitle}>Need More Help?</Text>
          </View>
          <Text style={S.text}>
            If you encounter bugs or have suggestions, open the side menu and tap <Text style={S.bold}>"Send Feedback"</Text>.
            For technical issues with the tracking hardware on the bus, please contact the transport administrator.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bgGray },
  scrollContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 },
  titleContainer: { paddingHorizontal: 20 },
  screenTitle: { fontSize: 30, fontWeight: '800', color: Colors.black, marginBottom: 12, marginTop: 4, letterSpacing: -0.5 },
  section: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  icon: { marginRight: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: Colors.black },
  text: { fontSize: 16, color: Colors.medGray, lineHeight: 24, marginBottom: 12 },
  bold: { fontWeight: '700', color: Colors.black },
  bulletItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, paddingRight: 10 },
  bullet: { fontSize: 18, color: Colors.mintDark, marginRight: 8, marginTop: -2, fontWeight: '800' },
  bulletText: { fontSize: 16, color: Colors.medGray, lineHeight: 24, flex: 1 },
});
