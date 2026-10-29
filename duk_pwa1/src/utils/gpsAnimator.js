// gpsAnimator.js
// Smooth marker animation controller with buffering + clustering + road-following.

class GPSAnimator {
  constructor(options = {}) {
    // We don't take the map or marker in constructor anymore because React controls the marker
    // Instead we will call a callback function with the current coordinate to animate to
    
    this.onPositionUpdate = options.onPositionUpdate; // Callback to set marker pos
    this.onSegmentFinished = options.onSegmentFinished; // Callback to commit trail
    this.onJump = options.onJump;                       // Callback when the marker teleports (no leg)

    //  Tuning 
    this.CLUSTER_RADIUS_M   = options.clusterRadiusM   ?? 10;   // deadband: GPS drift at a stop is 3–10 m
    this.STATIONARY_KMH     = options.stationaryKmh    ?? 2.5;  // below this the bus is treated as stopped
    this.STOPPED_RADIUS_M   = options.stoppedRadiusM   ?? 25;   // ...and fixes this close are held
    this.MAX_BACKLOG        = options.maxBacklog       ?? 2;    // more queued legs than this = catch-up: skip to newest
    this.STALE_GAP_MS       = options.staleGapMs       ?? 30000; // a gap this long (sleep / reconnect) = teleport
    this.TELEPORT_M         = options.teleportM        ?? 1500;  // so far away that animating would be a "rush"
    this.DETOUR_FACTOR      = options.detourFactor     ?? 2;     // road path longer than this × straight line ...
    this.DETOUR_SLACK_M     = options.detourSlackM     ?? 80;    // ... plus this = a routing detour, not the bus's path
    this.MAX_ANIM_DURATION  = options.maxAnimDuration  ?? 8000; // cap animation length (ms) 
    this.MIN_ANIM_DURATION  = options.minAnimDuration  ?? 800;  // floor, avoid instant snaps
    this.FETCH_ROAD_SEGMENT = options.fetchRoadSegment ?? true; // follow real road shape
    this.segmentFetcher     = options.segmentFetcher;           // async (lat1,lon1,lat2,lon2) => [[lon,lat],...]

    //  State 
    this.queue = [];                 // buffered incoming points: {lat, lon, timestamp}
    this.currentPos = null;          // where the marker visually is right now
    this.animating = false;
    this.animFrame = null;
    this.lastPointTime = null;

    // Precomputed segment data for the current animation leg.
    // Storing cumulative distances avoids the O(n) linear scan
    // on every animation frame — replaced with a binary search O(log n).
    this._segData = null; // { path, segLengths, cumLengths, totalLength }
  }

  /**
   * Call this every time a new GPS point arrives from the WebSocket.
   * Does NOT move the marker immediately — just queues it.
   */
  pushPoint(lat, lon, serverTimeIso, precomputedOsrmPath, speedKmh = null) {
    const timestamp = serverTimeIso ? new Date(serverTimeIso).getTime() : Date.now();

    // First point ever — place marker directly, nothing to animate from
    if (this.currentPos === null) {
      this._jumpTo(lat, lon, timestamp, true);
      return;
    }

    // Long silence (phone slept, WS reconnected) or a far jump: animating from
    // the stale spot is the "fast-forward rush". Appear at the new spot instead.
    const gap = this.lastPointTime != null ? timestamp - this.lastPointTime : 0;
    const far = this._haversineM(this.currentPos.lat, this.currentPos.lon, lat, lon) > this.TELEPORT_M;
    if (gap > this.STALE_GAP_MS || far) {
      this._jumpTo(lat, lon, timestamp);
      return;
    }

    this.queue.push({ lat, lon, timestamp, precomputedOsrmPath, speedKmh });

    // Backlog (rAF paused in background, slow segment fetch): drop the stale
    // middle legs and go straight for the newest fix.
    if (this.queue.length > this.MAX_BACKLOG) {
      this.queue = [this.queue[this.queue.length - 1]];
      this.queue[0].catchUp = true;
    }
    // A leg is still playing but newer fixes are waiting: finish it briskly
    // instead of letting it run its full (up to 8 s) duration.
    if (this._anim) {
      const now = performance.now();
      const elapsed = now - this._anim.startTime;
      const remaining = this._anim.duration - elapsed;
      if (remaining > this.MIN_ANIM_DURATION) this._anim.duration = elapsed + this.MIN_ANIM_DURATION;
    }

    if (!this.animating) {
      this._processQueue();
    }
  }

