import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import Colors from '../theme/colors';

interface AppUpdateModalProps {
  visible: boolean;
  forceUpdate?: boolean; // If true, user cannot dismiss
  onDismiss?: () => void;
  playStoreUrl?: string; // e.g. 'market://details?id=com.bustracker'
}

export default function AppUpdateModal({
  visible,
  forceUpdate = false,
  onDismiss,
  playStoreUrl = 'market://details?id=com.bustracker',
}: AppUpdateModalProps) {
  
  const handleUpdate = () => {
    Linking.openURL(playStoreUrl).catch(() => {
      console.warn('Could not open Play Store');
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={S.overlay}>
        <View style={S.card}>
          <View style={S.iconCircle}>
            <Ionicons name="cloud-download" size={32} color={Colors.white} />
          </View>
          
          <Text style={S.title}>Update Available!</Text>
          <Text style={S.message}>
            A new and improved version of the DUK Bus Tracker is available. Update now to get the latest features and bug fixes.
          </Text>
          
          <TouchableOpacity style={S.updateBtn} onPress={handleUpdate} activeOpacity={0.8}>
            <Text style={S.updateBtnText}>Update Now</Text>
            <Ionicons name="open-outline" size={18} color={Colors.white} />
          </TouchableOpacity>
          
          {!forceUpdate && onDismiss && (
            <TouchableOpacity style={S.laterBtn} onPress={onDismiss}>
              <Text style={S.laterBtnText}>Maybe Later</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: Colors.mint,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.black,
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: Colors.medGray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  updateBtn: {
    flexDirection: 'row',
    backgroundColor: Colors.mint,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: 8,
    shadowColor: Colors.mint,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  updateBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  laterBtn: {
    marginTop: 16,
    paddingVertical: 8,
  },
  laterBtnText: {
    color: Colors.lightGray,
    fontSize: 14,
    fontWeight: '600',
  },
});
