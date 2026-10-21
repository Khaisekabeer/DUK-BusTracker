/**
 * RouteViewScreen.tsx
 * Unified home screen with a top toggle bar to switch between:
 *   - "Route View" → Stop timeline (scrollable list of stops with arrival data)
 *   - "Map View"   → Full interactive map with bus tracking
 *
 * Mirrors the PWA duk_pwa1 RouteView.jsx layout:
 *   TopBar → Header + Stats → Toggle Bar → [Route Timeline | Map]
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import {
  Map,
  Camera,
  GeoJSONSource,
  Layer,
  Marker,
} from '@maplibre/maplibre-react-native';
// @ts-ignore
import messaging from '@react-native-firebase/messaging';
import Colors from '../theme/colors';
import TopBar from '../components/TopBar';
import BusIdleAnimation from '../components/BusIdleAnimation';
import { trackingApi, authApi } from '../services/api';
import { getUser } from '../services/storage';
import { haversineDistKm } from '../utils/math';
import { registerForPushNotificationsAsync, registerForegroundHandler } from '../services/firebaseService';
import GPSAnimator from '../utils/gpsAnimator';
import TrailManager from '../utils/trailManager';


const MAP_STYLE    = 'https://tiles.openfreemap.org/styles/liberty';
// Geographic center of Thiruvananthapuram city — used as fallback before any data loads
const DEFAULT_CENTER: [number, number] = [76.9366, 8.5241];
const DEFAULT_ZOOM   = 12;
const POLL_MS        = 30_000;

function todayStr() { return new Date().toISOString().split('T')[0]; }

/**
 * Override geocoded location_name with the closest bus stop name
 * if the bus is within 200m (0.2km) of any known stop.
 * Mirrors PWA duk_pwa1 useBusTracking.js getProximityLocationName.
 */
function getProximityLocationName(
  lon: number, lat: number, defaultName: string | null, stops: any[]
): string | null {
  if (!stops || stops.length === 0) return defaultName;
  let closestStop: any = null;
  let minDist = Infinity;
  for (const stop of stops) {
    const dist = haversineDistKm(Number(stop.lat), Number(stop.lon), lat, lon);
    if (dist < minDist) {
      minDist = dist;
      closestStop = stop;
    }
  }
  return (minDist <= 0.2 && closestStop) ? closestStop.name : defaultName;
}