  /** Cancel any animation and place the marker at a point, no trail leg. */
  _jumpTo(lat, lon, timestamp, first = false) {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.animFrame = null;
    this.queue = [];
    this._segData = null;
    this._anim = null;
    this.animating = false;
    this._gen = (this._gen || 0) + 1; // invalidates an in-flight segment fetch
    this.currentPos = { lat, lon };
    this.lastPointTime = timestamp;
    this.onPositionUpdate([lon, lat]);
    if (this.onJump && !first) this.onJump([lon, lat]);
  }

  async _processQueue() {
    if (this.queue.length === 0) {
      this.animating = false;
      return;
    }
    this.animating = true;

    const next = this.queue.shift();
    const distM = this._haversineM(
      this.currentPos.lat, this.currentPos.lon, next.lat, next.lon
    );

    //  Deadband: bus is stopped / drifting — hold the marker completely still.
    // (Any nudge, even an EMA one, reads as shaking at a stop.)
    const stopped = next.speedKmh != null && next.speedKmh < this.STATIONARY_KMH;
    if (distM < this.CLUSTER_RADIUS_M || (stopped && distM < this.STOPPED_RADIUS_M)) {
      this.lastPointTime = next.timestamp;
      this._processQueue();
      return;
    }

    //  Compute animation duration from actual time gap between pings 
    let duration = next.timestamp - (this.lastPointTime || (next.timestamp - 5000));
    duration = Math.max(this.MIN_ANIM_DURATION, Math.min(this.MAX_ANIM_DURATION, duration));
    // Catching up, or more points already waiting: move briskly to stay live.
    if (next.catchUp || this.queue.length > 0) duration = this.MIN_ANIM_DURATION;
    this.lastPointTime = next.timestamp;
    const gen = this._gen || 0;

    //  Optionally fetch the real road geometry for this leg 
    let path = [
      [this.currentPos.lon, this.currentPos.lat],
      [next.lon, next.lat],
    ];
    
    if (next.precomputedOsrmPath && next.precomputedOsrmPath.length >= 2) {
      // Backend already calculated the route geometry, use it directly!
      path = next.precomputedOsrmPath;
    } else if (this.FETCH_ROAD_SEGMENT && this.segmentFetcher && distM > 30) {
      try {
        const roadPath = await this.segmentFetcher(
          this.currentPos.lat, this.currentPos.lon, next.lat, next.lon
        );
        // segmentFetcher returns GeoJSON coords like [[lon, lat], [lon, lat]]
        if (roadPath && roadPath.length >= 2) {
          path = roadPath;
        }
      } catch (e) {
        // Fall back to straight line silently
      }
      // A jump happened while we awaited the fetch — this leg is obsolete.
      if (gen !== (this._gen || 0)) return;
    }

    // Start the leg exactly at the marker and end exactly at the fix, so there
    // is no teleport at either end (backend paths start at the last *trace*
    // point, which is not always where the marker is).
    path = this._anchorPath(path, this.currentPos, next);

    // OSRM can't U-turn or drive a one-way backwards, so between two close
    // fixes it sometimes returns a loop around the block. Driving the marker
    // round that loop is the "goes off and jumps back" effect (worst on
    // unscheduled trips, which have no planned route). Hop straight instead.
    if (this._pathLength(path) > this.DETOUR_FACTOR * distM + this.DETOUR_SLACK_M) {
      path = [[this.currentPos.lon, this.currentPos.lat], [next.lon, next.lat]];
    }

    // Precompute segment data for O(log n) frame interpolation
    this._segData = this._buildSegData(path);
    this._animateAlongPath(path, duration, next);
  }

  /**
   * Precompute cumulative distances along a path so the per-frame
   * position lookup can use binary search instead of a linear scan.
   *
   * @param {Array} path - [[lon, lat], ...]
   * @returns {{ path, segLengths, cumLengths, totalLength }}
   */
  _buildSegData(path) {
    const segLengths = [];
    const cumLengths = [0]; // cumLengths[i] = distance from start to path[i]
    let totalLength = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const d = this._haversineM(path[i][1], path[i][0], path[i + 1][1], path[i + 1][0]);
      segLengths.push(d);
      totalLength += d;
      cumLengths.push(totalLength);
    }
    if (totalLength === 0) totalLength = 1; // avoid div by zero

