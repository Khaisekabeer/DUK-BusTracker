import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DrawerProvider } from './src/components/DrawerMenu';

import ProfileSetupScreen from './src/screens/ProfileSetupScreen';
import OtpVerifyScreen from './src/screens/OtpVerifyScreen';
import RouteViewScreen from './src/screens/RouteViewScreen';

export type RootStackParamList = {
  ProfileSetup: undefined;
  OtpVerify: { email: string; name: string; boardingPoint: any };
  RouteView: { name?: string; boardingPoint?: any };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <DrawerProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="ProfileSetup"
            screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
          >
            <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
            <Stack.Screen name="OtpVerify" component={OtpVerifyScreen} />
            <Stack.Screen name="RouteView" component={RouteViewScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </DrawerProvider>
    </SafeAreaProvider>
  );
}
