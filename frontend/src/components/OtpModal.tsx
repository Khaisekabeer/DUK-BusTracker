/**
 * OtpModal.tsx
 * Reusable modal component for 6-digit email OTP verification.
 * Includes shake animation, resend timer, and token storage logic.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import Colors from '../theme/colors';
import { authApi } from '../services/api';
import { saveToken, saveUser } from '../services/storage';

const CODE_LENGTH = 6;

type OtpModalProps = {
  visible: boolean;
  onClose: () => void;
  email: string;
  name: string;
  boardingPointId: number;
  navigation: any;
};

export default function OtpModal({
  visible,
  onClose,
  email,
  name,
  boardingPointId,
  navigation,
}: OtpModalProps) {
  const [otp, setOtp] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [otpError, setOtpError] = useState('');
  const [resendTimer, setResendTimer] = useState(30);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);

  const otpInputRefs = useRef<(TextInput | null)[]>(Array(CODE_LENGTH).fill(null));
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    setOtp(Array(CODE_LENGTH).fill(''));
    setOtpError('');
    setResendTimer(30);
    setOtpVerified(false);
  }, [visible]);

  useEffect(() => {
    if (!visible || resendTimer <= 0) return;
    const id = setInterval(() => setResendTimer(t => t - 1), 1000);
    return () => clearInterval(id);
  }, [visible, resendTimer]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleOtpChange = (text: string, index: number) => {
    setOtpError('');
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);

    if (digit && index < CODE_LENGTH - 1) {
      otpInputRefs.current[index + 1]?.focus();
    }
    if (!digit && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const enteredCode = otp.join('');
  const isOtpComplete = enteredCode.length === CODE_LENGTH && otp.every(d => d !== '');

  const handleVerifyOtp = async () => {
    if (!isOtpComplete) return;
    setOtpLoading(true);
    setOtpError('');

    try {
      const response = await authApi.verify(email, enteredCode);
      const { access_token, user } = response.data;

      await saveToken(access_token);
      await saveUser(user);

      setOtpVerified(true);
      Animated.spring(successScale, {
        toValue: 1,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }).start();

      setTimeout(() => {
        onClose();
        navigation?.reset({
          index: 0,
          routes: [{ name: 'RouteView', params: { name: name.trim() } }],
        });
      }, 1000);
    } catch (err: any) {
      setOtpError(err.response?.data?.detail || 'Incorrect code. Please try again.');
      shake();
      setOtp(Array(CODE_LENGTH).fill(''));
      setTimeout(() => otpInputRefs.current[0]?.focus(), 50);
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    setResendTimer(30);
    setOtp(Array(CODE_LENGTH).fill(''));
    setOtpError('');
    setTimeout(() => otpInputRefs.current[0]?.focus(), 50);

    try {
      await authApi.register(name.trim(), email, boardingPointId);
    } catch (err) {
      console.error('Resend failed', err);
    }
  };

  const maskedEmail = (() => {
    const parts = email.split('@');
    const userPart = parts[0] || '';
    const domainPart = parts[1] || 'duk.ac.in';
    const visibleChars = userPart.slice(0, 3);
    return `${visibleChars}***@${domainPart}`;
  })();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={S.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', alignItems: 'center' }}>
          <View style={S.modalCard}>
            <TouchableOpacity style={S.modalCloseBtn} onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={Colors.medGray} />
            </TouchableOpacity>

            <View style={S.iconWrap}>
              <Ionicons name="mail-open-outline" size={28} color={Colors.mintDark} />
            </View>

            <Text style={S.cardHeading}>Check your email</Text>
            <Text style={S.cardSub}>
              We sent a 6-digit code to{'\n'}
              <Text style={S.emailHighlight}>{maskedEmail}</Text>
            </Text>

            {/* OTP Boxes */}
            <Animated.View style={[S.otpRow, { transform: [{ translateX: shakeAnim }] }]}>
              {otp.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={r => { otpInputRefs.current[i] = r; }}
                  style={[
                    S.otpBox,
                    digit ? S.otpBoxFilled : null,
                    otpError ? S.otpBoxError : null,
                    otpVerified ? S.otpBoxSuccess : null,
                  ]}
                  value={digit}
                  onChangeText={t => handleOtpChange(t, i)}
                  onKeyPress={e => handleOtpKeyPress(e, i)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                  textAlign="center"
                />
              ))}
            </Animated.View>

            {otpError ? (
              <View style={S.errorRow}>
                <Ionicons name="alert-circle-outline" size={14} color={Colors.danger} />
                <Text style={S.errorText}>{otpError}</Text>
              </View>
            ) : null}

            {otpVerified && (
              <Animated.View style={[S.successBadge, { transform: [{ scale: successScale }] }]}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.mintDark} />
                <Text style={S.successText}>Verified! Redirecting…</Text>
              </Animated.View>
            )}

            <TouchableOpacity
              style={[S.verifyBtn, (!isOtpComplete || otpVerified || otpLoading) && S.verifyBtnDisabled]}
              onPress={handleVerifyOtp}
              disabled={!isOtpComplete || otpVerified || otpLoading}
              activeOpacity={0.75}
            >
              {otpLoading ? (
                <ActivityIndicator size="small" color={Colors.black} />
              ) : (
                <>
                  <Text style={S.verifyBtnText}>Verify Code</Text>
                  <Ionicons name="arrow-forward" size={18} color={Colors.black} />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={S.resendRow}
              onPress={handleResendOtp}
              disabled={resendTimer > 0}
              activeOpacity={0.7}
            >
              <Text style={S.resendLabel}>Didn't receive it? </Text>
              <Text style={[S.resendAction, resendTimer > 0 && S.resendActionDisabled]}>
                {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend code'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  modalOverlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  modalCard:             { width: '100%', backgroundColor: Colors.white, borderRadius: 24, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.2, shadowRadius: 30, elevation: 20, alignItems: 'center', position: 'relative' },
  modalCloseBtn:         { position: 'absolute', top: 16, right: 16, padding: 6, borderRadius: 16, backgroundColor: Colors.bgGray },
  iconWrap:              { width: 56, height: 56, borderRadius: 18, backgroundColor: Colors.mintLighter, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  cardHeading:           { fontSize: 22, fontWeight: '800', color: Colors.black, marginBottom: 4, textAlign: 'center' },
  cardSub:               { fontSize: 13, color: Colors.medGray, marginBottom: 20, textAlign: 'center' },
  emailHighlight:        { color: Colors.black, fontWeight: '700' },
  otpRow:                { flexDirection: 'row', gap: 8, marginBottom: 16, marginTop: 8 },
  otpBox:                { width: 40, height: 50, borderWidth: 2, borderColor: Colors.border, borderRadius: 12, fontSize: 20, fontWeight: '700', color: Colors.black, backgroundColor: Colors.mint50 },
  otpBoxFilled:          { borderColor: Colors.mint, backgroundColor: Colors.white },
  otpBoxError:           { borderColor: Colors.danger, backgroundColor: '#fff5f5' },
  otpBoxSuccess:         { borderColor: Colors.mintDark, backgroundColor: Colors.mintLighter },
  errorRow:              { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  errorText:             { fontSize: 13, color: Colors.danger, fontWeight: '500' },
  successBadge:          { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.mintLighter, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginBottom: 12 },
  successText:           { fontSize: 14, color: Colors.mintText, fontWeight: '600' },
  verifyBtn:             { width: '100%', height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.mint, borderRadius: 14, marginTop: 8 },
  verifyBtnDisabled:     { opacity: 0.45 },
  verifyBtnText:         { fontSize: 16, fontWeight: '700', color: Colors.black },
  resendRow:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  resendLabel:           { fontSize: 13, color: Colors.medGray },
  resendAction:          { fontSize: 13, color: Colors.mintDark, fontWeight: '700' },
  resendActionDisabled:  { color: Colors.lightGray },
});
