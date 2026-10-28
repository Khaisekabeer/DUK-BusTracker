import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import GPSAnimator from '../utils/gpsAnimator';
import TrailManager from '../utils/trailManager';
import { getRouteSegment } from '../api';

const MAP_STYLE     = 'https://tiles.openfreemap.org/styles/liberty';
const TRAIL_COLOR   = '#2563eb';
const PLANNED_COLOR = '#64748b';
const GESTURE_GRACE_MS = 1500; // keep follow paused this long after the finger lifts

export default function BusMapView({
  interactive   = true,
  center        = [76.9366, 8.5241],
  zoom          = 12,
  defaultPitch  = 0,
  defaultBearing = 0,
  busCoord      = null,
  isLive        = false,
  isActiveTrip  = false,
  autoCenter    = false,
  headingStatus = null,
  stops         = [],
  plannedCoords = [],
  routeHistoryCoords = [],
  onStopClick   = null,
  onMapLoad     = null,
  onAutoCenterChange = null, // notify parent when a user gesture turns off follow
  style         = {},
  className     = '',
}) {
  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const busMarkerRef  = useRef(null);
  const markerLiveRef = useRef(null); // current icon state on the marker (avoids per-frame innerHTML rewrites)
  const stopsLayerRef = useRef(false);
  const mapReadyRef   = useRef(false);

  const animatorRef     = useRef(null);
  const trailManagerRef = useRef(null);
  const isActiveTripRef = useRef(false); // ref so animator callbacks always read the latest value
  // Refs so the (mount-time) animator callback always sees the latest props: while
  // live and following, we recenter the map on the *animated* position each frame
  // so the map glides with the marker instead of stepping to each raw GPS point.
  const isLiveRef       = useRef(false);
  const autoCenterRef   = useRef(false);
  // True only while the user is actively dragging/zooming, so the per-frame
  // follow never fights their gesture (the "map is stuck / not movable" bug).
  const userInteractingRef = useRef(false);
  const onAutoCenterChangeRef = useRef(onAutoCenterChange);
  useEffect(() => { onAutoCenterChangeRef.current = onAutoCenterChange; }, [onAutoCenterChange]);
  // Latest data props for the map 'load' handler (the mount-time closure would
  // otherwise draw whatever was there at mount — often nothing).
  const latestDataRef = useRef({ plannedCoords, stops, routeHistoryCoords });
  latestDataRef.current = { plannedCoords, stops, routeHistoryCoords };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container:   containerRef.current,
      style:       MAP_STYLE,
      center,
      zoom,
      pitch:       defaultPitch,
      bearing:     defaultBearing,
      minZoom:     6,
      maxZoom:     18,
      maxBounds: [
        [73.50, 7.50],
        [84.50, 19.50]
      ],
      interactive,
      attributionControl: false,
    });

    mapRef.current = map;
    trailManagerRef.current = new TrailManager();

    // Gesture handling. The per-frame follow calls setCenter → jumpTo → stop(),
    // which cancels MapLibre's gesture handlers. Waiting for 'dragstart' is too
    // late: the drag is killed before it reaches its start threshold, so the
    // map felt locked. So we pause follow the moment a finger/mouse goes down
    // on the map, release follow as soon as it actually moves (or pinches /
    // wheels), and only the crosshair button turns follow back on.
    let graceTimer = null;
    let downAt = null;
    const releaseFollow = () => {
      if (autoCenterRef.current) {
        autoCenterRef.current = false;
        if (onAutoCenterChangeRef.current) onAutoCenterChangeRef.current(false);
      }
    };
    const beginInteract = () => {
      if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
      userInteractingRef.current = true;
    };
    const endInteract = () => {
      downAt = null;
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = setTimeout(() => { userInteractingRef.current = false; graceTimer = null; }, GESTURE_GRACE_MS);
    };
    const canvasEl = map.getCanvasContainer();
    const onPointerDown = (e) => { beginInteract(); downAt = [e.clientX, e.clientY]; };
    const onPointerMove = (e) => {
      if (!downAt) return;
      if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) releaseFollow();
    };
    const onTouchStart = (e) => { beginInteract(); if (e.touches && e.touches.length > 1) releaseFollow(); };
    const onWheel = () => { beginInteract(); releaseFollow(); endInteract(); };
    canvasEl.addEventListener('pointerdown', onPointerDown, { passive: true });
    canvasEl.addEventListener('pointermove', onPointerMove, { passive: true });
    canvasEl.addEventListener('touchstart', onTouchStart, { passive: true });
    canvasEl.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('pointerup', endInteract);
    window.addEventListener('pointercancel', endInteract);
    window.addEventListener('touchend', endInteract);
    // Belt and braces: any MapLibre user gesture also releases follow.
    const onUserGestureStart = (e) => {
      if (!e || !e.originalEvent) return;
      beginInteract();
      releaseFollow();
    };
    const onUserGestureEnd = (e) => { if (e && e.originalEvent) endInteract(); };
    map.on('dragstart', onUserGestureStart);
    map.on('zoomstart', onUserGestureStart);
    map.on('rotatestart', onUserGestureStart);
    map.on('pitchstart', onUserGestureStart);
    map.on('dragend', onUserGestureEnd);
    map.on('zoomend', onUserGestureEnd);
    map.on('rotateend', onUserGestureEnd);
    map.on('pitchend', onUserGestureEnd);

    map.on('load', () => {
      mapReadyRef.current = true;
      if (trailManagerRef.current) trailManagerRef.current.setMap(map);
      if (onMapLoad) onMapLoad(map);

      map.addSource('planned-route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } },
      });
      map.addLayer({
        id: 'planned-route-layer', type: 'line', source: 'planned-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': PLANNED_COLOR, 'line-width': 4, 'line-opacity': 0.55, 'line-dasharray': [2, 1.5] },
      });

      map.addSource('trail', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } },
      });
      map.addLayer({
        id: 'trail-layer', type: 'line', source: 'trail',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': TRAIL_COLOR, 'line-width': 3.5, 'line-opacity': 0.9 },
      });

      map.addSource('stops', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'stops-circle', type: 'circle', source: 'stops',
        paint: {
          'circle-radius': 5, 'circle-color': '#64748b',
          'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff',
        },
      });
      stopsLayerRef.current = true;

      if (onStopClick) {
        map.on('click', 'stops-circle', (e) => {
          const props = e.features[0]?.properties;
          if (props) onStopClick(JSON.parse(props.stop));
        });
        map.on('mouseenter', 'stops-circle', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'stops-circle', () => {
          map.getCanvas().style.cursor = '';
        });
      }

      const d = latestDataRef.current;
      updateMapData(map, d.plannedCoords, d.stops, d.routeHistoryCoords);
    });

    // Initialize Animator with smart snap-to-route segment fetcher.
    // If the bus is within SNAP_THRESHOLD_M of the planned route → instant slice.
    // If deviated or unscheduled → call OSRM for the actual road shape.
    animatorRef.current = new GPSAnimator({
      onPositionUpdate: (point, drawnPath) => {
        updateBusMarker(point, true);
        // Follow the animated point (smooth) rather than the raw GPS ping — but
        // never while the user is actively panning/zooming the map.
        if (
          autoCenterRef.current &&
          isLiveRef.current &&
          !userInteractingRef.current &&
          mapRef.current &&
          !mapRef.current.isEasing()
        ) {
          mapRef.current.setCenter(point);
        }
        if (trailManagerRef.current && drawnPath && isActiveTripRef.current) {
          trailManagerRef.current.drawLive(drawnPath);
        }
      },
      onSegmentFinished: (path) => {
        if (trailManagerRef.current && isActiveTripRef.current) {
          trailManagerRef.current.commitSegment(path);
        }
      },
      // A teleport (long gap / reconnect) leaves a hole in the live trail —
      // ask for the server history so the hole is filled from trip_trace.
      onJump: () => window.dispatchEvent(new CustomEvent('trail-resync')),
      segmentFetcher: async (lat1, lon1, lat2, lon2) => {
        const trail = trailManagerRef.current;
        if (trail && trail.hasPlanned()) {
          // Forward-only slice of the planned line. [] = on route but not moving
          // forward (hold, never replay the road backwards); null = off route.
          const slice = trail.sliceForLeg(lon1, lat1, lon2, lat2);
          if (slice) return slice;
        }

        // Unscheduled trip or genuinely off the planned route: OSRM road shape
        const seg = await getRouteSegment(lat1, lon1, lat2, lon2);
        return seg?.coordinates || [];
      },
    });

    const onLiveGps = (e) => {
      const msg = e.detail;
      if (animatorRef.current && msg.lat && msg.lon) {
        animatorRef.current.pushPoint(msg.lat, msg.lon, msg.server_time, msg.osrm_path, msg.speed_kmh);
      }
    };
    window.addEventListener('live-gps-update', onLiveGps);

    // When useBusTracking fetches planned coords, wire them into TrailManager
    // so the smart segmentFetcher can snap to them.
    const onPlannedRoute = (e) => {
      if (trailManagerRef.current) {
        trailManagerRef.current.setPlannedRoute(e.detail);
      }
    };
    window.addEventListener('planned-route-ready', onPlannedRoute);

    return () => {
      if (graceTimer) clearTimeout(graceTimer);
      canvasEl.removeEventListener('pointerdown', onPointerDown);
      canvasEl.removeEventListener('pointermove', onPointerMove);
      canvasEl.removeEventListener('touchstart', onTouchStart);
      canvasEl.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointerup', endInteract);
      window.removeEventListener('pointercancel', endInteract);
      window.removeEventListener('touchend', endInteract);
      window.removeEventListener('live-gps-update', onLiveGps);
      window.removeEventListener('planned-route-ready', onPlannedRoute);
      mapReadyRef.current = false;
      stopsLayerRef.current = false;
      if (busMarkerRef.current) {
        busMarkerRef.current.remove();
        busMarkerRef.current = null;
      }
      if (animatorRef.current) animatorRef.current.destroy();
      if (trailManagerRef.current) trailManagerRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const updateMapData = (map, planned, stopsArr, historyCoords) => {
    if (!map || !mapReadyRef.current) return;
    const plannedSrc = map.getSource('planned-route');
    if (plannedSrc) {
      const has = planned && planned.length > 0;
      const isMulti = has && Array.isArray(planned[0]) && Array.isArray(planned[0][0]);
      plannedSrc.setData({
        type: 'Feature',
        geometry: {
          type: isMulti ? 'MultiLineString' : 'LineString',
          coordinates: has ? planned : []
        }
      });
    }
    // Feed the snapper straight from props too (the window event can fire
    // before this map mounts). setPlannedRoute ignores an unchanged line, and
    // an empty one (no trip / unscheduled) stops snapping to the fixed route.
    if (trailManagerRef.current) {
      trailManagerRef.current.setPlannedRoute(planned || []);
    }
    const stopsSrc = map.getSource('stops');
    if (stopsSrc) {
      stopsSrc.setData({
        type: 'FeatureCollection',
        features: stopsArr.filter(s => s.lat && s.lon).map(s => ({
          type: 'Feature', geometry: { type: 'Point', coordinates: [Number(s.lon), Number(s.lat)] },
          properties: { stop: JSON.stringify(s) },
        })),
      });
    }

    if (historyCoords && historyCoords.length > 0 && trailManagerRef.current) {
      // History (trip_trace) is authoritative from trip start; setHistory keeps
      // any newer live legs on the end. No length comparison: point counts of
      // the DB trail and the animated trail are not comparable.
      trailManagerRef.current.setHistory(historyCoords);
    }
  };

  useEffect(() => {
    updateMapData(mapRef.current, plannedCoords, stops, routeHistoryCoords);
  }, [plannedCoords, stops, routeHistoryCoords]);

  // Rewrites the marker icon HTML only when the live/offline state actually changes.
  // During animation this is called ~60×/s with the same `live` value, so guarding
  // the innerHTML write keeps the DOM identical while avoiding needless reflows.
  const setMarkerIcon = (live) => {
    if (!busMarkerRef.current || markerLiveRef.current === live) return;
    markerLiveRef.current = live;
    const imgSrc = live ? `${import.meta.env.BASE_URL}bus_live.webp` : `${import.meta.env.BASE_URL}bus_offline.webp`;
    busMarkerRef.current.getElement().innerHTML = `
      <div class="marker-wrapper" style="position: relative; display: flex; align-items: center; justify-content: center; width: 48px; height: 48px;">
        <img src="${imgSrc}" style="width: 32px; height: 32px; object-fit: contain; z-index: 2;" alt="Bus" />
      </div>
    `;
  };

  const updateBusMarker = (coord, live = false) => {
    const map = mapRef.current;
    if (!map) return;

    if (!busMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'bus-marker-wrapper';
      busMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(coord).addTo(map);
      markerLiveRef.current = null;
      setMarkerIcon(live);
    } else {
      setMarkerIcon(live);
      busMarkerRef.current.setLngLat(coord);
    }
  };

  useEffect(() => {
    if (!busCoord) {
      busMarkerRef.current?.remove();
      busMarkerRef.current = null;
      markerLiveRef.current = null;
      return;
    }
    // While live, GPSAnimator owns marker motion (smooth rAF interpolation via
    // onPositionUpdate). Snapping to the raw busCoord here would fight the animator
    // and teleport the marker on every ping.
    //
    // Extra guard: if the animator already has a tracked position (currentPos != null)
    // we must NEVER override it with the raw GPS coord — even if isLive hasn't
    // propagated to true yet in this render cycle (React batching edge case). This
    // prevents the "jump forward then snap backward" glitch on every WS/poll cycle.
    const animatorHasPosition = animatorRef.current?.currentPos != null;
    if (!busMarkerRef.current) {
      // First appearance — place marker at initial position
      updateBusMarker(busCoord, isLive);
    } else if (!isLive && !animatorHasPosition) {
      // Genuinely offline and no animator running — direct position update
      updateBusMarker(busCoord, isLive);
    } else {
      // Live OR animator already has a position — only update the icon
      setMarkerIcon(isLive);
    }
  }, [busCoord, isLive, headingStatus]);

  // Sync isActiveTrip prop into a ref so animator callbacks always read the latest value
  useEffect(() => {
    isActiveTripRef.current = isActiveTrip;
    // When trip goes inactive, clear the drawn trail — but keep the planned
    // route (clear() used to wipe it, so the snapper lost the route).
    if (!isActiveTrip && trailManagerRef.current) {
      trailManagerRef.current.clearTrail();
    }
  }, [isActiveTrip]);

  // Keep the live/follow refs current for the mount-time animator callback.
  useEffect(() => { isLiveRef.current = isLive; }, [isLive]);
  useEffect(() => { autoCenterRef.current = autoCenter; }, [autoCenter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    map.easeTo({ center, zoom, duration: 600 });
  }, [center, zoom]);

  return (
    <div style={{ position: 'relative', ...style }} className={className}>
      <div ref={containerRef} className="bus-map" style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />
    </div>
  );
}
