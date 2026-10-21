# DUK Bus Tracker - Mobile App

A high-performance, real-time React Native application for tracking the Digital University Kerala (DUK) bus. It features live sub-second GPS tracking, predictive ETAs, offline schedules, and smooth road-snapped route animations.

---

## 🌟 Key Features

*   **Real-Time WebSocket Tracking**: Bypasses traditional HTTP polling by maintaining a persistent WebSocket connection, enabling ultra-fast live location updates while drastically reducing battery and network consumption.
*   **OSRM Route Animation**: Utilizes the Open Source Routing Machine (OSRM) to calculate exact physical road geometries. Instead of the bus icon "flying" over buildings, it curves naturally along the road at 60fps.
*   **Dual-Polling Fallback**: If the WebSocket connection drops (e.g., passing through a dead zone), the app intelligently falls back to optimized HTTP polling, instantly recovering once the connection is stable.
*   **Predictive ML ETAs**: Displays real-time estimated times of arrival calculated using live speed, traffic delays, and historical models.
*   **Intelligent State Management**: Automatically switches UI context between "Active Trip", "Deviated Off-Schedule", "Cancelled", and "Connecting" modes.
*   **Push Notifications**: Integrated with Firebase Cloud Messaging (FCM) to receive instant alerts about delays, breakdowns, or schedule changes.

## 🏗 Architecture Overview

The app is designed with a **heavy-frontend / light-backend** philosophy to ensure massive scalability and a premium user experience.

1.  **Hardware Ping**: The physical IoT tracker sends a GPS point to the FastAPI backend.
2.  **WebSocket Broadcast**: The backend instantly broadcasts this coordinate to all connected Android apps over `wss://`.
3.  **App Interception**: The `RouteViewScreen` component receives the WebSocket message and intercepts it before drawing.
4.  **OSRM Calculation**: The `GPSAnimator` sends the *previous* location and the *new* location to the routing API to get the exact road curvature between the points.
5.  **GPU Animation**: The app uses native `requestAnimationFrame` to slide the bus icon smoothly along the road geometry at 60 frames per second.

## 🛠 Tech Stack

*   **Framework**: React Native (TypeScript)
*   **Maps**: MapLibre GL (`@maplibre/maplibre-react-native`) for vector tiles and high-performance map rendering.
*   **Routing & Math**: Custom `GPSAnimator` and `TrailManager` for OSRM interpolation and Haversine distance calculations.
*   **Authentication**: Google Sign-In & JWT based sessions.
*   **Push Notifications**: Firebase Cloud Messaging (FCM).

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18+)
*   Android Studio & SDK 34
*   Java Development Kit (JDK) 17

### Installation

1. Clone the repository and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Setup environment variables:
   Ensure your Firebase `google-services.json` is placed inside `android/app/`.

### Running Locally

To run the app directly on a connected physical device with live-reload (recommended for debugging):
```bash
npm run android
```

### Building the Release APK

To compile the highly optimized production APK:
```bash
# Set your Java Home if necessary
$env:NODE_OPTIONS = "--max-old-space-size=8192"
cd android
./gradlew assembleRelease
cd ..
```
The APK will be generated at: `android/app/build/outputs/apk/release/app-universal-release.apk`

## 🗂 Key Directories

*   `/src/screens/RouteViewScreen.tsx`: The heart of the app. Handles the map, the WebSocket connection, the polling interval, and the UI states.
*   `/src/utils/gpsAnimator.ts`: The logic engine that interpolates GPS points and requests OSRM geometries for smooth animation.
*   `/src/utils/trailManager.ts`: Manages the blue "trail" line behind the bus, dynamically snapping it to the route and cleaning up old points.
*   `/src/services/api.ts`: Centralized Axios HTTP client and WebSocket URI builder.

## 🔋 Optimization Details
*   **Memory Management**: The `TrailManager` enforces a strict `MAX_TRAIL_COORDS` limit (2000 points) to prevent the MapLibre layer from causing out-of-memory (OOM) crashes on long trips.
*   **Throttling**: The HTTP polling slows down to a 30-second heartbeat when the WebSocket is active, preventing unnecessary REST calls while keeping ETA data fresh.
*   **Asset Caching**: Uses Fresco to cache and handle complex GIFs and images seamlessly.

---
*Built with precision for the students and faculty of Digital University Kerala.*
