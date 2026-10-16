/**
 * ProfileSetupScreen.tsx
 * Screen 1 — Login. Email OTP or Google.
 * Shows OTP modal as a popup on the same screen after submit.
 */

import React, { useState, useRef, useEffect } from 'react';
import { authApi } from '../services/api';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Animated,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  LayoutAnimation,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '../theme/colors';
import OtpModal from '../components/OtpModal';

// @react-native-google-signin/google-signin
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { saveToken, saveUser, saveRefreshToken } from '../services/storage';
import { registerForPushNotificationsAsync } from '../services/firebaseService';

const EMAIL_DOMAINS = ['@duk.ac.in', '@iitmk.ac.in'];

GoogleSignin.configure({
  webClientId: '156522756954-qs15rjov8ka7dj74vojs23ldmts43qk6.apps.googleusercontent.com',
});

export default function ProfileSetupScreen({ navigation }: any) {
  const emailRef = useRef<TextInput>(null);

  const [emailPrefix, setEmailPrefix]       = useState('');
  const [name, setName]                     = useState('');
  const [selectedDomain, setSelectedDomain] = useState(EMAIL_DOMAINS[0]);
  const [domainDropOpen, setDomainDropOpen] = useState(false);
  
  const [loading, setLoading]               = useState(false);
  const [googleLoading, setGoogleLoading]   = useState(false);
  const [errorMsg, setErrorMsg]             = useState('');

  const [otpModalVisible, setOtpModalVisible] = useState(false);

  // Animations
  const cardScale   = useRef(new Animated.Value(0.95)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardY       = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(cardScale,   { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(cardY,       { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [cardOpacity, cardScale, cardY]);

  const fullEmail = `${emailPrefix.trim().toLowerCase()}${selectedDomain}`;

  // Validation
  const prefixOk = emailPrefix.trim().length > 0 && !/[^a-zA-Z0-9._-]/.test(emailPrefix.trim());
  const emailErr = emailPrefix.length > 0 && !prefixOk;
  const nameOk   = name.trim().length > 0;
  const formValid = prefixOk && nameOk;

  const toggleDomainDrop = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDomainDropOpen(prev => !prev);
  };

  const selectDomain = (d: string) => {
    setSelectedDomain(d);
    setDomainDropOpen(false);
  };

  const handleContinue = async () => {
    if (!formValid) return;
    setErrorMsg('');
    setLoading(true);

    try {
      await authApi.register(name.trim(), fullEmail, null);
      setOtpModalVisible(true);
    } catch (err: any) {
      const detail = err.response?.data?.detail || '';
      if (detail.toLowerCase().includes('already') || detail.toLowerCase().includes('registered')) {
        setOtpModalVisible(true);
      } else {
        setErrorMsg(detail || 'Failed to register. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setGoogleLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      // @ts-ignore
      const idToken = userInfo.data?.idToken || userInfo.idToken;
      
      if (!idToken) {
        throw new Error('No ID token received from Google');
      }

      // Exchange credential with backend
      const res = await authApi.googleLogin(idToken);
      
      // Store tokens and user
      const { access_token, refresh_token, user } = res.data;
      await saveToken(access_token);
      if (refresh_token) {
        await saveRefreshToken(refresh_token);
      }
      await saveUser(user);

      // Register FCM Token
      registerForPushNotificationsAsync();

      // Navigate home
      navigation.replace('RouteView');

    } catch (error: any) {
      console.log('Google Sign-In Error:', error);
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // user cancelled
      } else if (error.code === statusCodes.IN_PROGRESS) {
        // operation already in progress
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setErrorMsg('Play Services not available.');
      } else {
        setErrorMsg(error.response?.data?.detail || error.message || 'Google Sign-In failed.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <SafeAreaView style={S.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={S.root}>
        <ScrollView
          contentContainerStyle={S.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* Logo Header Container */}
          <View style={S.logoContainer}>
            <Image
              source={require('../../duklogo.png')}
              style={S.logo}
              resizeMode="contain"
            />
          </View>

          <Animated.View style={[S.card, { opacity: cardOpacity, transform: [{ scale: cardScale }, { translateY: cardY }] }]}>

            <Text style={S.cardHeading}>Login</Text>
            <Text style={S.cardSub}>Use your university email </Text>

            {/* Name field */}
            <View style={[S.formGroup, { zIndex: 3 }]}>
              <Text style={S.formLabel}>Name</Text>
              <View style={[S.emailRow, nameOk && S.emailRowFilled]}>
                <TextInput
                  style={S.emailPrefixInput}
                  placeholderTextColor={Colors.medGray}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                />
              </View>
            </View>

            {/* Email field */}
            <View style={[S.formGroup, { zIndex: domainDropOpen ? 50 : 2 }]}>
              <Text style={S.formLabel}>Email</Text>
              <View style={[
                S.emailRow,
                prefixOk && S.emailRowFilled,
                emailErr && S.emailRowError,
              ]}>
                <TextInput
                  ref={emailRef}
                  style={S.emailPrefixInput}
                  placeholderTextColor={Colors.medGray}
                  value={emailPrefix}
                  onChangeText={setEmailPrefix}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="done"
                  autoCorrect={false}
                  onSubmitEditing={handleContinue}
                />
                <TouchableOpacity
                  style={S.domainSelector}
                  onPress={toggleDomainDrop}
                  activeOpacity={0.7}
                >
                  <Text style={S.domainSelectorText}>{selectedDomain}</Text>
                  <Ionicons
                    name={domainDropOpen ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={Colors.mintDark}
                  />
                </TouchableOpacity>
              </View>
              {emailErr && (
                <Text style={S.errorHint}>Only letters, numbers, dots, hyphens and underscores</Text>
              )}
              {prefixOk && (
                <View style={S.domainBadge}>
                  <Ionicons name="shield-checkmark" size={12} color={Colors.mintDark} />
                  <Text style={S.domainBadgeText}>Verified domain</Text>
                </View>
              )}

              {domainDropOpen && (
                <View style={S.domainDropdown}>
                  {EMAIL_DOMAINS.map(d => (
                    <TouchableOpacity
                      key={d}
                      style={[S.domainOption, selectedDomain === d && S.domainOptionActive]}
                      onPress={() => selectDomain(d)}
                      activeOpacity={0.7}
                    >
                      <Text style={[S.domainOptionText, selectedDomain === d && S.domainOptionTextActive]}>{d}</Text>
                      {selectedDomain === d && <Ionicons name="checkmark" size={16} color={Colors.mintDark} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {errorMsg ? (
              <Text style={{ color: Colors.danger, fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
                {errorMsg}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[S.continueBtn, (!formValid || loading) && S.continueBtnDisabled]}
              onPress={handleContinue}
              disabled={!formValid || loading}
              activeOpacity={0.7}
            >
              {loading ? (
                <ActivityIndicator size="small" color={Colors.black} />
              ) : (
                <>
                  <Text style={S.continueBtnText}>Send Verification Code</Text>
                  <Ionicons name="arrow-forward" size={18} color={Colors.black} />
                </>
              )}
            </TouchableOpacity>

            <View style={S.dividerRow}>
              <View style={S.dividerLine} />
              <Text style={S.dividerText}>or continue with Google</Text>
              <View style={S.dividerLine} />
            </View>

            <TouchableOpacity
              style={S.googleBtn}
              onPress={handleGoogleSignIn}
              disabled={googleLoading}
              activeOpacity={0.7}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color={Colors.black} />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color={Colors.black} />
                  <Text style={S.googleBtnText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

          </Animated.View>

          {/* Developed by CAN Lab */}
          <View style={{ marginTop: 16, alignItems: 'center', gap: 6, opacity: 0.7 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.medGray, textTransform: 'uppercase', letterSpacing: 0.5 }}>Developed by</Text>
            <Image source={require('../../canlab.png')} style={{ height: 55, width: 120 }} resizeMode="contain" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <OtpModal
        visible={otpModalVisible}
        onClose={() => setOtpModalVisible(false)}
        email={fullEmail}
        name={name.trim()}
        boardingPointId={0}
        navigation={navigation}
      />
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safeArea:              { flex: 1, backgroundColor: Colors.white },
  root:                  { flex: 1, backgroundColor: Colors.white },
  scrollContent:         { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 20 },
  
  // Logo styling
  logoContainer:         { alignItems: 'center', justifyContent: 'center', paddingTop: 10, paddingBottom: 24 },
  logo:                  { width: 170, height: 80 },

  card:                  { width: '100%', backgroundColor: Colors.white, borderRadius: 24, paddingHorizontal: 20, paddingTop: 28, paddingBottom: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 30, elevation: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  cardHeading:           { fontSize: 22, fontWeight: '800', color: Colors.black, marginBottom: 4, textAlign: 'center' },
  cardSub:               { fontSize: 13, color: Colors.medGray, marginBottom: 24, textAlign: 'center' },
  
  formGroup:             { marginBottom: 18, position: 'relative' },
  formLabel:             { fontSize: 13, fontWeight: '600', color: Colors.black, marginBottom: 8 },
  
  // Email row
  emailRow:              { height: 52, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border, borderRadius: 14, backgroundColor: Colors.white, overflow: 'hidden' },
  emailRowFilled:        { borderColor: Colors.mint },
  emailRowError:         { borderColor: Colors.danger },
  emailPrefixInput:      { flex: 1, height: '100%', paddingHorizontal: 16, fontSize: 15, color: Colors.black },
  domainSelector:        { height: '100%', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 6, borderLeftWidth: 1, borderLeftColor: Colors.border, backgroundColor: 'rgba(162, 215, 195, 0.08)' },
  domainSelectorText:    { fontSize: 13, fontWeight: '600', color: Colors.mintText },
  domainDropdown:        { position: 'absolute', top: 82, right: 0, backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 20, zIndex: 100, minWidth: 160, overflow: 'hidden' },
  domainOption:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
  domainOptionActive:    { backgroundColor: Colors.mintLighter },
  domainOptionText:      { fontSize: 14, color: Colors.darkGray },
  domainOptionTextActive:{ fontWeight: '700', color: Colors.mintText },
  domainBadge:           { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  domainBadgeText:       { fontSize: 11, color: Colors.mintDark, fontWeight: '600' },

  errorHint:             { fontSize: 12, color: Colors.danger, marginTop: 6, fontWeight: '500' },

  continueBtn:           { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.mint, borderRadius: 16, marginTop: 8 },
  continueBtnDisabled:   { opacity: 0.45 },
  continueBtnText:       { fontSize: 16, fontWeight: '700', color: Colors.black },

  dividerRow:            { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20, paddingHorizontal: 8 },
  dividerLine:           { flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.1)' },
  dividerText:           { fontSize: 12, color: Colors.medGray, fontWeight: '500' },

  googleBtn:             { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.white, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 16 },
  googleBtnText:         { fontSize: 15, fontWeight: '600', color: Colors.black },
});