function formatLastUpdated(isoString: string) {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ', ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Daily Scheduled Timetables ───────────────────────────────────────────────

function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function formatMinutesToTime(totalMins: number): string {
  let m = ((totalMins % 1440) + 1440) % 1440;
  let hours = Math.floor(m / 60);
  const mins = m % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;
  const hStr = hours < 10 ? `0${hours}` : `${hours}`;
  const mStr = mins < 10 ? `0${mins}` : `${mins}`;
  return `${hStr}:${mStr} ${period}`;
}

function computeEstimatedTime(scheduledStr: string, delayMinutes: number): string | null {
  const schedMins = parseTimeToMinutes(scheduledStr);
  if (schedMins == null) return null;
  return formatMinutesToTime(schedMins + delayMinutes);
}

function getDelayBadge(actualStr?: string | null, scheduledStr?: string | null, globalLateMins?: number | null) {
  if (actualStr && scheduledStr) {
    const actMins = parseTimeToMinutes(actualStr);
    const schedMins = parseTimeToMinutes(scheduledStr);
    if (actMins != null && schedMins != null) {
      const diff = actMins - schedMins;
      if (diff > 1) return { text: `+${diff}m delay`, type: 'late' as const, diff };
      if (diff < -1) return { text: `${Math.abs(diff)}m ahead`, type: 'ahead' as const, diff };
      return { text: 'On time', type: 'ahead' as const, diff: 0 };
    }
  }
  if (globalLateMins != null) {
    if (globalLateMins > 0) return { text: `+${globalLateMins}m delay`, type: 'late' as const, diff: globalLateMins };
    if (globalLateMins < 0) return { text: `${Math.abs(globalLateMins)}m ahead`, type: 'ahead' as const, diff: globalLateMins };
    return { text: 'On time', type: 'ahead' as const, diff: 0 };
  }
  return null;
}

/**
 * Compute the map center + zoom.
 */
function getMapViewport(
  stops: any[],
  busCoord: [number, number] | null,
): { center: [number, number]; zoom: number } {
  if (busCoord) {
    return { center: busCoord, zoom: 13 };
  }
  if (stops.length) {
    const lons = stops.map(s => Number(s.lon));
    const lats = stops.map(s => Number(s.lat));
    const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const span = Math.max(
      Math.max(...lons) - Math.min(...lons),
      Math.max(...lats) - Math.min(...lats),
    );
    let zoom = DEFAULT_ZOOM;
    if      (span > 1.0) zoom = 9;
    else if (span > 0.5) zoom = 10;
    else if (span > 0.2) zoom = 11;
    else if (span > 0.1) zoom = 12;
    else                 zoom = 13;
    return { center: [centerLon, centerLat], zoom };
  }
  return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
}

export default function RouteViewScreen({ route, navigation }: any) {
  const { boardingPoint } = route?.params ?? {};

  // ── View mode toggle ──────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'route' | 'map'>('route');

  const [user,         setUser]         = useState<any>(null);
  const [tripState,    setTripState]    = useState<any>(null);
  const [busPosition,  setBusPosition]  = useState<any>(null);
  const [routeHistory, setRouteHistory] = useState<any>(null);
  const [eta,          setEta]          = useState<any>(null);
  const [mlEtas,       setMlEtas]       = useState<any>(null);
  const [plannedCoords, setPlannedCoords] = useState<[number, number][]>([]);
  const [trailCoords,  setTrailCoords]  = useState<[number, number][]>([]);
  const [animatedBus,  setAnimatedBus]  = useState<[number, number] | null>(null);
  const [busBearing,   setBusBearing]   = useState<number>(0);
  const [animDrawnPath, setAnimDrawnPath] = useState<[number, number][]>([]);
  const [stops,        setStops]        = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [error,        setError]        = useState('');
  const [autoCenter,   setAutoCenter]   = useState(true);
  const [displayLocationName, setDisplayLocationName] = useState<string | null>(null);
  const [zoomLevel,    setZoomLevel]    = useState(DEFAULT_ZOOM);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraRef   = useRef<any>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const animIntervalRef = useRef<any>(null);
  const currentPosRef = useRef<[number, number] | null>(null);
  const pulseAnim   = useRef(new Animated.Value(1)).current;
  const mapRef      = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isLiveRef = useRef<boolean>(false);
  const animatorRef = useRef<GPSAnimator | null>(null);
  const trailManagerRef = useRef<TrailManager | null>(null);
  const timerRef = useRef<any>(null);


  
  // Initialize Animator & Trail Manager
  useEffect(() => {
    trailManagerRef.current = new TrailManager();
    animatorRef.current = new GPSAnimator({
      onPositionUpdate: (point, drawnPath, bearing) => {
        setAnimatedBus([point[0], point[1]]);
        if (drawnPath) {
          setAnimDrawnPath(drawnPath);
        }
        if (bearing !== undefined) {
          setBusBearing(bearing);
        }
      },
      onSegmentFinished: (path) => {
        if (trailManagerRef.current) {
          trailManagerRef.current.commitSegment(path);
          setTrailCoords(trailManagerRef.current.getLiveTrail());
          setAnimDrawnPath([]); // clear active animation path
        }
      },
      segmentFetcher: async (lat1, lon1, lat2, lon2) => {
        try {
          const seg = await trackingApi.getRouteSegment(lat1, lon1, lat2, lon2);
          if (seg.data?.coordinates?.length > 1) return seg.data.coordinates;
        } catch (_) {}
        return [];
      }
    });

    return () => {
      animatorRef.current?.destroy();
      trailManagerRef.current?.clear();
    };
  }, []);

  useEffect(() => {
    if (trailManagerRef.current && plannedCoords) {
      trailManagerRef.current.setPlannedRoute(plannedCoords);
    }
  }, [plannedCoords]);

  useEffect(() => {
    registerForPushNotificationsAsync();
    const unsubscribe = registerForegroundHandler();
    return unsubscribe;
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.35, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.quad) })
      ])
    ).start();
  }, [pulseAnim]);

  useFocusEffect(
    useCallback(() => {
      getUser().then((u: any) => { if (u) setUser(u); });
    }, [])
  );

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError('');
    try {
      let trip: any = null;
      try {
        const tripRes = await trackingApi.getTripState();
        trip = tripRes.data;
      } catch (_) {}

      const [busRes, historyRes, stopsRes, geoRes, traceRes, allEtasRes] = await Promise.allSettled([
        trackingApi.getLatest(),
        trackingApi.getRouteHistory(trip?.trip_id),
        trackingApi.getStops(),
        plannedCoords.length === 0 ? trackingApi.getRouteGeometry(trip?.trip_id, trip?.direction) : Promise.resolve(null),
        trackingApi.getCurrentTrace(),
        trip && ['active', 'connecting', 'on_trip', 'late'].includes(trip.status) ? trackingApi.getAllEtas() : Promise.resolve(null),
      ]);

      const rawBus = busRes.status === 'fulfilled' ? busRes.value?.data : null;
      const history = historyRes.status === 'fulfilled' ? historyRes.value?.data : null;
      const fetchedStops = stopsRes.status === 'fulfilled' ? 
        (Array.isArray(stopsRes.value?.data) ? stopsRes.value.data : stopsRes.value?.data?.stops) : null;
      const geo = geoRes.status === 'fulfilled' ? geoRes.value?.data : null;
      const trace = traceRes.status === 'fulfilled' ? traceRes.value?.data : null;
      const fetchedMlEtas = allEtasRes.status === 'fulfilled' ? allEtasRes.value?.data : null;

      // Normalize backend field names: speed_kmh → speed, ist_time → server_time fallback
      const bus = rawBus ? {
        ...rawBus,
        speed: rawBus.speed_kmh ?? rawBus.speed ?? null,
        server_time: rawBus.ist_time ?? rawBus.server_time ?? null,
      } : null;

      if (trip) setTripState(trip);
      if (bus && bus.lat && bus.lon) {
        setBusPosition(bus);
        animatorRef.current?.pushPoint(bus.lat, bus.lon, bus.server_time);
        // Proximity location name override (matches PWA logic)
        const resolvedName = fetchedStops && fetchedStops.length > 0
          ? getProximityLocationName(bus.lon, bus.lat, bus.location_name || null, fetchedStops)
          : bus.location_name || null;
        if (resolvedName) setDisplayLocationName(resolvedName);
      }
      if (history) {
        setRouteHistory(history);
      }
      // Trail line: use the snapped GPS trail from /current_trace
      if (trace?.coordinates?.length > 1) {
        setTrailCoords(trace.coordinates);
      }
      if (fetchedStops) setStops(fetchedStops);
      if (geo?.coordinates) setPlannedCoords(geo.coordinates);
      if (fetchedMlEtas) setMlEtas(fetchedMlEtas);
      else setMlEtas(null);

      const stopId = user?.boarding_stop_id ?? boardingPoint?.id;
      if (stopId && bus?.is_live) {
        const etaRes = await trackingApi.getEta(stopId).catch(() => null);
        if (etaRes) setEta(etaRes.data);
      }
    } catch {
      setError('Could not load bus data. Pull down to refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, boardingPoint, plannedCoords.length]);

  const _rescheduleInterval = useCallback((light: boolean) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const ms = light ? 30000 : 15000;
    timerRef.current = setInterval(() => fetchData(false), ms);
  }, [fetchData]);

  useEffect(() => {
    _rescheduleInterval(false);
    let isMounted = true;
    let reconnectTimeout: any = null;

    const connectWs = async () => {
      const wsUrl = await trackingApi.getWsUrl();
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isMounted && !isLiveRef.current) {
          isLiveRef.current = true;
          _rescheduleInterval(true);
        }
      };

      ws.onmessage = (e) => {
        if (!isMounted) return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'gps' && animatorRef.current) {
            animatorRef.current.pushPoint(msg.data.lat, msg.data.lon, msg.data.server_time ?? msg.data.ist_time);
            // Proximity location name override for WebSocket updates
            const wsLocName = getProximityLocationName(
              msg.data.lon, msg.data.lat,
              msg.data.location_name || null,
              stops
            );
            if (wsLocName) setDisplayLocationName(wsLocName);
            if (msg.data.speed !== undefined || msg.data.speed_kmh !== undefined) { msg.data.speed = msg.data.speed ?? msg.data.speed_kmh;
              setBusPosition((prev: any) => prev ? { ...prev, ...msg.data } : msg.data);
            }
          } else if (msg.type === 'trip_status') {
            fetchData(false); // fast re-fetch on status change
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        if (!isMounted) return;
        isLiveRef.current = false;
        _rescheduleInterval(false);
        reconnectTimeout = setTimeout(connectWs, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWs();
    fetchData(true);

    return () => {
      isMounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, [fetchData, _rescheduleInterval]);

  // Derived values
  const status        = tripState?.status || 'offline';
  const isOnline      = status === 'active' || status === 'connecting';
  const tripName      = tripState?.trip || '';
  const isUnscheduled = tripState?.is_deviated || tripName === 'Unscheduled' || tripName === 'Live Location';
  const isIdleMode    = status === 'offline' || status === 'cancelled' || status === 'completed' || status === 'waiting' || isUnscheduled;
  const nextTripTime  = tripState?.next_trip_time || null;
  const isLive        = status === 'active';

  // Morning trip: visible 6:00 AM - 11:00 AM. Evening trip: visible from 4:40 PM (starts 5:40 PM).
  const currentHour   = new Date().getHours();
  const isEvening     = tripState?.trip?.toLowerCase().includes('evening') || tripState?.trip === 'reverse' || currentHour >= 12;
  const destination   = isEvening ? 'TRIVANDRUM' : 'DUK CAMPUS';

  function getSubtextStatus(): string {
    if (isIdleMode) {
      if (status === 'cancelled') return `Trip cancelled${tripState?.cancellation_reason ? ` (${tripState.cancellation_reason})` : ''}`;
      if (isUnscheduled) return 'Bus is active off-schedule';
      return nextTripTime ? `Next trip at ${nextTripTime}` : 'Bus is offline';
    }
    if (status === 'connecting') return 'Connecting ...';
    
    let sub = `${tripName || 'Active Trip'} → ${destination}`;
    if (tripState?.late_by_minutes > 0) sub += ` • Delayed by ${tripState.late_by_minutes} mins`;
    else if (tripState?.late_by_minutes < 0) sub += ` • Ahead by ${Math.abs(tripState.late_by_minutes)} mins`;
    else sub += ` • On time`;
    return sub;
  }

  const liveTrail = trailManagerRef.current?.getLiveTrail(animDrawnPath) || [];
  const finalTrail = liveTrail.length > 0 ? liveTrail : trailCoords;
  const createLineStringGeoJSON = (coords: any[]) => {
    if (!coords || coords.length < 2) return { type: 'FeatureCollection' as const, features: [] };
    return { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: coords }, properties: {} };
  };

  const trailGeoJSON = createLineStringGeoJSON(isIdleMode ? [] : finalTrail);
  const plannedGeoJSON = createLineStringGeoJSON(isIdleMode ? [] : plannedCoords);

  const showHistory = isLive || status === 'completed' || status === 'on_trip' || status === 'connecting';
  const isValidTrip = showHistory && tripState?.trip_id;
  const visitedMap: Record<string, string> = isValidTrip ? (routeHistory?.arrivalTimes || {}) : {};
  const visitedNames = new Set<string>(Object.keys(isValidTrip ? (routeHistory?.visitedStops || {}) : {}));

  const globalDelay = tripState?.late_by_minutes ?? 0;
  const displayStops = (() => {
    const filtered = stops.filter((s: any) => isEvening ? !!s.evening_time : !!s.morning_time);
    return isEvening
      ? [...filtered].sort((a, b) => (parseTimeToMinutes(a.evening_time) || 0) - (parseTimeToMinutes(b.evening_time) || 0))
      : [...filtered].sort((a, b) => (parseTimeToMinutes(a.morning_time) || 0) - (parseTimeToMinutes(b.morning_time) || 0));
  })();
  
  // The current stop is the first stop in the display order that has NOT been visited yet
  const currentStopIndex = displayStops.findIndex((s: any) => !visitedNames.has(s.name));
  const currentStopName = currentStopIndex !== -1 ? displayStops[currentStopIndex].name : null;

  const etaText = (() => {
    if (!eta || !isOnline || status === 'connecting') return '—';
    if (eta.status === 'passed' || eta.status === 'deviated') return '—';
    if (eta.eta_minutes != null) return `${Math.round(eta.eta_minutes)} min`;
    return '—';
  })();


  useEffect(() => {
    if (viewMode !== 'route') return;
    if (currentStopIndex > 0 && scrollViewRef.current) {
      // Center the current stop in view: offset by 2 rows above it
      const offset = Math.max(0, (currentStopIndex - 2) * 54);
      scrollViewRef.current.scrollTo({ y: offset, animated: true });
    }
  }, [currentStopIndex, viewMode, busPosition]);

  const mapVp = getMapViewport(displayStops, animatedBus || null);

  // Auto-center map on bus when in map view
  useEffect(() => {
    if (viewMode === 'map' && autoCenter && animatedBus && cameraRef.current) {
      cameraRef.current.easeTo?.({ center: animatedBus, zoom: zoomLevel, duration: 600 });
    }
  }, [animatedBus, autoCenter, viewMode]);

  // Map controls
  const recenter = () => {
    if (animatedBus) {
      setZoomLevel(14);
      cameraRef.current?.easeTo?.({ center: animatedBus, zoom: 14, duration: 600 });
      setAutoCenter(true);
    } else if (stops.length) {
      const vp = getMapViewport(stops, null);
      setZoomLevel(vp.zoom);
      cameraRef.current?.easeTo?.({ center: vp.center, zoom: vp.zoom, duration: 600 });
    }
  };

  const handleZoomIn = () => {
    const newZoom = Math.min(zoomLevel + 1, 20);
    setZoomLevel(newZoom);
    cameraRef.current?.zoomTo?.(newZoom, { duration: 300 });
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoomLevel - 1, 3);
    setZoomLevel(newZoom);
    cameraRef.current?.zoomTo?.(newZoom, { duration: 300 });
  };

  const timeline = displayStops.map((stop: any, idx: number) => {
    const isVisited = visitedNames.has(stop.name);
    const isCurrent = stop.name === currentStopName;
    const isMissed  = !isVisited && currentStopIndex > -1 && idx < currentStopIndex;
    const actualArrival = visitedMap[stop.name] ?? null;
    const scheduledDaily = stop.scheduled_time ?? (isEvening ? stop.evening_time : stop.morning_time) ?? (isEvening ? '06:00 PM' : '08:00 AM');

    let progress = (isVisited || isMissed) ? 1.0 : 0.0;
    if (isCurrent && idx < displayStops.length - 1 && animatedBus) {
      const nextStop = displayStops[idx + 1];
      const dTotal = haversineDistKm(Number(stop.lat), Number(stop.lon), Number(nextStop.lat), Number(nextStop.lon));
      const dRemaining = haversineDistKm(animatedBus[1], animatedBus[0], Number(nextStop.lat), Number(nextStop.lon));
      if (dTotal > 0.05) progress = Math.max(0.0, Math.min(1.0, 1.0 - (dRemaining / dTotal)));
    }

    let liveTime: string | null = null;
    let delayType: 'late' | 'ahead' | 'ontime' | 'none' = 'none';
    let statusSubtext = '';

    if (isVisited) {
      liveTime = actualArrival ?? scheduledDaily;
      statusSubtext = 'Arrived';
      const delay = getDelayBadge(actualArrival, scheduledDaily, null);
      if (delay) {
        delayType = delay.type === 'late' ? 'late' : 'ahead';
      }
    } else if (isMissed) {
      statusSubtext = 'Missed';
    } else if (isOnline) {
      let usedMl = false;
      if (!isVisited && !isMissed && mlEtas && mlEtas[stop.id] !== undefined) {
        const now = new Date();
        const currentMins = now.getHours() * 60 + now.getMinutes();
        const scheduledMins = parseTimeToMinutes(scheduledDaily);
        if (scheduledMins) {
          const mlPredictedDelay = Math.round(currentMins + mlEtas[stop.id] - scheduledMins);
          liveTime = computeEstimatedTime(scheduledDaily, mlPredictedDelay) || scheduledDaily;
          if (mlPredictedDelay > 1) { delayType = 'late'; statusSubtext = `Delayed by ${mlPredictedDelay}m`; }
          else if (mlPredictedDelay < -1) { delayType = 'ahead'; statusSubtext = `${Math.abs(mlPredictedDelay)}m ahead`; }
          else { delayType = 'ontime'; statusSubtext = `On time`; }
          usedMl = true;
          
          if (isCurrent && eta?.eta_minutes != null) {
            statusSubtext = `Approaching • ${Math.round(eta.eta_minutes)}m`;
          }
        }
      }

      if (!usedMl) {
        liveTime = computeEstimatedTime(scheduledDaily, globalDelay);
        delayType = globalDelay > 1 ? 'late' : globalDelay < -1 ? 'ahead' : 'ontime';
        if (isCurrent) statusSubtext = eta?.eta_minutes != null ? `Approaching • ${Math.round(eta.eta_minutes)}m` : 'Next Stop';
        else if (delayType === 'late') statusSubtext = `+${globalDelay}m delay`;
        else if (delayType === 'ahead') statusSubtext = `${Math.abs(globalDelay)}m ahead`;
        else statusSubtext = 'On time';
      }
    } else {
      statusSubtext = 'Scheduled';
    }

    return {
      id: stop.id,
      name: stop.name,
      scheduledTime: scheduledDaily,
      liveTime,
      delayType,
      statusSubtext,
      isVisited,
      isCurrent,
      isMissed,
      progress,
      lat: stop.lat,
      lon: stop.lon,
    };
  });

  if (loading) {
    return (
      <SafeAreaView style={S.safe} edges={['top']}>
        <TopBar />
        <View style={S.centeredFill}>
          <ActivityIndicator size="large" color={Colors.mint} />
          <Text style={S.loadingText}>Getting live bus data…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bgGray} />
      <TopBar />

      {/* ── Fixed Header Area (always visible above toggle) ──────────────── */}
      <View style={S.headerArea}>
        {/* Header Row */}
        <View style={S.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={S.screenTitle} numberOfLines={1}>
              {displayLocationName || busPosition?.location_name || 'Fetching location...'}
            </Text>
            <Text style={[S.statLabel, { marginTop: 2, textAlign: 'left' }]}>
              CURRENT LOCATION
            </Text>
          </View>
          {busPosition?.server_time && (
            <Text style={[S.lastUpdatedText, { alignSelf: 'flex-start', marginTop: 4 }]}>
              Last updated: {formatLastUpdated(busPosition.server_time)}
            </Text>
          )}
        </View>

        {/* Status subtext */}
        <Text style={[
          S.tripSubtext,
          status === 'connecting' && { color: '#d97706' },
          (tripName.toLowerCase().includes('morning') || tripName.toLowerCase().includes('evening')) && { color: Colors.mintText },
          status === 'cancelled' && { color: Colors.danger },
        ]} numberOfLines={2}>
          {getSubtextStatus()}
        </Text>

        {/* Error banner */}
        {error ? (
          <View style={S.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
            <Text style={S.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        {/* Stats card — hidden in idle mode */}
        {!isIdleMode && (
          <View style={S.statsCard}>
            <View style={S.statItem}>
              <Text style={S.statValue}>{etaText}</Text>
              <Text style={S.statLabel} numberOfLines={1}>TO YOUR STOP</Text>
            </View>
            <View style={S.statDivider} />
            <View style={S.statItem}>
              <Text style={S.statValue}>
                {busPosition?.speed != null ? `${Math.round(busPosition.speed)} km/h` : '—'}
              </Text>
              <Text style={S.statLabel}>SPEED</Text>
            </View>
          </View>
        )}
      </View>

      {/* ── Toggle Bar (Route View / Map View) ───────────────────────────── */}
      <View style={S.toggleBar}>
        <View style={S.toggleTrack}>
          <TouchableOpacity
            style={[S.toggleTab, viewMode === 'route' && S.toggleTabActive]}
            onPress={() => setViewMode('route')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="list-outline"
              size={16}
              color={viewMode === 'route' ? '#1c1c1e' : '#6b7280'}
            />
            <Text style={[S.toggleTabText, viewMode === 'route' && S.toggleTabTextActive]}>
              Route View
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.toggleTab, viewMode === 'map' && S.toggleTabActive]}
            onPress={() => { setViewMode('map'); recenter(); }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="map-outline"
              size={16}
              color={viewMode === 'map' ? '#1c1c1e' : '#6b7280'}
            />
            <Text style={[S.toggleTabText, viewMode === 'map' && S.toggleTabTextActive]}>
              Map View
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Dynamic Content Area ─────────────────────────────────────────── */}
      <View style={S.contentArea}>

        {/* ── Route View Panel ───────────────────────────────────────────── */}
        {viewMode === 'route' && (
          <View style={S.routePanel}>
            {/* Stop timeline card / Idle animation */}
            <View style={[S.cardFull, isIdleMode && S.cardIdle]}>
              {isIdleMode ? (
                <BusIdleAnimation
                  nextTripTime={nextTripTime}
                  isUnscheduled={isUnscheduled}
                />
              ) : timeline.length === 0 ? (
                <View style={S.emptyState}>
                  <Ionicons name="bus-outline" size={28} color={Colors.lightGray} />
                  <Text style={S.emptyStateText}>
                    {status === 'connecting' ? 'Connecting to Bus GPS…' : 'No stop arrivals recorded yet.'}
                  </Text>
                </View>
              ) : (
                <ScrollView
                  ref={scrollViewRef}
                  style={S.timelineScroll}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                  indicatorStyle="black"
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={() => fetchData(true)}
                      tintColor={Colors.mint}
                    />
                  }
                >
                  {timeline.map((item, idx) => {
                    const isLast = idx === timeline.length - 1;
                    return (
                      <View key={`${item.id}-${idx}`} style={S.timelineRow}>
                        {/* Left: Scheduled Time (Top) & Live/ETA Time (Bottom in Red/Green) */}
                        <View style={S.timeLeftCol}>
                          <Text style={S.schedTimeText}>{item.scheduledTime}</Text>
                          {item.liveTime ? (
                            <Text style={[
                              S.liveTimeText,
                              item.delayType === 'late' && S.timeTextLate,
                              (item.delayType === 'ahead' || item.delayType === 'ontime') && S.timeTextAhead,
                            ]}>
                              {item.liveTime}
                            </Text>
                          ) : (
                            <Text style={S.liveTimeTextMuted}>—</Text>
                          )}
                        </View>

                        {/* Center: Track line & Dot / Bus Badge */}
                        <View style={S.timelineTrackCol}>
                          <View style={[
                            S.trackDot,
                            (item.isVisited || item.isCurrent) && S.trackDotVisited,
                            item.isMissed && S.trackDotMissed,
                          ]} />
                          {!isLast && (
                            <View style={S.trackLine}>
                              {item.progress > 0 && (
                                <View style={[
                                  S.trackLineActiveOverlay,
                                  { height: `${item.progress * 100}%` }
                                ]} />
                              )}
                            </View>
                          )}
                          {item.isCurrent && (
                            <Animated.View style={[
                              S.busBadgeWrapper,
                              { 
                                position: 'absolute',
                                top: '50%',
                                marginTop: -14 + (item.progress * 56),
                                transform: [{ scale: pulseAnim }] 
                              }
                            ]}>
                              <View style={S.busBadgeCircle}>
                                <Ionicons name="bus" size={13} color="#ffffff" />
                              </View>
                            </Animated.View>
                          )}
                        </View>

                        {/* Right: Stop Name & Subtext */}
                        <View style={S.stopInfoCol}>
                          <Text style={[
                            S.stopName,
                            item.isCurrent && S.stopNameCurrent,
                            item.isVisited && S.stopNameVisited,
                            item.isMissed && S.stopNameMissed,
                          ]} numberOfLines={1}>
                            {item.name}
                          </Text>
                          {item.statusSubtext ? (
                            <Text style={[
                              S.stopSubtext,
                              item.isCurrent && S.stopSubtextCurrent,
                              item.isMissed && S.stopSubtextMissed,
                              item.delayType === 'late' && !item.isVisited && !item.isMissed && S.stopSubtextLate,
                              (item.delayType === 'ahead' || item.delayType === 'ontime') && !item.isVisited && !item.isMissed && S.stopSubtextAhead,
                            ]}>
                              {item.statusSubtext}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </View>
        )}

        {/* ── Map View Panel ─────────────────────────────────────────────── */}
        {viewMode === 'map' && (
          <View style={S.mapPanel}>
            <Map
              style={S.fullMap}
              mapStyle={MAP_STYLE}
              onTouchStart={() => setAutoCenter(false)}
            >
              <Camera
                ref={cameraRef}
                center={mapVp.center}
                zoom={zoomLevel}
                duration={500}
              />

              {plannedCoords.length > 1 && (
                <GeoJSONSource id="planned" data={plannedGeoJSON}>
                  <Layer
                    id="planned-line"
                    type="line"
                    paint={{ 'line-color': '#94a3b8', 'line-width': 2.5, 'line-opacity': 0.5 }}
                    layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  />
                </GeoJSONSource>
              )}

              {trailCoords.length > 1 && (
                <GeoJSONSource id="trail" data={trailGeoJSON}>
                  <Layer
                    id="trail-line"
                    type="line"
                    paint={{ 'line-color': '#2563eb', 'line-width': 4 }}
                    layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  />
                </GeoJSONSource>
              )}

              {!isIdleMode && stops.map((stop: any) => (
                <Marker key={`s-${stop.id}`} id={`s-${stop.id}`} lngLat={[stop.lon, stop.lat]}>
                  <View style={S.stopDot} />
                </Marker>
              ))}

              {animatedBus && (
                <Marker id="bus" lngLat={animatedBus}>
                  <View style={S.busMarkerContainer}>
                    <View style={[S.busMarkerPin, { 
                      backgroundColor: isLive ? '#16a34a' : '#6b7280', 
                      borderColor: '#ffffff'
                    }]}>
                      <View style={S.busMarkerIconWrapper}>
                        <Ionicons name="bus" size={17} color="#fff" />
                      </View>
                    </View>
                  </View>
                </Marker>
              )}
            </Map>

            {/* Map Controls */}
            <View style={S.mapControls}>
              <TouchableOpacity
                style={[S.mapCtrlBtn, autoCenter && S.mapCtrlBtnActive]}
                onPress={recenter}
                activeOpacity={0.7}
              >
                <Ionicons name="locate-outline" size={22} color={autoCenter ? '#007AFF' : '#6b7280'} />
              </TouchableOpacity>
              <View style={S.mapCtrlDivider} />
              <TouchableOpacity
                style={S.mapCtrlBtn}
                onPress={handleZoomIn}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={22} color="#1f2937" />
              </TouchableOpacity>
              <View style={S.mapCtrlDivider} />
              <TouchableOpacity
                style={S.mapCtrlBtn}
                onPress={handleZoomOut}
                activeOpacity={0.7}
              >
                <Ionicons name="remove" size={22} color="#1f2937" />
              </TouchableOpacity>
            </View>

            {/* Status pill */}
            {animatedBus && (
              <View style={S.statusPill}>
                <View style={[S.statusDot, { backgroundColor: isLive ? '#16a34a' : '#9ca3af' }]} />
                <Text style={S.statusText}>
                  {isLive ? 'Bus Live' : 'Last Known'}
                  {(displayLocationName || busPosition?.location_name) ? ` • ${displayLocationName || busPosition.location_name}` : ''}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: Colors.bgGray },
  centeredFill:  { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText:   { fontSize: 17, color: Colors.medGray },

  // ── Fixed Header Area ──────────────────────────────────────────────────
  headerArea:    { paddingHorizontal: 20, paddingTop: 16, backgroundColor: Colors.white },
  headerRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  screenTitle:   { fontSize: 28, fontWeight: '800', color: Colors.black, letterSpacing: -0.5 },
  lastUpdatedText: { fontSize: 15, color: Colors.medGray, fontWeight: '600' },
  tripSubtext:   { fontSize: 17, fontWeight: '600', color: Colors.medGray, marginBottom: 10, lineHeight: 24 },

  // Error
  errorBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff5f5', borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#fecaca' },
  errorBannerText: { fontSize: 14, color: Colors.danger, flex: 1 },

  // Stats card — PWA: .ios-stats-card
  statsCard:       { backgroundColor: Colors.white, borderRadius: 16, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  statItem:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  statValue:       { fontSize: 24, fontWeight: '800', color: Colors.black },
  statLabel:       { fontSize: 14, fontWeight: '700', color: Colors.lightGray, letterSpacing: 0.5, textAlign: 'center' },
  statDivider:     { width: 1, height: 32, backgroundColor: Colors.separator, marginTop: 4 },

  // ── Toggle Bar ─────────────────────────────────────────────────────────
  toggleBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  toggleTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f4f7',
    borderRadius: 14,
    padding: 3,
    gap: 3,
  },
  toggleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: 'transparent',
  },
  toggleTabActive: {
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    elevation: 4,
  },
  toggleTabText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#6b7280',
    letterSpacing: -0.2,
  },
  toggleTabTextActive: {
    color: '#1c1c1e',
    fontWeight: '700',
  },

  // ── Content Area ───────────────────────────────────────────────────────
  contentArea: { flex: 1 },

  // Route panel — fills remaining screen height
  routePanel: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },

  // Timeline card — fills the route panel
  cardFull:        { flex: 1, backgroundColor: Colors.white, borderRadius: 20, paddingVertical: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 3, overflow: 'hidden' },
  cardIdle:        { paddingBottom: 48, shadowOpacity: 0, elevation: 0, backgroundColor: 'transparent', justifyContent: 'center' },
  timelineScroll:  { flex: 1 },
  emptyState:      { alignItems: 'center', paddingVertical: 24 },
  emptyStateText:  { fontSize: 17, color: Colors.medGray, textAlign: 'center', marginTop: 12 },

  // Timeline rows — PWA: .ios-timeline-row (height: 54px)
  timelineRow:        { flexDirection: 'row', height: 58, alignItems: 'stretch', paddingHorizontal: 20 },
  timeLeftCol:        { width: 70, alignItems: 'flex-start', justifyContent: 'center' },
  schedTimeText:      { fontSize: 15, fontWeight: '700', color: '#4b5563', marginBottom: 2 },
  liveTimeText:       { fontSize: 15, fontWeight: '800', color: '#16a34a' },
  timeTextLate:       { color: '#dc2626' },
  timeTextAhead:      { color: '#16a34a' },
  liveTimeTextMuted:  { fontSize: 15, fontWeight: '600', color: '#d1d5db' },

  timelineTrackCol:   { width: 32, alignItems: 'center', justifyContent: 'center', position: 'relative', alignSelf: 'stretch' },
  trackDot:           { width: 10, height: 10, borderRadius: 5, backgroundColor: '#9ca3af', zIndex: 2 },
  trackDotVisited:    { backgroundColor: '#16a34a', width: 12, height: 12, borderRadius: 6 },
  trackDotMissed:     { backgroundColor: '#dc2626', width: 10, height: 10, borderRadius: 5 },
  trackLine:          { position: 'absolute', top: '50%', bottom: -30, width: 3, backgroundColor: '#e5e7eb', zIndex: 1 },
  trackLineVisited:   { backgroundColor: '#16a34a' },
  trackLineActiveOverlay: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#16a34a' },
  busBadgeWrapper:    { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(22, 163, 74, 0.18)', alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  busBadgeCircle:     { width: 22, height: 22, borderRadius: 11, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center', shadowColor: '#16a34a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 4, elevation: 4 },

  stopInfoCol:        { flex: 1, paddingLeft: 12, justifyContent: 'center' },
  stopName:           { fontSize: 17, fontWeight: '700', color: '#1f2937', marginBottom: 2 },
  stopNameCurrent:    { color: '#16a34a', fontWeight: '800' },
  stopNameVisited:    { color: '#4b5563' },
  stopNameMissed:     { color: '#dc2626', textDecorationLine: 'line-through' },
  stopSubtext:        { fontSize: 14, fontWeight: '600', color: '#9ca3af' },
  stopSubtextCurrent: { color: '#16a34a', fontWeight: '700' },
  stopSubtextMissed:  { color: '#dc2626', fontWeight: '700' },
  stopSubtextLate:    { color: '#dc2626', fontWeight: '700' },
  stopSubtextAhead:   { color: '#16a34a', fontWeight: '700' },

  // ── Map View ───────────────────────────────────────────────────────────
  mapPanel:    { flex: 1, position: 'relative' },
  fullMap:     { flex: 1 },
  stopDot:     { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2563eb', borderWidth: 2, borderColor: '#fff' },
  busMarkerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 16, // offset to place the pin tip exactly at the coordinates
  },
  busMarkerPin: {
    width: 32,
    height: 32,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    transform: [{ rotate: '45deg' }],
  },
  busMarkerIconWrapper: {
    transform: [{ rotate: '-45deg' }],
  },

  // Map Controls
  mapControls: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    overflow: 'hidden',
  },
  mapCtrlBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCtrlBtnActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.08)',
  },
  mapCtrlDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginHorizontal: 8,
  },

  // Status pill
  statusPill: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 17, fontWeight: '700', color: Colors.black },
});




