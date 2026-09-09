/**
 * MapFullScreen.tsx
 * Full-screen live map view of the bus route.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import {
  Map,
  Camera,
  GeoJSONSource,
  Layer,
  Marker,
} from '@maplibre/maplibre-react-native';
import Colors from '../theme/colors';
import { trackingApi } from '../services/api';
import { getUser } from '../services/storage';
import { haversineDistKm } from '../utils/math';

const MAP_STYLE   = 'https://tiles.openfreemap.org/styles/liberty';
const DEFAULT_CENTER: [number, number] = [76.9366, 8.5241];
const DEFAULT_ZOOM = 12;
const POLL_MS = 15000;

export default function MapFullScreen({ navigation }: any) {
  const [busPosition, setBusPosition] = useState<any>(null);
  const [stops, setStops] = useState<any[]>([]);
  const [plannedCoords, setPlannedCoords] = useState<[number, number][]>([]);
  const [trailCoords, setTrailCoords] = useState<[number, number][]>([]);
  const [animatedBus, setAnimatedBus] = useState<[number, number] | null>(null);

  const cameraRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);
  const animIntervalRef = useRef<any>(null);
  const currentPosRef = useRef<[number, number] | null>(null);

  const animateBusTo = useCallback(async (targetLat: number, targetLon: number) => {
    const startPos = currentPosRef.current || [targetLon, targetLat];
    const [startLon, startLat] = startPos;
    const distKm = haversineDistKm(startLon, startLat, targetLon, targetLat);

    if (!currentPosRef.current || distKm > 8.0 || distKm < 0.0005) {
      setAnimatedBus([targetLon, targetLat]);
      currentPosRef.current = [targetLon, targetLat];
      return;
    }

    let polyline = [[startLon, startLat], [targetLon, targetLat]];
    try {
      const seg = await trackingApi.getRouteSegment(startLat, startLon, targetLat, targetLon);
      if (seg.data?.coordinates?.length > 1) polyline = seg.data.coordinates;
    } catch (_) { }

    const cumDists = [0];
    for (let i = 1; i < polyline.length; i++) {
      cumDists.push(cumDists[i - 1] + haversineDistKm(polyline[i - 1][0], polyline[i - 1][1], polyline[i][0], polyline[i][1]));
    }
    const totalDist = cumDists[cumDists.length - 1];

    if (totalDist <= 0.00001) {
      setAnimatedBus([targetLon, targetLat]);
      currentPosRef.current = [targetLon, targetLat];
      return;
    }

    if (animIntervalRef.current) cancelAnimationFrame(animIntervalRef.current);

    const duration = POLL_MS;
    const startTime = Date.now();

    const step = () => {
      let progress = (Date.now() - startTime) / duration;
      if (progress > 1.0) progress = 1.0;

      const currentDist = progress * totalDist;
      let segIdx = 0;
      while (segIdx < cumDists.length - 2 && cumDists[segIdx + 1] < currentDist) {
        segIdx++;
      }

      const p1 = polyline[segIdx];
      const p2 = polyline[segIdx + 1];
      const segSpan = (cumDists[segIdx + 1] - cumDists[segIdx]) || 0.00001;
      const segFrac = Math.max(0, Math.min(1, (currentDist - cumDists[segIdx]) / segSpan));

      const curLon = p1[0] + (p2[0] - p1[0]) * segFrac;
      const curLat = p1[1] + (p2[1] - p1[1]) * segFrac;

      setAnimatedBus([curLon, curLat]);
      currentPosRef.current = [curLon, curLat];

      if (progress < 1.0) {
        animIntervalRef.current = requestAnimationFrame(step);
      } else {
        const finalPoint = polyline[polyline.length - 1];
        setAnimatedBus(finalPoint as [number, number]);
        currentPosRef.current = finalPoint as [number, number];
      }
    };

    animIntervalRef.current = requestAnimationFrame(step);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [gpsRes, stopsRes, histRes, geoRes] = await Promise.allSettled([
        trackingApi.getLatest(),
        trackingApi.getStops(),
        trackingApi.getRouteHistory(),
        plannedCoords.length === 0 ? trackingApi.getRouteGeometry() : Promise.resolve(null),
      ]);

      const gps = gpsRes.status === 'fulfilled' ? gpsRes.value?.data : null;
      if (gps) {
        setBusPosition(gps);
        if (gps.lat && gps.lon) animateBusTo(gps.lat, gps.lon);
      }

      if (stopsRes.status === 'fulfilled' && stopsRes.value?.data?.stops) {
        setStops(stopsRes.value.data.stops);
      }

      if (histRes.status === 'fulfilled' && histRes.value?.data?.coords) {
        setTrailCoords(histRes.value.data.coords.map((c: any) => [c.lon, c.lat]));
      }

      if (geoRes.status === 'fulfilled' && geoRes.value?.data?.coordinates) {
        setPlannedCoords(geoRes.value.data.coordinates);
      }
    } catch { /* ignore */ }
  }, [animateBusTo, plannedCoords.length]);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, POLL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (animIntervalRef.current) cancelAnimationFrame(animIntervalRef.current);
    };
  }, [fetchData]);

  const center = animatedBus ?? DEFAULT_CENTER;
  const zoom   = animatedBus ? 14 : DEFAULT_ZOOM;

  const plannedGeoJSON = {
    type: 'Feature' as const,
    geometry: { type: 'LineString' as const, coordinates: plannedCoords },
    properties: {},
  };

  const trailGeoJSON = {
    type: 'Feature' as const,
    geometry: { type: 'LineString' as const, coordinates: trailCoords },
    properties: {},
  };

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={S.title}>Live Map</Text>
        <View style={S.backBtn} />
      </View>

      {/* Full map */}
      <View style={S.mapContainer}>
        <Map style={S.map} mapStyle={MAP_STYLE}>
          <Camera
            ref={cameraRef}
            center={center}
            zoom={zoom}
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

          {stops.map((stop: any) => (
            <Marker key={`s-${stop.id}`} id={`s-${stop.id}`} lngLat={[stop.lon, stop.lat]}>
              <View style={S.stopDot} />
            </Marker>
          ))}

          {animatedBus && (
            <Marker id="bus" lngLat={animatedBus}>
              <View style={S.busMarker}>
                <Ionicons name="location" size={48} color={busPosition?.is_live ? '#16a34a' : '#6b7280'} />
                <Ionicons name="bus" size={16} color="#fff" style={S.busIcon} />
              </View>
            </Marker>
          )}
        </Map>

        {/* Status pill */}
        {animatedBus && (
          <View style={S.statusPill}>
            <View style={[S.statusDot, { backgroundColor: busPosition?.is_live ? '#16a34a' : '#9ca3af' }]} />
            <Text style={S.statusText}>
              {busPosition?.is_live ? 'Bus Live' : 'Last Known Position'}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: Colors.white },
  header:       { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: Colors.separator, backgroundColor: Colors.white },
  backBtn:      { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  title:        { fontSize: 18, fontWeight: '700', color: Colors.black },
  mapContainer: { flex: 1, position: 'relative' },
  map:          { flex: 1 },
  stopDot:      { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2563eb', borderWidth: 2, borderColor: '#fff' },
  busMarker:    { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  busIcon:      { position: 'absolute', top: 10 },
  statusPill:   { position: 'absolute', top: 16, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.95)', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 6 },
  statusDot:    { width: 8, height: 8, borderRadius: 4 },
  statusText:   { fontSize: 14, fontWeight: '700', color: Colors.black },
});
