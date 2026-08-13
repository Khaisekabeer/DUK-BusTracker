import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import Colors from '../theme/colors';

export default function AboutModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={S.overlay}>
        <TouchableOpacity style={S.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={S.content}>
          <TouchableOpacity onPress={onClose} style={S.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.black} />
          </TouchableOpacity>
          <View style={S.brand}>
            <Image
              source={require('../../duklogo.png')}
              style={{ height: 60, width: 140, marginBottom: 16 }}
              resizeMode="contain"
            />
            <Text style={S.title}>About the Project</Text>
          </View>
          <Text style={S.text}>
            Developed By <Text style={S.bold}>A Muhammed Khaise</Text> and <Text style={S.bold}>Aaron R</Text>{'\n'}
            as a project supervised by <Text style={S.bold}>Dr. John Eric Stephen</Text>{'\n'}
            with collaboration with <Text style={S.bold}>CAN LAB, DIGITAL UNIVERSITY KERALA</Text>.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFill as any, backgroundColor: 'rgba(0,0,0,0.5)' },
  content: { backgroundColor: Colors.white, borderRadius: 20, padding: 24, width: '85%', maxWidth: 400, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 10 },
  closeBtn: { position: 'absolute', top: 16, right: 16, padding: 4, zIndex: 2 },
  brand: { alignItems: 'center', marginBottom: 20, marginTop: 10 },
  title: { fontSize: 20, fontWeight: '800', color: Colors.black },
  text: { fontSize: 14, color: Colors.medGray, textAlign: 'center', lineHeight: 22 },
  bold: { fontWeight: '700', color: Colors.black },
});
