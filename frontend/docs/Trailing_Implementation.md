# Trailing Implementation Documentation

This document explains how the bus trailing (tracking and progress) logic is implemented in the DUK-BusTracker application, specifically within the `RouteViewScreen`.

The application uses two distinct visualizations for the bus journey:
1. **Route View (Timeline)**
2. **Map View (Interactive Map)**

---

## 1. Route View Trailing (Timeline)

In the list-based "Route View," the trailing effect visually shows the bus progressing between two stops on a timeline using a calculated percentage.

### How it works:

*   **Distance Calculation:** The app calculates the total geographical distance between the *current stop* and the *next stop* using the Haversine formula (`haversineDistKm`). 
*   **Progress Percentage:** It constantly measures the distance between the *bus's current live location* and the *next stop*. The progress is calculated as:
    ```javascript
    const progress = 1.0 - (distance_remaining / total_distance);
    ```
*   **UI Rendering:** 
    *   **Track Line Filling:** The vertical line connecting the two stops has an active overlay (`S.trackLineActiveOverlay`). Its height is dynamically set via inline styling to match the progress:
        ```javascript
        { height: `${item.progress * 100}%` }
        ```
    *   **Bus Icon Movement:** A pulsing bus badge is positioned absolutely on the track. Its vertical `marginTop` updates dynamically based on the same progress calculation, sliding it down exactly in sync with the filled line.

---

## 2. Map View Trailing (MapLibre)

In the "Map View," the trailing is a physical line drawn on the map that follows behind the bus icon. It requires smooth animation and historical tracking, which is managed by two utility classes: `GPSAnimator` and `TrailManager`.

### How it works:

*   **Historical Trace (`/current_trace`):** On load, the app fetches the historical GPS coordinates (snapped to roads) for the current trip from the backend API to initialize the trail.
*   **Live Animation (`GPSAnimator`):** As new coordinates stream in via WebSocket, they are fed into `GPSAnimator.pushPoint()`. The animator smooths out the movement of the bus icon so it doesn't just teleport from point to point.
*   **Committing Segments (`TrailManager`):** As the `GPSAnimator` finishes smoothly moving the bus across a segment, the `onSegmentFinished` callback is triggered. This segment is passed to `TrailManager.commitSegment()`, permanently appending it to the trail history. 
*   **Live Trail Rendering:** To make the trail perfectly stick to the back of the moving bus, the app queries `getLiveTrail(animDrawnPath)`. This seamlessly stitches the historical committed trail together with the tiny, actively animating segment.
*   **Map Rendering:** The resulting array of coordinates is formatted as a GeoJSON `LineString` and rendered onto the map using MapLibre's `<GeoJSONSource>` and a `<Layer type="line">` element.

---
*Created automatically to document DUK-BusTracker trailing and map animation logic.*
