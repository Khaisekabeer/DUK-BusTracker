# Firebase Service Documentation

**File Path:** `frontend/src/services/firebaseService.ts`

## Overview
The `firebaseService.ts` file acts as the centralized handler for Firebase Cloud Messaging (FCM) push notifications in the DUK-BusTracker application. It relies on `@react-native-firebase/messaging` for handling notification configurations natively across both Android and iOS devices.

It provides two main capabilities:
1. **Requesting and Registering Device Tokens** - Securing permission from the user and saving the generated token to the backend API.
2. **Foreground Message Handling** - Intercepting push notifications when the application is actively running in the foreground.

---

## Functions

### 1. `registerForPushNotificationsAsync()`
Asynchronous function used to request notification permissions and register the device token with the backend service.

**Flow of Execution:**
1. **Permission Request:** Invokes `messaging().requestPermission()` to trigger the OS-level permission prompt (crucial for iOS and Android 13+).
2. **Status Check:** Verifies if the user granted full (`AUTHORIZED`) or provisional (`PROVISIONAL`) access.
3. **Token Generation:** If authorized, calls `messaging().getToken()` to fetch the unique FCM device token.
4. **Backend Sync:** Retrieves the `jwt_token` from `AsyncStorage`. If the user is authenticated, it makes an HTTP PUT request to the backend endpoint (`/api/v1/auth/device-token`) via the customized `api` service. This associates the device token with the logged-in user in the database and ensures they are opted-in to notifications (`notifications_on: true`).

**Error Handling:**
Catches and logs any configuration or network errors to the console (`console.warn`) without crashing the application flow.

---

### 2. `registerForegroundHandler()`
Sets up a listener for incoming push notifications while the app is active in the foreground.

**Flow of Execution:**
1. **Validation:** Checks if the `messaging()` object and its `onMessage` property exist to prevent crashes on unsupported devices/environments.
2. **Event Listener:** Binds an asynchronous callback to `messaging().onMessage()`.
3. **Message Handling:** Currently, it intercepts the `remoteMessage` payload and logs it to the console (`[FCM] Foreground notification received:`).

**Returns:**
Returns the unsubscribe function provided by `@react-native-firebase/messaging` allowing components (like `useEffect` hooks) to cleanly unmount the listener. If setup fails, it gracefully returns a no-op function `() => {}`.

---

## Integration Details
* **Calling Location:** Typically, `registerForPushNotificationsAsync()` should be invoked right after a successful user login or inside the root component mounting lifecycle (e.g., `App.tsx` or `RouteViewScreen.tsx`).
* **Foreground Context:** By default, Firebase does not display system notification banners when the app is in the foreground. Developers can use the payload logged in `registerForegroundHandler()` to trigger custom in-app notifications (like Toast banners, Modals, or Redux state updates) if required in future updates.

## Dependencies
* `@react-native-firebase/messaging`: Core library for handling FCM.
* `@react-native-async-storage/async-storage`: Used for safely retrieving the active JWT token required for backend authentication.
* `../services/api`: The customized Axios instance used to send the PUT request to the backend.
