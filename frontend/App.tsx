import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator } from 'react-native';
import { DrawerProvider, navigationRef } from './src/components/DrawerMenu';
import { getToken } from './src/services/storage';
import Colors from './src/theme/colors';

import ProfileSetupScreen from './src/screens/ProfileSetupScreen';
import OtpVerifyScreen    from './src/screens/OtpVerifyScreen';
import RouteViewScreen    from './src/screens/RouteViewScreen';
import SettingsScreen     from './src/screens/SettingsScreen';
import MapFullScreen      from './src/screens/MapFullScreen';

export type RootStackParamList = {
  ProfileSetup: undefined;
  OtpVerify:    { email: string; name: string; boardingPoint: any };
  RouteView:    { name?: string; boardingPoint?: any };
  Settings:     undefined;
  MapFull:      undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);

  useEffect(() => {
    getToken()
      .then(token  => setInitialRoute(token ? 'RouteView' : 'ProfileSetup'))
      .catch(()    => setInitialRoute('ProfileSetup'));
  }, []);

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bgGray }}>
        <ActivityIndicator size="large" color={Colors.mint} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <DrawerProvider>
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator
            initialRouteName={initialRoute}
            screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
          >
            <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
            <Stack.Screen name="OtpVerify"    component={OtpVerifyScreen} />
            <Stack.Screen name="RouteView"    component={RouteViewScreen} />
            <Stack.Screen name="Settings"     component={SettingsScreen} />
            <Stack.Screen name="MapFull"      component={MapFullScreen}
              options={{ animation: 'slide_from_bottom' }} />
          </Stack.Navigator>
        </NavigationContainer>
      </DrawerProvider>
    </SafeAreaProvider>
  );
}
