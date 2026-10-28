import { getRouteHistory } from '../api';

const MAX_TRAIL_COORDS = 4000;
// A fix this close to the planned line counts as "on route" (was 300 m, which
// let side streets snap onto the route and slice it).
export const SNAP_THRESHOLD_M = 60;
const BACK_TOL_M = 30;      // GPS jitter allowed behind the tracked progress
const MERGE_TOL_M = 50;     // live trail joins history if it passes this close

export function haversineM(lon1, lat1, lon2, lat2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function bearingDeg(lon1, lat1, lon2, lat2) {
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const x = Math.sin(dl) * Math.cos(p2);
  const y = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
}

function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// MultiLineString → longest LineString. Flattening segments end-to-end adds a
// phantom straight connector that corrupts slicing (same rule as the backend).
function toLine(c) {
  if (!c || !c.length) return [];
  if (Array.isArray(c[0]) && Array.isArray(c[0][0])) {
    return c.length === 1 ? c[0] : c.reduce((a, b) => (b.length > a.length ? b : a), []);
  }
  return c;
}

class TrailManager {
  constructor(mapInstance = null) {
    this.map = mapInstance;
    this.trailCoords = [];
    this.tripId = null;
    this._plannedCoords = [];
    this._cum = [];
    this._plannedKey = null;
    this._lastS = null;        // forward-only progress along the planned line (m)
    this._drawKey = null;
  }

  setMap(m) { this.map = m; this._drawKey = null; this.drawLive([]); }

  setPlannedRoute(c) {
    const line = toLine(c);
    if (!line.length) {
      this._plannedCoords = []; this._cum = []; this._plannedKey = null; this._lastS = null;
      return;
    }
    // The planned route is re-emitted on every poll. Only a genuinely different
    // line may reset progress — resetting it each poll is what made snapping
    // jump between the out and return arms.
    const f = line[0], l = line[line.length - 1];
    const key = `${line.length}:${f[0]},${f[1]}:${l[0]},${l[1]}`;
    if (key === this._plannedKey) return;
    this._plannedKey = key;
    this._plannedCoords = line.slice();
    this._cum = [0];
    for (let i = 1; i < line.length; i++) {
      this._cum.push(this._cum[i - 1] + haversineM(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]));
    }
    this._lastS = null;
  }

  hasPlanned() { return this._plannedCoords.length >= 2; }

  // Foot of the perpendicular from (lon,lat) onto segment i, in a local metre plane.
  _project(i, lon, lat) {
    const [aLon, aLat] = this._plannedCoords[i];
    const [bLon, bLat] = this._plannedCoords[i + 1];
    const k = Math.cos(aLat * Math.PI / 180);
    const bx = (bLon - aLon) * k, by = bLat - aLat;
    const px = (lon - aLon) * k, py = lat - aLat;
    const len2 = bx * bx + by * by;
    let t = len2 > 1e-18 ? (px * bx + py * by) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const fLon = aLon + t * (bLon - aLon), fLat = aLat + t * (bLat - aLat);
    return {
      point: [fLon, fLat],
      s: this._cum[i] + t * (this._cum[i + 1] - this._cum[i]),
      distM: haversineM(lon, lat, fLon, fLat),
    };
  }

  /**
   * Project a fix onto the planned line within [sMin, sMax] (null = unbounded).
   * With a heading and no window, segments pointing > 90° away are skipped so
   * the first fix can't acquire onto the opposite arm of an out-and-back route.
   */
  snap(lon, lat, sMin = null, sMax = null, heading = null) {
    const pts = this._plannedCoords;
    if (pts.length < 2) return null;
    let best = null;
    for (let i = 0; i < pts.length - 1; i++) {
      if (sMax != null && this._cum[i] > sMax) break;
      if (sMin != null && this._cum[i + 1] < sMin) continue;
      if (heading != null && sMin == null && this._cum[i + 1] - this._cum[i] > 1) {
        if (angleDiff(heading, bearingDeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])) > 90) continue;
      }
      const p = this._project(i, lon, lat);
      if (sMin != null && p.s < sMin) continue;
      if (sMax != null && p.s > sMax) continue;
      if (!best || p.distM < best.distM) best = p;
    }
    if (!best && heading != null) return this.snap(lon, lat, sMin, sMax, null);
    return best;
  }

  /**
   * Planned-route slice for one animation leg, in travel order.
   * Returns null when the leg is off the planned route (caller may ask OSRM),
   * and [] when it is on route but not moving forward — never a reversed slice
   * (caller then makes a short straight hop instead of replaying the road
   * backwards).
   */
  sliceForLeg(lon1, lat1, lon2, lat2) {
    if (!this.hasPlanned()) return null;
    const legM = haversineM(lon1, lat1, lon2, lat2);
    const heading = legM >= 15 ? bearingDeg(lon1, lat1, lon2, lat2) : null;

    let a;
    if (this._lastS == null) {
      a = this.snap(lon1, lat1, null, null, heading);
    } else {
      a = this.snap(lon1, lat1, this._lastS - BACK_TOL_M, this._lastS + 3 * legM + 200);
      if (!a || a.distM > SNAP_THRESHOLD_M) a = this.snap(lon1, lat1, null, null, heading); // re-acquire
    }
    if (!a || a.distM > SNAP_THRESHOLD_M) return null;

    // Road distance between two fixes is rarely > 3× the straight line.
    const b = this.snap(lon2, lat2, a.s - BACK_TOL_M, a.s + 3 * legM + 100);
    if (!b || b.distM > SNAP_THRESHOLD_M) return null;
    this._lastS = Math.max(this._lastS ?? -Infinity, a.s, b.s);
    if (b.s <= a.s) return [];

    const out = [a.point];
    for (let i = 0; i < this._plannedCoords.length; i++) {
      if (this._cum[i] > a.s && this._cum[i] < b.s) out.push(this._plannedCoords[i]);
    }
    out.push(b.point);
    return out;
  }

  async init(tripId) {
    if (!tripId) return;
    this.tripId = tripId;
    try {
      const data = await getRouteHistory(tripId);
      if (data?.coords?.length >= 2) this.setHistory(data.coords);
    } catch (e) { console.warn('[TrailManager]', e); }
  }

  /**
   * Seed the trail from the server's full trip history. History is the source
   * of truth from trip start; live legs committed after the history's last
   * point are kept on the end, so a slightly-behind (cached) history never
   * shrinks the trail and a longer one is never ignored.
   */
  setHistory(h) {
    if (!h || h.length < 2) return;
    const hist = h.slice();
    const end = hist[hist.length - 1];
    let tail = [];
    for (let i = this.trailCoords.length - 1; i >= 0; i--) {
      const p = this.trailCoords[i];
      if (haversineM(p[0], p[1], end[0], end[1]) <= MERGE_TOL_M) {
        tail = this.trailCoords.slice(i + 1);
        break;
      }
    }
    this.trailCoords = hist.concat(tail);
    if (this.trailCoords.length > MAX_TRAIL_COORDS) {
      this.trailCoords = this.trailCoords.slice(this.trailCoords.length - MAX_TRAIL_COORDS);
    }
    this._drawKey = null;
    this.drawLive([]);
  }

  commitSegment(path) {
    if (!path || path.length < 2) return;
    if (this.trailCoords.length > 0) {
      const l = this.trailCoords[this.trailCoords.length - 1];
      const f = path[0];
      const joined = Math.abs(l[0] - f[0]) < 0.0001 && Math.abs(l[1] - f[1]) < 0.0001;
      this.trailCoords.push(...(joined ? path.slice(1) : path));
    } else {
      this.trailCoords.push(...path);
    }
    if (this.trailCoords.length > MAX_TRAIL_COORDS) {
      this.trailCoords = this.trailCoords.slice(this.trailCoords.length - MAX_TRAIL_COORDS);
    }
    this._drawKey = null;
    this.drawLive([]);
  }

  drawLive(animatingPath) {
    if (!this.map) return;
    const source = this.map.getSource('trail');
    if (!source) return;
    const hL = this.trailCoords.length, aL = animatingPath ? animatingPath.length : 0;
    // Include the moving tip in the key: the old length-only guard skipped most
    // frames, so the trail lagged behind the marker within a leg.
    const tip = aL ? animatingPath[aL - 1] : null;
    const key = `${hL}:${aL}:${tip ? tip[0].toFixed(6) + ',' + tip[1].toFixed(6) : ''}`;
    if (key === this._drawKey) return;
    this._drawKey = key;
    const fp = this.trailCoords.slice();
    if (aL > 0) {
      if (fp.length > 0) {
        const l = fp[fp.length - 1];
        const f = animatingPath[0];
        const joined = Math.abs(l[0] - f[0]) < 0.0001 && Math.abs(l[1] - f[1]) < 0.0001;
        fp.push(...(joined ? animatingPath.slice(1) : animatingPath));
      } else {
        fp.push(...animatingPath);
      }
    }
    source.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: fp.length >= 2 ? fp : [] } });
  }

  /** Drop the drawn trail but keep the planned route and its progress. */
  clearTrail() {
    this.trailCoords = [];
    this._drawKey = null;
    this.drawLive([]);
  }

  clear() {
    this.clearTrail();
    this.tripId = null;
    this._plannedCoords = []; this._cum = []; this._plannedKey = null; this._lastS = null;
  }
}
export default TrailManager;
