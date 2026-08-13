import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Dimensions, TouchableWithoutFeedback } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import Colors from '../theme/colors';
import { authApi } from '../services/api';

const DRAWER_WIDTH = Dimensions.get('window').width * 0.85;

function relativeTime(date: Date) {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return date.toLocaleDateString();
}

function typeFromData(type: string) {
  if (type === 'eta_late') return 'warning';
  if (type === 'proximity') return 'success';
  if (type === 'suggestion') return 'success';
  return 'info';
}

function getIcon(type: string) {
  switch (type) {
    case 'warning': return <Ionicons name="warning" size={18} color={Colors.red} />;
    case 'success': return <Ionicons name="checkmark-circle" size={18} color={Colors.green} />;
    default:        return <Ionicons name="information-circle" size={18} color={Colors.blue} />;
  }
}

export default function NotificationDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const slideAnim = React.useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
      
      authApi.getMyNotifications().then(res => {
        if (res.data?.notifications) {
          const formatted = res.data.notifications.map((n: any) => ({
            id: n.id,
            title: n.notification?.title || 'Notification',
            body: n.notification?.body || '',
            time: n.time ? new Date(n.time) : new Date(),
            type: typeFromData(n.type)
          }));
          setNotifications(formatted.sort((a: any, b: any) => b.time.getTime() - a.time.getTime()));
        }
      }).catch(err => console.log('Failed to fetch notifications', err));
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: DRAWER_WIDTH, duration: 200, useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleClearAll = () => {
    setNotifications([]);
  };

  const handleDismiss = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  if (!visible && (slideAnim as any)._value === DRAWER_WIDTH) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={S.container}>
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[S.overlay, { opacity: overlayOpacity }]} />
        </TouchableWithoutFeedback>
        <Animated.View style={[S.drawer, { transform: [{ translateX: slideAnim }] }]}>
          <View style={S.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="notifications" size={20} color={Colors.black} />
              <Text style={S.title}>Notifications</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={S.closeBtn}>
              <Ionicons name="close" size={24} color={Colors.black} />
            </TouchableOpacity>
          </View>
          
          {notifications.length > 0 && (
            <View style={S.clearRow}>
              <TouchableOpacity onPress={handleClearAll} style={S.clearBtn}>
                <Text style={S.clearBtnText}>Clear all</Text>
              </TouchableOpacity>
            </View>
          )}

          <ScrollView style={S.list} contentContainerStyle={{ padding: 16 }}>
            {notifications.length > 0 ? (
              notifications.map((n) => (
                <View key={n.id} style={S.item}>
                  <View style={S.itemHeader}>
                    {getIcon(n.type)}
                    <Text style={S.itemTitle} numberOfLines={1}>{n.title}</Text>
                    <Text style={S.itemTime}>{relativeTime(n.time)}</Text>
                  </View>
                  <Text style={S.itemBody}>{n.body}</Text>
                  <TouchableOpacity style={S.dismissBtn} onPress={() => handleDismiss(n.id)}>
                    <Ionicons name="close" size={16} color={Colors.lightGray} />
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <View style={S.empty}>
                <Ionicons name="notifications-outline" size={48} color={Colors.lightGray} />
                <Text style={S.emptyText}>No new notifications yet.</Text>
                <Text style={S.emptySub}>You'll see bus alerts here in real time.</Text>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  overlay: { ...StyleSheet.absoluteFill as any, backgroundColor: 'rgba(0,0,0,0.45)' },
  drawer: { width: DRAWER_WIDTH, backgroundColor: Colors.white, shadowColor: '#000', shadowOffset: { width: -4, height: 0 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 24, paddingTop: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.separator },
  title: { fontSize: 18, fontWeight: '700', color: Colors.black },
  closeBtn: { padding: 4 },
  clearRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 12 },
  clearBtn: { backgroundColor: Colors.mint, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  clearBtnText: { fontSize: 12, fontWeight: '700', color: Colors.white },
  list: { flex: 1 },
  item: { backgroundColor: Colors.bgGray, borderRadius: 12, padding: 14, marginBottom: 10, position: 'relative' },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, paddingRight: 24 },
  itemTitle: { fontSize: 14, fontWeight: '700', color: Colors.black, flex: 1 },
  itemTime: { fontSize: 11, color: Colors.lightGray },
  itemBody: { fontSize: 13, color: Colors.medGray, lineHeight: 18, paddingLeft: 24 },
  dismissBtn: { position: 'absolute', top: 12, right: 12, padding: 4 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 15, fontWeight: '600', color: Colors.darkGray, marginTop: 16 },
  emptySub: { fontSize: 13, color: Colors.lightGray, marginTop: 4 },
});
