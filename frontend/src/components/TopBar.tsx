/**
 * TopBar.tsx — DUK Bus Tracker Android
 * Mirrors PWA TopBar exactly:
 *   Left  → hamburger / back button (44×44)
 *   Center → DUK logo + CanLab logo, absolutely centered (gap 80px, height 50px)
 *   Right  → notification bell (44×44) → bottom-sheet popup
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import Colors from '../theme/colors';
import { useDrawer } from './DrawerMenu';
import NotificationPopup from './NotificationPopup';

type TopBarProps = {
  showBack?: boolean;
  onBack?: () => void;
  title?: string | null;
  showNotification?: boolean;
};

export default function TopBar({ showBack, onBack, title, showNotification }: TopBarProps) {
  const { openDrawer } = useDrawer();
  const [notifOpen, setNotifOpen] = useState(false);

  // If title is passed, default showNotification to false unless explicitly true
  const displayBell = typeof showNotification === 'boolean' ? showNotification : !title;

  return (
    <View style={S.topBar}>
      {/* Left — hamburger or back */}
      <View style={S.side}>
        {showBack ? (
          <TouchableOpacity style={S.iconBtn} onPress={onBack} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={Colors.darkGray} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={S.iconBtn} onPress={openDrawer} activeOpacity={0.7}>
            <Ionicons name="menu-outline" size={24} color={Colors.darkGray} />
          </TouchableOpacity>
        )}
      </View>

      {/* Center — title if supplied, otherwise logos */}
      {title ? (
        <View style={S.centerTitleContainer} pointerEvents="none">
          <Text style={S.centerTitleText}>{title}</Text>
        </View>
      ) : (
        <View style={S.center} pointerEvents="none">
          <Image source={require('../../duklogo.png')} style={S.logoDuk} resizeMode="contain" />
          <Image source={require('../../canlab.png')}  style={S.logoCanlab} resizeMode="contain" />
        </View>
      )}

      {/* Right — notification bell or spacer */}
      <View style={S.side}>
        {displayBell ? (
          <TouchableOpacity style={S.iconBtn} onPress={() => setNotifOpen(true)} activeOpacity={0.7}>
            <Ionicons name="notifications-outline" size={22} color={Colors.gold} />
          </TouchableOpacity>
        ) : (
          <View style={S.iconBtn} />
        )}
      </View>

      <NotificationPopup visible={notifOpen} onClose={() => setNotifOpen(false)} />
    </View>
  );
}

const S = StyleSheet.create({
  /* PWA: height: 56px, padding: 0 4px, bg: white, border-bottom: 1px var(--separator) */
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
    zIndex: 10,
  },
  /* PWA: each side is just the icon button — fixed 44px */
  side: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* PWA: .topbar__center — absolute, centered, gap 80px */
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 80,
    zIndex: -1,
  },
  centerTitleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: -1,
  },
  centerTitleText: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.black,
  },
  /* PWA: .topbar__icon-btn — 44×44, border-radius 16 */
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  /* PWA: .topbar__logo-img — height: 50px */
  logoDuk:    { height: 50, width: 110 },
  logoCanlab: { height: 50, width:  90 },
});