    return { path, segLengths, cumLengths, totalLength };
  }

  /**
   * Binary search into cumLengths to find which segment contains targetDist.
   * O(log n) vs the previous O(n) linear scan — matters on long OSRM paths
   * with many waypoints that get re-evaluated 60× per second.
   *
   * @returns {{ point: [lon, lat], segIndex: number }}
   */
  _interpolatePosition(targetDist) {
    const { path, segLengths, cumLengths, totalLength } = this._segData;

    if (targetDist >= totalLength) {
      return { point: path[path.length - 1], segIndex: path.length - 2 };
    }

    // Binary search: find index i such that cumLengths[i] <= targetDist < cumLengths[i+1]
    let lo = 0;
    let hi = segLengths.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumLengths[mid + 1] <= targetDist) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    const i = lo;
    const segT = segLengths[i] === 0 ? 0 : (targetDist - cumLengths[i]) / segLengths[i];
    const [lon1, lat1] = path[i];
    const [lon2, lat2] = path[i + 1];
    return {
      point: [lon1 + (lon2 - lon1) * segT, lat1 + (lat2 - lat1) * segT],
      segIndex: i,
    };
  }

  _animateAlongPath(path, duration, targetPoint) {
    // Mutable so pushPoint() can shorten a leg when newer fixes arrive.
    const anim = { startTime: performance.now(), duration };
    this._anim = anim;
    const segData = this._segData;

    const step = (now) => {
      const elapsed = now - anim.startTime;
      const t = Math.min(1, elapsed / anim.duration); // 0 → 1 progress

      const targetDist = t * segData.totalLength;
      const { point, segIndex } = this._interpolatePosition(targetDist);

      //  Build the exact sliced path up to the bus's front bumper 
      const drawnPath = segIndex >= 0 ? path.slice(0, segIndex + 1) : [];
      drawnPath.push(point);

      this.onPositionUpdate(point, drawnPath);

      if (t < 1) {
        this.animFrame = requestAnimationFrame(step);
      } else {
        this._anim = null;
        this.currentPos = { lat: targetPoint.lat, lon: targetPoint.lon };
        this.onPositionUpdate([targetPoint.lon, targetPoint.lat], path);
        if (this.onSegmentFinished) this.onSegmentFinished(path);
        this._segData = null;
        // Move on to the next queued point, if any
        this._processQueue();
      }
    };

    this.animFrame = requestAnimationFrame(step);
  }

  /**
   * Trim a [[lon,lat],...] path so it begins at the vertex nearest `from` and
   * ends at the vertex nearest `to` (searched after the start), then pin the
   * true endpoints on. Falls back to a straight leg if the path is unusable.
   */
  _anchorPath(path, from, to) {
    const straight = [[from.lon, from.lat], [to.lon, to.lat]];
    if (!path || path.length < 2) return straight;
    let iFrom = 0, dFrom = Infinity;
    for (let i = 0; i < path.length; i++) {
      const d = this._haversineM(from.lat, from.lon, path[i][1], path[i][0]);
      if (d < dFrom) { dFrom = d; iFrom = i; }
    }
    let iTo = path.length - 1, dTo = Infinity;
    for (let i = iFrom; i < path.length; i++) {
      const d = this._haversineM(to.lat, to.lon, path[i][1], path[i][0]);
      if (d < dTo) { dTo = d; iTo = i; }
    }
    // Path doesn't actually connect the two points — don't animate along it.
    if (dFrom > 150 || dTo > 150) return straight;
    const mid = path.slice(iFrom, iTo + 1);
    return [[from.lon, from.lat], ...mid, [to.lon, to.lat]];
  }

  _pathLength(path) {
    let m = 0;
    for (let i = 1; i < path.length; i++) {
      m += this._haversineM(path[i - 1][1], path[i - 1][0], path[i][1], path[i][0]);
    }
    return m;
  }

  _haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
  }

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.queue = [];
    this._segData = null;
    this._gen = (this._gen || 0) + 1;
  }
}

export default GPSAnimator;
