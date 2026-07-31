# DUK Bus Tracker Code Audit Report

This report contains a detailed analysis of the `admin-dashboard` and `backend` codebases, focusing on identifying duplicate code, unused lines of code, and unnecessary logic. Per your request, no files have been modified. 

Additionally, I have included a section explaining "why and how" the key modules work, which you can use as reference for adding comments to the codebase.

## 1. Dead Code and Obsolete Files (Admin Panel)

**Finding:** The backend contains significant dead code related to an older, non-React version of the admin dashboard.
* **`backend/main.py` (Lines 73-87):** The FastAPI app mounts a static directory `static/admin` and defines endpoints returning `admin/{page}.html` via `Jinja2Templates(directory="templates")`. However, the `templates` directory no longer exists in the backend, meaning these endpoints are broken and obsolete.
* **`backend/static/admin/`:** This directory contains `admin.js`, `admin.css`, and related assets for the old dashboard. Since you now have a modern React app in `admin-dashboard/src`, these static files are unused and constitute duplicate logic.
* **Recommendation:** Delete `backend/static/admin/` and remove the static mounting and `admin_panel` routes from `backend/main.py`.

## 2. Unused Functions and Variables

**Finding:** Several helper functions are defined but never invoked anywhere in the project.
* **`backend/services/geofence.py` - `distance_to_stop`:** This function computes the Haversine distance to a stop. However, it is never called anywhere in the codebase. Both ETA and route history use `find_nearest_stop` or `get_stops_ahead` instead. 
* **Recommendation:** Remove `distance_to_stop` from `geofence.py`.

## 3. Duplicate / Overlapping Logic

**Finding:** The trip scheduling logic is somewhat duplicated between the trip lifecycle service and the tracking router.
* **`backend/routers/tracking.py` - `trip_state()`:** This function checks the database for active trips, but then implements a massive "Fallback: time-window logic" block (lines 124-139). This overlaps heavily with the logic in `backend/services/trip_lifecycle.py` (`auto_complete_expired_trips`), which also contains hardcoded time checks (660 minutes for morning, 1230 for evening).
* **Recommendation:** Centralize the time-window definitions. Instead of hardcoding `660` and `1230` in multiple places, define them as constants (e.g., `MORNING_END_MINS`, `EVENING_END_MINS`) in a shared `config` or `constants` file so that both the tracking router and the lifecycle service use the exact same logic.

## 4. Frontend Optimization (React Admin Dashboard)

**Finding:** Some duplicated structures in API calls.
* **`admin-dashboard/src/api.js`:** All `fetch` calls are cleanly wrapped in `apiFetch`, which is great. However, endpoints like `createTrip`, `cancelAdvanceTrip`, and `revokeCancelTrip` repeatedly manually structure the URL and stringify bodies. 
* **Recommendation:** While not strictly harmful, this can be slightly refactored later for cleanliness. The overall architecture of the React app is solid and well-separated.

---

## Proposed Code Comments: "Why and How It Is Used"

As requested, here are proposed comments explaining the "why and how" of key modules. You can copy/paste these directly into the respective files when you review them.

### `backend/main.py`
```python
"""
WHY IT IS USED:
This is the main entry point for the FastAPI server. It stitches together all the routers (GPS, Auth, Tracking, Admin), manages the database lifecycle, and handles CORS so the frontend apps can communicate with it.

HOW IT WORKS:
1. When the app starts, the `lifespan` context manager ensures all database tables exist.
2. It mounts the routers using `app.include_router()`.
3. It listens on port 5004 and routes incoming HTTP requests to the appropriate endpoints.
"""
```

### `backend/services/trip_lifecycle.py`
```python
"""
WHY IT IS USED:
This service is the brain of the automated trip state machine. It removes the need for drivers or admins to manually start/stop trips by inferring the bus's state directly from GPS coordinates and time windows.

HOW IT WORKS:
1. `handle_gps_update`: Every time a GPS ping is received, this checks if the bus has moved far enough from the origin (>50m) to automatically transition a 'scheduled' trip to 'on_trip'.
2. `handle_power_off`: If the hardware loses power, it checks if the bus is near the destination. If yes, it starts a 5-minute grace period to automatically mark the trip as 'completed'.
3. `auto_complete_expired_trips`: Runs periodically to forcefully close out trips that missed their completion window, preventing stale "active" trips from carrying over into the next day.
"""
```

### `backend/routers/gps.py`
```python
"""
WHY IT IS USED:
This router handles the heavy lifting of receiving raw data from the physical GPS tracking hardware on the bus and broadcasting it instantly to mobile app users.

HOW IT WORKS:
1. The hardware connects to `device_websocket` using the `GPS_API_KEY`.
2. As the hardware sends raw `QGPSLOC` strings, `process_raw_payload` parses the latitude, longitude, and speed.
3. It saves the ping to the database (GpsLog), triggers the trip lifecycle checks, and finally uses the `manager.broadcast()` to push the location to all active mobile users connected to `bus_websocket`.
"""
```

### `backend/services/geofence.py`
```python
"""
WHY IT IS USED:
Calculates distances between the bus and predefined stops to figure out where the bus is relative to the route. This is critical for predicting arrival times (ETA) and mapping route history.

HOW IT WORKS:
Uses the Haversine formula (`haversine_km`) to compute the great-circle distance between two GPS coordinates, which accounts for the curvature of the Earth and is highly accurate over short distances.
"""
```

### `admin-dashboard/src/App.jsx`
```javascript
/*
  WHY IT IS USED:
  This is the root component of the React Admin Dashboard. It manages global state like the user's authentication token and routing between different dashboard pages.

  HOW IT WORKS:
  1. Checks if `admin_token` exists in local storage. If not, it renders the <Login /> screen.
  2. Once authenticated, it renders the <DashboardShell /> which includes the navigation sidebar.
  3. Provides a global `ToastContext` so any page can trigger a success/error popup message without passing props around.
*/
```
