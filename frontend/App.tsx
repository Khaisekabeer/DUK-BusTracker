import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator } from 'react-native';
import { DrawerProvider } from './src/components/DrawerMenu';
import { navigationRef, RootStackParamList } from './src/services/navigation';
import { getToken } from './src/services/storage';
import Colors from './src/theme/colors';

import ProfileSetupScreen from './src/screens/ProfileSetupScreen';
import OtpVerifyScreen    from './src/screens/OtpVerifyScreen';
import RouteViewScreen    from './src/screens/RouteViewScreen';
import SettingsScreen     from './src/screens/SettingsScreen';
import HelpScreen         from './src/screens/HelpScreen';
import AppUpdateModal     from './src/components/AppUpdateModal';

const Stack = createNativeStackNavigator<RootStackParamList>();

import BootSplash from 'react-native-bootsplash';

export default function App() {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);
  
  // App Update Template - set to true to test the update blocker screen
  const [updateAvailable, setUpdateAvailable] = useState(false);

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
        <NavigationContainer ref={navigationRef} onReady={() => BootSplash.hide({ fade: true })}>
          <Stack.Navigator
            initialRouteName={initialRoute}
            screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
          >
            <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
            <Stack.Screen name="OtpVerify"    component={OtpVerifyScreen} />
            <Stack.Screen name="RouteView"    component={RouteViewScreen} />
            <Stack.Screen name="Settings"     component={SettingsScreen} />
            <Stack.Screen name="Help"         component={HelpScreen} />
          </Stack.Navigator>
        </NavigationContainer>
        
        {/* App Update Template (Visible when updateAvailable is true) */}
        <AppUpdateModal 
          visible={updateAvailable} 
          forceUpdate={true} 
        />
      </DrawerProvider>
    </SafeAreaProvider>
  );
}
