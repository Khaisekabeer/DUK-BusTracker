/**
 * DrawerMenu.tsx
 * Custom animated side drawer that slides from the left.
 * Contains the SettingsScreen content.
 * Used across the app via DrawerContext.
 */

import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Dimensions,
  ScrollView,
  Image,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createNavigationContainerRef } from '@react-navigation/native';
import Colors from '../theme/colors';
import { getUser } from '../services/storage';

export const navigationRef = createNavigationContainerRef<any>();

const DRAWER_WIDTH = Dimensions.get('window').width * 0.8;

// ── Context ────────────────────────────────────────────────────────────────
type DrawerContextType = { openDrawer: () => void; closeDrawer: () => void };
const DrawerContext = createContext<DrawerContextType>({ openDrawer: () => {}, closeDrawer: () => {} });
export const useDrawer = () => useContext(DrawerContext);

// ── Provider + Drawer ──────────────────────────────────────────────────────
export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const [tripType, setTripType] = useState<'Morning' | 'Evening'>('Morning');
  const [user, setUser] = useState<any>(null);

  const openDrawer = useCallback(() => {
    getUser().then((u: any) => { if (u) setUser(u); });
    setVisible(true);
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
      Animated.timing(overlayOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start();
  }, [slideAnim, overlayOpacity]);

  const closeDrawer = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: -DRAWER_WIDTH, duration: 250, useNativeDriver: true }),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => setVisible(false));
  }, [slideAnim, overlayOpacity]);

  return (
    <DrawerContext.Provider value={{ openDrawer, closeDrawer }}>
      <View style={{ flex: 1 }}>
        {children}

        {/* Overlay + Drawer */}
        {visible && (
          <>
            <TouchableWithoutFeedback onPress={closeDrawer}>
              <Animated.View style={[S.overlay, { opacity: overlayOpacity }]} />
            </TouchableWithoutFeedback>

            <Animated.View style={[S.drawer, { paddingTop: insets.top, transform: [{ translateX: slideAnim }] }]}>
              {/* Drawer header */}
              <View style={S.drawerHeader}>
                <View style={S.userSection}>
                  <View style={S.avatarBadge}>
                    <Text style={S.avatarText}>
                      {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                    </Text>
                  </View>
                  <View style={S.userInfo}>
                    <Text style={S.userName} numberOfLines={1}>{user?.name || 'DUK User'}</Text>
                    <Text style={S.userEmail} numberOfLines={1}>{user?.email || 'user@duk.ac.in'}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={closeDrawer} style={S.closeBtn}>
                  <Ionicons name="close" size={24} color={Colors.black} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.drawerContent}>
                <Text style={S.menuTitle}>NAVIGATION</Text>
                <TouchableOpacity 
                  style={S.menuItem} 
                  onPress={() => {
                    closeDrawer();
                    navigationRef?.navigate('Settings');
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="settings-outline" size={22} color={Colors.mintDark} />
                  <Text style={S.menuItemText}>Settings</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.medGray} />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={S.menuItem} 
                  onPress={() => {
                    closeDrawer();
                    navigationRef?.navigate('Settings');
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chatbubbles-outline" size={22} color={Colors.mintDark} />
                  <Text style={S.menuItemText}>Feedback & Suggestions</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.medGray} />
                </TouchableOpacity>


              </ScrollView>
            </Animated.View>
          </>
        )}
      </View>
    </DrawerContext.Provider>
  );
}

const S = StyleSheet.create({
  overlay:              { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  drawer:               { position: 'absolute', top: 0, bottom: 0, left: 0, width: DRAWER_WIDTH, backgroundColor: Colors.bgGray, shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 24 },
  drawerHeader:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.separator, justifyContent: 'space-between' },
  userSection:          { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarBadge:          { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.mint, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  avatarText:           { fontSize: 16, fontWeight: '800', color: Colors.mintText },
  userInfo:             { flex: 1, marginRight: 8 },
  userName:             { fontSize: 15, fontWeight: '800', color: Colors.black },
  userEmail:            { fontSize: 12, color: Colors.medGray },
  closeBtn:             { padding: 4, alignSelf: 'center' },
  drawerContent:        { paddingHorizontal: 16, paddingTop: 16 },
  menuTitle:            { fontSize: 11, fontWeight: '800', color: Colors.lightGray, letterSpacing: 1.2, marginBottom: 12, marginLeft: 4 },
  menuItem:             { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, marginBottom: 4 },
  menuItemText:         { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.black, marginLeft: 12 },
});
