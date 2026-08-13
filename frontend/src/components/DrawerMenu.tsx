/**
 * DrawerMenu.tsx — DUK Bus Tracker Android
 * Animated side drawer that slides from the left.
 * Layout matches the PWA DrawerMenu.jsx:
 *  - Header: DUK logo (left) + Close button (right)
 *  - Profile card: name + email on mint-50 background
 *  - Nav items: Settings, Help, Send Feedback, About
 *  - Footer: version string
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
  TextInput,
  Modal,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createNavigationContainerRef } from '@react-navigation/native';
import Colors from '../theme/colors';
import { getUser } from '../services/storage';
import { suggestionApi } from '../services/api';
import AboutModal from './AboutModal';

export const navigationRef = createNavigationContainerRef<any>();

const DRAWER_WIDTH = Dimensions.get('window').width * 0.70;

// ── Context ────────────────────────────────────────────────────────────────
type DrawerContextType = { openDrawer: () => void; closeDrawer: () => void };
const DrawerContext = createContext<DrawerContextType>({ openDrawer: () => {}, closeDrawer: () => {} });
export const useDrawer = () => useContext(DrawerContext);

// ── Suggestions Mini-Modal ──────────────────────────────────────────────────
function SuggestionsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await suggestionApi.submit(text.trim());
      setSent(true);
      setTimeout(() => { setSent(false); setText(''); onClose(); }, 1500);
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={SM.overlay}>
        <TouchableOpacity style={SM.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={SM.sheet}>
          <View style={SM.handle} />
          <View style={SM.header}>
            <Text style={SM.title}>Send Feedback</Text>
            <TouchableOpacity onPress={onClose} style={SM.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.black} />
            </TouchableOpacity>
          </View>
          {sent ? (
            <View style={{ padding: 32, alignItems: 'center', gap: 12 }}>
              <Ionicons name="checkmark-circle" size={48} color={Colors.mintDark} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.mintText }}>
                Thank you for your feedback!
              </Text>
            </View>
          ) : (
            <View style={{ padding: 20 }}>
              <TextInput
                style={SM.input}
                placeholder="Share your thoughts or report an issue…"
                placeholderTextColor={Colors.medGray}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={500}
                numberOfLines={5}
                textAlignVertical="top"
              />
              <Text style={SM.charCount}>{text.length}/500</Text>
              <TouchableOpacity
                style={[SM.sendBtn, (!text.trim() || sending) && SM.sendBtnDisabled]}
                onPress={handleSend}
                disabled={!text.trim() || sending}
                activeOpacity={0.7}
              >
                <Ionicons name="send" size={16} color={Colors.white} />
                <Text style={SM.sendBtnText}>{sending ? 'Sending…' : 'Send Feedback'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Provider + Drawer ──────────────────────────────────────────────────────
export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
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

        {visible && (
          <>
            <TouchableWithoutFeedback onPress={closeDrawer}>
              <Animated.View style={[S.overlay, { opacity: overlayOpacity }]} />
            </TouchableWithoutFeedback>

            <Animated.View
              style={[S.drawer, { paddingTop: insets.top, transform: [{ translateX: slideAnim }] }]}
            >
              {/* ── Header: DUK logo + close ── */}
              <View style={S.drawerHeader}>
                <Image
                  source={require('../../duklogo.png')}
                  style={S.headerLogo}
                  resizeMode="contain"
                />
                <TouchableOpacity onPress={closeDrawer} style={S.closeBtn}>
                  <Ionicons name="close" size={20} color={Colors.medGray} />
                </TouchableOpacity>
              </View>

              {/* ── Profile card ── */}
              <View style={S.profileCard}>
                <View style={S.profileInfo}>
                  <Text style={S.profileName} numberOfLines={1}>{user?.name || '—'}</Text>
                  <Text style={S.profileEmail} numberOfLines={1}>{user?.email || '—'}</Text>
                </View>
              </View>

              {/* ── Nav items ── */}
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.navContainer}>
                <TouchableOpacity
                  style={S.navItem}
                  onPress={() => { closeDrawer(); navigationRef?.navigate('Settings'); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="settings-outline" size={18} color={Colors.mintDark} style={S.navIcon} />
                  <Text style={S.navItemText}>Settings</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={S.navItem}
                  onPress={() => { closeDrawer(); /* navigate to Help */ }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="help-circle-outline" size={18} color={Colors.mintDark} style={S.navIcon} />
                  <Text style={S.navItemText}>Help</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={S.navItem}
                  onPress={() => { closeDrawer(); setSuggestionsOpen(true); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chatbubble-outline" size={18} color={Colors.mintDark} style={S.navIcon} />
                  <Text style={S.navItemText}>Send Feedback</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={S.navItem}
                  onPress={() => { closeDrawer(); setAboutOpen(true); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="information-circle-outline" size={18} color={Colors.mintDark} style={S.navIcon} />
                  <Text style={S.navItemText}>About</Text>
                </TouchableOpacity>
              </ScrollView>

              {/* ── Footer ── */}
              <View style={S.footer}>
                <Text style={S.versionText}>DUK Bus Tracker v1.0 Android</Text>
              </View>
            </Animated.View>
          </>
        )}
      </View>

      <SuggestionsModal visible={suggestionsOpen} onClose={() => setSuggestionsOpen(false)} />
      <AboutModal visible={aboutOpen} onClose={() => setAboutOpen(false)} />
    </DrawerContext.Provider>
  );
}

// ── Suggestions Modal Styles ──────────────────────────────────────────────
const SM = StyleSheet.create({
  overlay:     { flex: 1, justifyContent: 'flex-end' },
  backdrop:    { ...StyleSheet.absoluteFill as any, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:       { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '65%', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 20 },
  handle:      { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.separator, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.separator },
  title:       { fontSize: 16, fontWeight: '700', color: Colors.black },
  closeBtn:    { padding: 4 },
  input:       { borderWidth: 1.5, borderColor: Colors.borderGray, borderRadius: 12, padding: 12, fontSize: 14, color: Colors.black, minHeight: 100, backgroundColor: Colors.white },
  charCount:   { fontSize: 11, color: Colors.lightGray, textAlign: 'right', marginTop: 4, marginBottom: 12 },
  sendBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.mintDark, borderRadius: 14, paddingVertical: 13 },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});

// ── Drawer Styles ──────────────────────────────────────────────────────────
const S = StyleSheet.create({
  overlay:     { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  drawer:      { position: 'absolute', top: 0, bottom: 0, left: 0, width: DRAWER_WIDTH, backgroundColor: Colors.white, shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 24, flexDirection: 'column' },

  // Header
  drawerHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.separator },
  headerLogo:    { width: 100, height: 40 },
  closeBtn:      { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },

  // Profile card
  profileCard:   { backgroundColor: Colors.mint50, paddingHorizontal: 16, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: Colors.border },
  profileInfo:   { gap: 4 },
  profileName:   { fontSize: 15, fontWeight: '700', color: Colors.black },
  profileEmail:  { fontSize: 12, color: Colors.medGray },

  // Nav
  navContainer:  { paddingHorizontal: 8, paddingTop: 12, paddingBottom: 8 },
  navItem:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14, marginBottom: 2 },
  navIcon:       { marginRight: 12 },
  navItemText:   { fontSize: 15, fontWeight: '500', color: Colors.darkGray, flex: 1 },

  // Footer
  footer:        { paddingHorizontal: 16, paddingVertical: 16, borderTopWidth: 1, borderTopColor: Colors.separator },
  versionText:   { fontSize: 11, color: Colors.lightGray },
});
