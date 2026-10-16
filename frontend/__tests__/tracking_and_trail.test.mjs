import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Math functions mirroring frontend/src/utils/math.ts
export const haversineDistKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const haversineM = (lat1, lon1, lat2, lon2) => {
  return haversineDistKm(lat1, lon1, lat2, lon2) * 1000;
};

// Mirror TrailManager logic from frontend/src/utils/trailManager.ts
const MAX_TRAIL_COORDS = 2000;

class TrailManager {
  constructor() {
    this.trailCoords = [];
    this.tripId = null;
    this._plannedCoords = [];
    this._lastSnappedIdx = 0;
  }

  setPlannedRoute(c) {
    if (!c || !c.length) {
      this._plannedCoords = [];
      this._lastSnappedIdx = 0;
      return;
    }
    const isMulti = Array.isArray(c[0][0]);
    this._plannedCoords = isMulti ? c.flat() : c.slice();
    this._lastSnappedIdx = 0;
  }

  findNearestOnRoute(lon, lat) {
    if (!this._plannedCoords || !this._plannedCoords.length) return null;
    let minD = Infinity, bestIdx = -1;
    const start = Math.max(0, this._lastSnappedIdx - 5);
    for (let i = start; i < this._plannedCoords.length; i++) {
      const [pl, pa] = this._plannedCoords[i];
      const d = haversineM(lat, lon, pa, pl);
      if (d < minD) { minD = d; bestIdx = i; }
    }
    if (bestIdx === -1) return null;
    if (bestIdx > this._lastSnappedIdx) this._lastSnappedIdx = bestIdx;
    return { snapped: this._plannedCoords[bestIdx], idx: bestIdx, distM: minD };
  }

  commitSegment(path) {
    if (!path || path.length < 2) return;
    if (this.trailCoords.length > 0) {
      const l = this.trailCoords[this.trailCoords.length - 1];
      const f = path[0];
      if (Math.abs(l[0] - f[0]) < 0.0001 && Math.abs(l[1] - f[1]) < 0.0001) {
        this.trailCoords.push(...path.slice(1));
      } else {
        this.trailCoords.push(...path);
      }
    } else {
      this.trailCoords.push(...path);
    }
    if (this.trailCoords.length > MAX_TRAIL_COORDS) {
      this.trailCoords = this.trailCoords.slice(this.trailCoords.length - MAX_TRAIL_COORDS);
    }
  }

  getLiveTrail(animatingPath = []) {
    const fp = this.trailCoords.slice();
    if (animatingPath && animatingPath.length > 0) {
      if (fp.length > 0) {
        const l = fp[fp.length - 1];
        const f = animatingPath[0];
        if (Math.abs(l[0] - f[0]) < 0.0001 && Math.abs(l[1] - f[1]) < 0.0001) {
          fp.push(...animatingPath.slice(1));
        } else {
          fp.push(...animatingPath);
        }
      } else {
        fp.push(...animatingPath);
      }
    }
    return fp.length >= 2 ? fp : [];
  }

  clear() {
    this.trailCoords = [];
    this.tripId = null;
    this._plannedCoords = [];
    this._lastSnappedIdx = 0;
  }
}

// Bearing calculation from gpsAnimator.ts
function calculateBearing(lon1, lat1, lon2, lat2) {
  const toRad = Math.PI / 180;
  const dLon = (lon2 - lon1) * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2 * toRad);
  const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
            Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLon);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

// Progress calculation from RouteViewScreen.tsx
function computeTimelineProgress(stopLat, stopLon, nextLat, nextLon, busLat, busLon) {
  const dTotal = haversineDistKm(Number(stopLat), Number(stopLon), Number(nextLat), Number(nextLon));
  const dRemaining = haversineDistKm(Number(busLat), Number(busLon), Number(nextLat), Number(nextLon));
  if (dTotal <= 0.05) return 0.0;
  return Math.max(0.0, Math.min(1.0, 1.0 - (dRemaining / dTotal)));
}

