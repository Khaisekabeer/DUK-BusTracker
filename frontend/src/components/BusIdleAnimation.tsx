/**
 * BusIdleAnimation.tsx
 * Shows when the bus is offline / not in service.
 * Loads a local GIF to ensure proper animation on Android.
 * Matches duk_pwa1 BusIdleAnimation.jsx layout & styles.
 */
import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';

type Props = {
  nextTripTime?: string | null;
  isUnscheduled?: boolean;
};

export default function BusIdleAnimation({ nextTripTime, isUnscheduled }: Props) {
  return (
    <View style={S.container}>
      {/* ── GIF Card (Top) ──────────────────────────────────────────────── */}
      <View style={S.gifWrap}>
        <Image
          source={require('../assets/bus_idle.gif')}
          style={S.gif}
          resizeMode="cover"
        />
      </View>

      {/* ── Status Card (Bottom) ────────────────────────────────────────── */}
      <View style={S.infoCard}>
        {nextTripTime && !isUnscheduled ? (
          <Text style={S.tripTitle}>
            Next Trip at - {nextTripTime}
          </Text>
        ) : isUnscheduled ? (
          <Text style={S.tripTitle}>
            Unscheduled trip in progress
          </Text>
        ) : (
          <Text style={S.tripTitle}>
            Bus is not in service
          </Text>
        )}

        <Text style={S.subText}>
          To know the bus current location, use the Map View.
        </Text>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    marginBottom: 0,
  },
  gifWrap: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gif: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  infoCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
    gap: 12,
  },
  tripTitle: {
    textAlign: 'center',
    fontWeight: '600',
    color: '#1f2937',
    fontSize: 16,
  },
  subText: {
    color: '#6b7280',
    paddingHorizontal: 8,
    paddingBottom: 4,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
});
