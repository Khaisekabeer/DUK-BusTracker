import { haversineDistKm } from './math';

export const haversineM = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  return haversineDistKm(lat1, lon1, lat2, lon2) * 1000;
};

const MAX_TRAIL_COORDS = 2000;
export const SNAP_THRESHOLD_M = 30;

class TrailManager {
  trailCoords: [number, number][];
  tripId: number | null;
  _plannedCoords: [number, number][];
  _lastSnappedIdx: number;

  constructor() {
    this.trailCoords = [];
    this.tripId = null;
    this._plannedCoords = [];
    this._lastSnappedIdx = 0;
  }

  setPlannedRoute(c: any[]) {
    if (!c || !c.length) {
      this._plannedCoords = [];
      this._lastSnappedIdx = 0;
      return;
    }
    const isMulti = Array.isArray(c[0][0]);
    this._plannedCoords = isMulti ? c.flat() : c.slice();
    this._lastSnappedIdx = 0;
  }

  findNearestOnRoute(lon: number, lat: number) {
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

  setHistory(h: [number, number][]) {
    if (h && h.length > 0) {
      this.trailCoords = h.slice();
    }
  }

  commitSegment(path: [number, number][]) {
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

  getLiveTrail(animatingPath: [number, number][] = []): [number, number][] {
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

export default TrailManager;