describe('1. TrailManager Tests', () => {
  it('correctly initializes with empty trail and planned route', () => {
    const tm = new TrailManager();
    assert.deepEqual(tm.trailCoords, []);
    assert.deepEqual(tm.getLiveTrail(), []);
  });

  it('sets planned route and snaps point to nearest coordinate along forward direction', () => {
    const tm = new TrailManager();
    const planned = [
      [76.900, 8.500],
      [76.905, 8.505],
      [76.910, 8.510],
      [76.915, 8.515],
    ];
    tm.setPlannedRoute(planned);
    
    // Query near point 1
    const res1 = tm.findNearestOnRoute(76.9049, 8.5051);
    assert.ok(res1);
    assert.equal(res1.idx, 1);
    assert.deepEqual(res1.snapped, [76.905, 8.505]);

    // Query near point 3
    const res2 = tm.findNearestOnRoute(76.9149, 8.5151);
    assert.ok(res2);
    assert.equal(res2.idx, 3);
    assert.deepEqual(res2.snapped, [76.915, 8.515]);
  });

  it('commits segments and deduplicates adjacent overlapping coordinates', () => {
    const tm = new TrailManager();
    const seg1 = [[76.900, 8.500], [76.905, 8.505]];
    const seg2 = [[76.905, 8.505], [76.910, 8.510]]; // duplicate boundary point
    
    tm.commitSegment(seg1);
    assert.equal(tm.trailCoords.length, 2);

    tm.commitSegment(seg2);
    // Should have 3 points, not 4, because the boundary point was merged!
    assert.equal(tm.trailCoords.length, 3);
    assert.deepEqual(tm.trailCoords[1], [76.905, 8.505]);
    assert.deepEqual(tm.trailCoords[2], [76.910, 8.510]);
  });

  it('seamlessly stitches live animating path with committed trail', () => {
    const tm = new TrailManager();
    tm.commitSegment([[76.900, 8.500], [76.905, 8.505]]);

    const liveAnimatingSegment = [[76.905, 8.505], [76.907, 8.507]];
    const liveTrail = tm.getLiveTrail(liveAnimatingSegment);

    // Check seamless stitching without duplicate joint
    assert.equal(liveTrail.length, 3);
    assert.deepEqual(liveTrail[2], [76.907, 8.507]);
  });

  it('clears trail history completely on reset', () => {
    const tm = new TrailManager();
    tm.commitSegment([[76.900, 8.500], [76.905, 8.505]]);
    tm.clear();
    assert.equal(tm.trailCoords.length, 0);
    assert.deepEqual(tm.getLiveTrail(), []);
  });
});

describe('2. Map Bearing & GPS Calculations', () => {
  it('accurately calculates heading/bearing angle (North, East, South, West)', () => {
    // Due North
    const bearingNorth = calculateBearing(76.900, 8.500, 76.900, 8.600);
    assert.ok(Math.abs(bearingNorth - 0) < 0.1 || Math.abs(bearingNorth - 360) < 0.1);

    // Due East
    const bearingEast = calculateBearing(76.900, 8.500, 77.000, 8.500);
    assert.ok(Math.abs(bearingEast - 90) < 1.0);

    // Due South
    const bearingSouth = calculateBearing(76.900, 8.600, 76.900, 8.500);
    assert.ok(Math.abs(bearingSouth - 180) < 1.0);

    // Due West
    const bearingWest = calculateBearing(77.000, 8.500, 76.900, 8.500);
    assert.ok(Math.abs(bearingWest - 270) < 1.0);
  });

  it('calculates Haversine distance within acceptable real-world error margins', () => {
    // Distance between Technopark Phase 1 (~8.556, 76.881) and DUK Campus (~8.575, 76.866)
    const distKm = haversineDistKm(8.556, 76.881, 8.575, 76.866);
    assert.ok(distKm > 2.0 && distKm < 3.5, `Calculated distance ${distKm}km is within expected ~2.6km`);
  });
});

describe('3. Timeline Stop Progress & ETA Interpolation', () => {
  it('computes 0% progress when bus is at the previous stop', () => {
    const stopLat = 8.500, stopLon = 76.900;
    const nextLat = 8.550, nextLon = 76.900;
    const busLat  = 8.500, busLon  = 76.900; // at origin stop

    const progress = computeTimelineProgress(stopLat, stopLon, nextLat, nextLon, busLat, busLon);
    assert.ok(progress < 0.05, `Expected near 0 progress, got ${progress}`);
  });

  it('computes ~50% progress when bus is midway between stops', () => {
    const stopLat = 8.500, stopLon = 76.900;
    const nextLat = 8.550, nextLon = 76.900;
    const busLat  = 8.525, busLon  = 76.900; // midpoint

    const progress = computeTimelineProgress(stopLat, stopLon, nextLat, nextLon, busLat, busLon);
    assert.ok(progress >= 0.48 && progress <= 0.52, `Expected ~50% progress, got ${progress}`);
  });

  it('caps progress at 100% when bus reaches or passes the next stop', () => {
    const stopLat = 8.500, stopLon = 76.900;
    const nextLat = 8.550, nextLon = 76.900;
    const busLat  = 8.550, busLon  = 76.900; // at destination stop

    const progress = computeTimelineProgress(stopLat, stopLon, nextLat, nextLon, busLat, busLon);
    assert.equal(progress, 1.0);
  });
});
