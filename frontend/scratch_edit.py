import re

def main():
    path = r'C:\Users\khais\Documents\GitHub\DUK-BusTracker\frontend\src\screens\RouteViewScreen.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        code = f.read()

    # Move fetchData definition ABOVE the _rescheduleInterval and websocket useEffect.
    # Actually, it's easier to just move _rescheduleInterval and websocket useEffect below fetchData.
    
    ws_logic = """
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
            animatorRef.current.pushPoint(msg.data.lat, msg.data.lon, msg.data.server_time);
            if (msg.data.speed) {
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

  const status        = tripState?.status || 'offline';
"""
    # First, let's remove the ws_logic block from its current location
    # Since I inserted it using exactly `ws_logic` but without the `prev: any` fix, let's just find and replace the whole thing.
    
    # We also have the redeclared status:
    #   const status        = tripState?.status || 'offline';
    #   const isOnline      = status === 'active' || status === 'connecting';
    # ...
    #   const status        = tripState?.status || 'offline';
    
    # Let's restore RouteViewScreen.tsx from scratch/RouteViewScreen.tsx and apply the edits again properly.
    
    scratch_path = r'C:\Users\khais\.gemini\antigravity-ide\brain\cd018ef7-c36a-46b4-8165-7c0679ca0b26\scratch\RouteViewScreen.tsx'
    with open(scratch_path, 'r', encoding='utf-8') as f:
        code = f.read()
        
    # 1. Add imports
    import_addition = """
import GPSAnimator from '../utils/gpsAnimator';
import TrailManager from '../utils/trailManager';
"""
    code = re.sub(r'(import \{ registerForPushNotificationsAsync, registerForegroundHandler \} from \'../services/firebaseService\';)', r'\1' + import_addition, code)

    # 2. Add refs and state
    refs_addition = """
  const wsRef = useRef<WebSocket | null>(null);
  const isLiveRef = useRef<boolean>(false);
  const animatorRef = useRef<GPSAnimator | null>(null);
  const trailManagerRef = useRef<TrailManager | null>(null);
  const timerRef = useRef<any>(null);
"""
    code = re.sub(r'(const mapRef\s*=\s*useRef<any>\(null\);)', r'\1' + refs_addition, code)

    state_addition = "\n  const [animDrawnPath, setAnimDrawnPath] = useState<[number, number][]>([]);"
    code = re.sub(r'(const \[animatedBus,\s*setAnimatedBus\]\s*=\s*useState<\[number,\s*number\]\s*\|\s*null>\(null\);)', r'\1' + state_addition, code)
    
    # 3. Replace animateBusTo with animator initialization
    start_str = "const animateBusTo = useCallback(async (targetLat: number, targetLon: number) => {"
    end_str = "  useEffect(() => {\n    registerForPushNotificationsAsync();"
    
    start_idx = code.find(start_str)
    end_idx = code.find(end_str)
    
    replacement = """
  // Initialize Animator & Trail Manager
  useEffect(() => {
    trailManagerRef.current = new TrailManager();
    animatorRef.current = new GPSAnimator({
      onPositionUpdate: (point, drawnPath) => {
        setAnimatedBus([point[0], point[1]]);
        if (drawnPath) {
          setAnimDrawnPath(drawnPath);
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

"""
    code = code[:start_idx] + replacement + code[end_idx:]
    
    # 4. Modify fetchData to use animatorRef
    code = code.replace('animateBusTo(bus.lat, bus.lon);', 'animatorRef.current?.pushPoint(bus.lat, bus.lon, bus.server_time);')
    
    # 5. Remove the old interval logic
    old_interval = """  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(() => fetchData(), 15000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (animIntervalRef.current) cancelAnimationFrame(animIntervalRef.current);
    };
  }, [fetchData]);"""
    
    ws_logic2 = """  const _rescheduleInterval = useCallback((light: boolean) => {
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
            animatorRef.current.pushPoint(msg.data.lat, msg.data.lon, msg.data.server_time);
            if (msg.data.speed) {
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

    return () => {
      isMounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, [fetchData, _rescheduleInterval]);"""

    code = code.replace(old_interval, ws_logic2)
    
    # 6. Update trail drawing
    trail_replace = """  const liveTrail = trailManagerRef.current?.getLiveTrail(animDrawnPath) || [];
  const finalTrail = liveTrail.length > 0 ? liveTrail : trailCoords;
  const trailGeoJSON = { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: isIdleMode ? [] : finalTrail }, properties: {} };"""
    
    code = code.replace("  const trailGeoJSON = { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: isIdleMode ? [] : trailCoords }, properties: {} };", trail_replace)


    with open(path, 'w', encoding='utf-8') as f:
        f.write(code)
    print("Done")

if __name__ == '__main__':
    main()
