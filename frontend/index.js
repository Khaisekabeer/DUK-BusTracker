/**
 * @format
 */

import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';

// Register background handler — guarded to prevent crash if native module isn't ready
try {
  if (messaging && typeof messaging === 'function') {
    messaging().setBackgroundMessageHandler(async remoteMessage => {
      console.log('[FCM] Message handled in the background!', remoteMessage);
    });
  }
} catch (e) {
  console.warn('[FCM] Could not register background handler:', e);
}

AppRegistry.registerComponent(appName, () => App);
