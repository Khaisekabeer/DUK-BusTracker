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

const MAP_STYLE   = 'https://tiles.openfreemap.org/styles/liberty';
const DEFAULT_CENTER: [number, number] = [76.9366, 8.5241];
const DEFAULT_ZOOM = 12;
const POLL_MS = 15000;

export default function MapFullScreen({ navigation }: any) {
  const [busPosition, setBusPosition] = useState<any>(null);
  const [stops, setStops] = useState<any[]>([]);
  const [trailCoords, setTrailCoords] = useState<[number, number][]>([]);
  const cameraRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);

  const fetchData = useCallback(async () => {
    try {
      const [gpsRes, stopsRes] = await Promise.all([
        trackingApi.getLatest(),
        trackingApi.getStops(),
      ]);
      if (gpsRes.data) setBusPosition(gpsRes.data);
      if (stopsRes.data?.stops) setStops(stopsRes.data.stops);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, POLL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  const busCoord: [number, number] | null = busPosition?.lat
    ? [busPosition.lon, busPosition.lat]
    : null;

  const center = busCoord ?? DEFAULT_CENTER;
  const zoom   = busCoord ? 14 : DEFAULT_ZOOM;

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

          {busCoord && (
            <Marker id="bus" lngLat={busCoord}>
              <View style={S.busMarker}>
                <Ionicons name="location" size={48} color={busPosition?.is_live ? '#16a34a' : '#6b7280'} />
                <Ionicons name="bus" size={16} color="#fff" style={S.busIcon} />
              </View>
            </Marker>
          )}
        </Map>

        {/* Status pill */}
        {busCoord && (
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
