/**
 * NotificationPopup.tsx
 * Clean bottom-sheet notification popup — replaces the side drawer.
 * Fetches notifications from the backend and renders them as a card list.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  FlatList,
  Animated,
  Dimensions,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import Colors from '../theme/colors';
import { authApi } from '../services/api';

const SCREEN_H = Dimensions.get('window').height;
const MODAL_W  = Dimensions.get('window').width * 0.9;
const MODAL_MAX_H = SCREEN_H * 0.75;

function relativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString();
}

type Notif = { id: string; title: string; body: string; time: Date; type: 'warning' | 'success' | 'info' };

function NotifIcon({ type }: { type: Notif['type'] }) {
  const cfg = {
    warning: { name: 'warning',           color: '#f59e0b' },
    success: { name: 'checkmark-circle',  color: '#16a34a' },
    info:    { name: 'information-circle', color: '#2563eb' },
  }[type];
  return <Ionicons name={cfg.name as any} size={20} color={cfg.color} />;
}

type Props = { visible: boolean; onClose: () => void };

export default function NotificationPopup({ visible, onClose }: Props) {
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Fetch notifications
      authApi.getMyNotifications()
        .then(res => {
          const raw = res.data?.notifications ?? [];
          const formatted: Notif[] = raw.map((n: any) => ({
            id:    n.id ?? String(Math.random()),
            title: n.notification?.title ?? n.title ?? 'Notification',
            body:  n.notification?.body  ?? n.body  ?? '',
            time:  new Date(n.time ?? Date.now()),
            type:  n.type === 'eta_late' ? 'warning' : n.type === 'proximity' ? 'success' : 'info',
          })).sort((a: Notif, b: Notif) => b.time.getTime() - a.time.getTime());
          setNotifications(formatted);
        })
        .catch(() => { /* gracefully ignore */ });

      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 20, stiffness: 200 }),
        Animated.timing(overlayAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 0.95, duration: 200, useNativeDriver: true }),
        Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={S.container}>
        {/* Scrim */}
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[S.scrim, { opacity: overlayAnim }]} />
        </TouchableWithoutFeedback>

        {/* Center Modal */}
        <Animated.View style={[S.modal, { opacity: overlayAnim, transform: [{ scale: scaleAnim }] }]}>

        {/* Header */}
        <View style={S.header}>
          <View style={S.headerLeft}>
            <Ionicons name="notifications" size={20} color={Colors.black} />
            <Text style={S.headerTitle}>Notifications</Text>
          </View>
          <View style={S.headerRight}>
            {notifications.length > 0 && (
              <TouchableOpacity style={S.clearBtn} onPress={() => setNotifications([])} activeOpacity={0.7}>
                <Text style={S.clearBtnText}>Clear all</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={S.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color={Colors.medGray} />
            </TouchableOpacity>
          </View>
        </View>

        {/* List */}
        {notifications.length === 0 ? (
          <View style={S.emptyState}>
            <Ionicons name="notifications-outline" size={52} color={Colors.lightGray} />
            <Text style={S.emptyTitle}>No notifications</Text>
            <Text style={S.emptySub}>Bus alerts will appear here in real time.</Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={n => n.id}
            contentContainerStyle={S.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={S.card}>
                <View style={S.cardIconCol}>
                  <NotifIcon type={item.type} />
                </View>
                <View style={S.cardBody}>
                  <View style={S.cardTopRow}>
                    <Text style={S.cardTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={S.cardTime}>{relativeTime(item.time)}</Text>
                  </View>
                  {item.body ? <Text style={S.cardDesc} numberOfLines={2}>{item.body}</Text> : null}
                </View>
                <TouchableOpacity
                  style={S.dismissBtn}
                  onPress={() => setNotifications(p => p.filter(n => n.id !== item.id))}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={18} color={Colors.lightGray} />
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </Animated.View>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  container:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrim:      { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' } as any,
  modal:      {
    width: MODAL_W,
    maxHeight: MODAL_MAX_H,
    backgroundColor: Colors.white,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 24,
    overflow: 'hidden',
  },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.separator, backgroundColor: Colors.white },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle:{ fontSize: 17, fontWeight: '700', color: Colors.black },
  headerRight:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  clearBtn:   { backgroundColor: Colors.mintLighter, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  clearBtnText:{ fontSize: 12, fontWeight: '700', color: Colors.mintText },
  closeBtn:   { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: Colors.bgGray },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.darkGray, marginTop: 16 },
  emptySub:   { fontSize: 13, color: Colors.lightGray, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 },

  listContent:{ padding: 16, gap: 10 },
  card:       { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.bgGray, borderRadius: 14, padding: 14, gap: 12 },
  cardIconCol:{ width: 24, alignItems: 'center', paddingTop: 1 },
  cardBody:   { flex: 1 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle:  { fontSize: 14, fontWeight: '700', color: Colors.black, flex: 1, marginRight: 8 },
  cardTime:   { fontSize: 11, color: Colors.lightGray, fontWeight: '600' },
  cardDesc:   { fontSize: 13, color: Colors.medGray, lineHeight: 18 },
  dismissBtn: { paddingTop: 2 },
});
