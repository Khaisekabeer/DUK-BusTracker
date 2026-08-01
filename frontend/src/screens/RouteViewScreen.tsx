import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import Colors from '../theme/colors';
import TopBar from '../components/TopBar';

const TIMELINE_DATA = [
  { id: '1', name: 'Kazhakkoottam', time: '9:15 AM', status: 'past' },
  { id: '2', name: 'Sreekaryam', time: '9:18 AM', status: 'past' },
  { id: '3', name: 'Karyavattom', time: '9:25 AM', status: 'current' },
  { id: '4', name: 'Technopark Campus', time: '9:32 AM', status: 'future' },
  { id: '5', name: 'DUK Main Gate', time: '9:40 AM', status: 'future' },
];

export default function RouteViewScreen() {
  return (
    <SafeAreaView style={S.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
      
      <TopBar />

      <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header Section */}
        <View style={S.headerRow}>
          <Text style={S.screenTitle}>Route View</Text>
          <View style={S.liveBadge}>
            <View style={S.liveDot} />
            <Text style={S.liveText}>LIVE</Text>
          </View>
        </View>

        <View style={S.tripRow}>
          <View style={S.tripPill}>
            <Text style={S.tripPillText}>Trip 1</Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color={Colors.medGray} style={{ marginHorizontal: 8 }} />
          <Text style={S.tripDestText}>VATTIYOORKAVU</Text>
        </View>

        {/* Info Card */}
        <View style={S.card}>
          <View style={S.statsRow}>
            <View style={S.statItem}>
              <Text style={S.statValue}>8 min</Text>
              <Text style={S.statLabel}>NEXT STOP</Text>
            </View>
            <View style={S.statDivider} />
            <View style={S.statItem}>
              <Text style={S.statValue}>22 min</Text>
              <Text style={S.statLabel}>TO DESTINATION</Text>
            </View>
            <View style={S.statDivider} />
            <View style={S.statItem}>
              <Text style={S.statValue}>2/5</Text>
              <Text style={S.statLabel}>STOPS</Text>
            </View>
          </View>

          <View style={S.timelineContainer}>
            {TIMELINE_DATA.map((item, index) => {
              const isLast = index === TIMELINE_DATA.length - 1;
              const isPast = item.status === 'past';
              const isCurrent = item.status === 'current';
              
              return (
                <View key={item.id} style={S.timelineItem}>
                  <View style={S.timelineLeft}>
                    <View style={[
                      S.timelineDot,
                      isCurrent && S.timelineDotCurrent,
                      isPast && S.timelineDotPast
                    ]} />
                    {!isLast && (
                      <View style={[
                        S.timelineLine,
                        (isPast || isCurrent) && S.timelineLineActive
                      ]} />
                    )}
                  </View>
                  <View style={S.timelineContent}>
                    <Text style={[
                      S.stopName,
                      isCurrent && S.stopNameCurrent
                    ]}>{item.name}</Text>
                    <Text style={[
                      S.stopTime,
                      isCurrent && S.stopTimeCurrent
                    ]}>{item.time}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Live Map Section */}
        <Text style={S.mapSectionTitle}>Live Map</Text>
        <TouchableOpacity activeOpacity={0.9} style={S.mapCard}>
          {/* Simulated Map Background */}
          <View style={S.mapGridBg}>
            {[...Array(10)].map((_, i) => (
              <View key={`h-${i}`} style={[S.gridLineH, { top: i * 20 }]} />
            ))}
            {[...Array(15)].map((_, i) => (
              <View key={`v-${i}`} style={[S.gridLineV, { left: i * 20 }]} />
            ))}
          </View>
          
          <View style={S.mapContent}>
            <View style={S.mapOverlayBtn}>
              <Ionicons name="chevron-back" size={14} color={Colors.black} />
              <Text style={S.mapOverlayText}>Maps</Text>
            </View>
            
            {/* Fake Route Line */}
            <View style={S.routeLineContainer}>
              <View style={S.routeLine} />
              <View style={S.busMarker}>
                <Ionicons name="bus" size={16} color={Colors.white} />
              </View>
              <View style={S.routeDotStart} />
              <View style={S.routeDotEnd} />
            </View>

            <View style={S.tapToViewPill}>
              <Text style={S.tapToViewText}>Tap to view full map</Text>
            </View>
          </View>
        </TouchableOpacity>
        
        <View style={{height: 40}} />
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bgGray },
  scrollContent: { padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  screenTitle: { fontSize: 24, fontWeight: '800', color: Colors.black },
  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.mintLighter, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.mintDark },
  liveText: { fontSize: 12, fontWeight: '700', color: Colors.mintText },
  tripRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  tripPill: { backgroundColor: Colors.mint, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  tripPillText: { fontSize: 13, fontWeight: '700', color: Colors.mintText },
  tripDestText: { fontSize: 14, fontWeight: '700', color: Colors.black, letterSpacing: 0.5 },
  card: { backgroundColor: Colors.white, borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 15, elevation: 4, marginBottom: 24 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.separator, paddingBottom: 20, marginBottom: 20 },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 16, fontWeight: '800', color: Colors.black, marginBottom: 4 },
  statLabel: { fontSize: 10, fontWeight: '600', color: Colors.lightGray, letterSpacing: 0.5 },
  statDivider: { width: 1, height: 30, backgroundColor: Colors.separator },
  timelineContainer: { paddingLeft: 10 },
  timelineItem: { flexDirection: 'row', minHeight: 60 },
  timelineLeft: { width: 24, alignItems: 'center' },
  timelineDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: Colors.borderGray, backgroundColor: Colors.white, zIndex: 2 },
  timelineDotPast: { borderColor: Colors.lightGray },
  timelineDotCurrent: { borderColor: Colors.mint, backgroundColor: Colors.mintLighter, width: 20, height: 20, borderRadius: 10, borderWidth: 4 },
  timelineLine: { width: 2, flex: 1, backgroundColor: Colors.borderGray, position: 'absolute', top: 16, bottom: -16, zIndex: 1 },
  timelineLineActive: { backgroundColor: Colors.mintLighter },
  timelineContent: { flex: 1, paddingLeft: 16, paddingBottom: 20 },
  stopName: { fontSize: 15, fontWeight: '600', color: Colors.darkGray, marginBottom: 2 },
  stopNameCurrent: { color: Colors.mintText },
  stopTime: { fontSize: 13, color: Colors.lightGray },
  stopTimeCurrent: { color: Colors.mintDark, fontWeight: '500' },
  mapSectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.black, marginBottom: 12 },
  mapCard: { backgroundColor: Colors.white, borderRadius: 20, height: 180, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 15, elevation: 4 },
  mapGridBg: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: Colors.mapBg, opacity: 0.5 },
  gridLineH: { width: '100%', height: 1, backgroundColor: Colors.mapGrid, position: 'absolute' },
  gridLineV: { width: 1, height: '100%', backgroundColor: Colors.mapGrid, position: 'absolute' },
  mapContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapOverlayBtn: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  mapOverlayText: { fontSize: 12, fontWeight: '600', color: Colors.black, marginLeft: 4 },
  routeLineContainer: { width: '80%', height: 60, justifyContent: 'center', alignItems: 'center' },
  routeLine: { width: '100%', height: 4, backgroundColor: Colors.blue, transform: [{ rotate: '-15deg' }] },
  busMarker: { position: 'absolute', width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.yellow, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: Colors.white, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  routeDotStart: { position: 'absolute', left: '10%', top: '60%', width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.green, borderWidth: 2, borderColor: Colors.white },
  routeDotEnd: { position: 'absolute', right: '10%', top: '20%', width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.white, borderWidth: 2, borderColor: Colors.blue },
  tapToViewPill: { position: 'absolute', bottom: 16, backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 3 },
  tapToViewText: { fontSize: 13, fontWeight: '600', color: Colors.black },
});
