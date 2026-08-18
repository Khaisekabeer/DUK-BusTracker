/**
 * BusIdleAnimation.tsx
 * Shows when the bus is offline / not in service.
 * Loads a local GIF to ensure proper animation on Android.
 */
import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import Colors from '../theme/colors';

type Props = {
  nextTripTime?: string | null;
  isUnscheduled?: boolean;
};

export default function BusIdleAnimation({ nextTripTime, isUnscheduled }: Props) {
  const caption = isUnscheduled
    ? 'Unscheduled trip in progress'
    : nextTripTime
    ? `Next trip at ${nextTripTime}`
    : 'Bus is not in service';

  return (
    <View style={S.wrapper}>
      <View style={S.gifContainer}>
        <Image
          source={require('../assets/bus_idle.gif')}
          style={S.gif}
          resizeMode="cover"
        />
      </View>
      <Text style={S.caption}>{caption}</Text>
    </View>
  );
}

const S = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 20,
  },
  gifContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    height: 260,
  },
  gif: {
    width: '100%',
    height: '100%',
  },
  caption: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.medGray,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 16,
  },
});
