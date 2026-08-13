/**
 * BusIdleAnimation.tsx
 * Shows when the bus is offline / not in service.
 * Loads the same Dribbble GIF used by the PWA version.
 *
 * NOTE: For Android GIF support, `com.facebook.fresco:animated-gif`
 * must be in android/app/build.gradle (already added).
 * A native rebuild (`npx react-native run-android`) is required once.
 */
import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import Colors from '../theme/colors';

const GIF_URL = 'https://cdn.dribbble.com/userupload/20958845/file/original-c75e24374e4b3f92a6a5240b3ca7a60c.gif';

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
          source={{ uri: GIF_URL }}
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
    marginBottom: 24,
  },
  gifContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.separator,
    backgroundColor: Colors.white,
    height: 200,
  },
  gif: {
    width: '100%',
    height: '100%',
  },
  caption: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.medGray,
    textAlign: 'center',
    marginTop: 10,
  },
});
