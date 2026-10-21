import { haversineM } from './trailManager';

type Position = { lat: number, lon: number };
type PathPoint = [number, number];

export interface GPSAnimatorOptions {
  onPositionUpdate: (point: PathPoint, drawnPath?: PathPoint[], bearing?: number) => void;
  onSegmentFinished?: (path: PathPoint[]) => void;
  clusterRadiusM?: number;
  maxAnimDuration?: number;
  minAnimDuration?: number;
  fetchRoadSegment?: boolean;
  segmentFetcher?: (lat1: number, lon1: number, lat2: number, lon2: number) => Promise<PathPoint[]>;
}

class GPSAnimator {
  onPositionUpdate: (point: PathPoint, drawnPath?: PathPoint[], bearing?: number) => void;
  onSegmentFinished?: (path: PathPoint[]) => void;
  CLUSTER_RADIUS_M: number;
  MAX_ANIM_DURATION: number;
  MIN_ANIM_DURATION: number;
  FETCH_ROAD_SEGMENT: boolean;
  segmentFetcher?: (lat1: number, lon1: number, lat2: number, lon2: number) => Promise<PathPoint[]>;

  queue: { lat: number, lon: number, timestamp: number }[];
  currentPos: Position | null;
  animating: boolean;
  animFrame: number | null;
  lastPointTime: number | null;
  _segData: { path: PathPoint[], segLengths: number[], cumLengths: number[], totalLength: number } | null;

  constructor(options: GPSAnimatorOptions) {
    this.onPositionUpdate = options.onPositionUpdate;
    this.onSegmentFinished = options.onSegmentFinished;

    this.CLUSTER_RADIUS_M = options.clusterRadiusM ?? 15;
    this.MAX_ANIM_DURATION = options.maxAnimDuration ?? 8000;
    this.MIN_ANIM_DURATION = options.minAnimDuration ?? 800;
    this.FETCH_ROAD_SEGMENT = options.fetchRoadSegment ?? true;
    this.segmentFetcher = options.segmentFetcher;

    this.queue = [];
    this.currentPos = null;
    this.animating = false;
    this.animFrame = null;
    this.lastPointTime = null;
    this._segData = null;
  }

  pushPoint(lat: number, lon: number, serverTimeIso?: string) {
    const timestamp = serverTimeIso ? new Date(serverTimeIso).getTime() : Date.now();

    if (this.currentPos === null) {
      this.currentPos = { lat, lon };
      this.onPositionUpdate([lon, lat]);
      this.lastPointTime = timestamp;
      return;
    }

    this.queue.push({ lat, lon, timestamp });

    if (!this.animating) {
      this._processQueue();
    }
  }

  async _processQueue() {
    if (this.queue.length === 0) {
      this.animating = false;
      return;
    }
    this.animating = true;

    const next = this.queue.shift()!;
    const distM = haversineM(
      this.currentPos!.lat, this.currentPos!.lon, next.lat, next.lon
    );

    if (distM < this.CLUSTER_RADIUS_M) {
      this.currentPos = { lat: next.lat, lon: next.lon };
      this.onPositionUpdate([next.lon, next.lat]);
      this.lastPointTime = next.timestamp;
      requestAnimationFrame(() => this._processQueue());
      return;
    }

    let duration = next.timestamp - (this.lastPointTime || (next.timestamp - 5000));
    duration = Math.max(this.MIN_ANIM_DURATION, Math.min(this.MAX_ANIM_DURATION, duration));
    this.lastPointTime = next.timestamp;

    let path: PathPoint[] = [
      [this.currentPos!.lon, this.currentPos!.lat],
      [next.lon, next.lat],
    ];

    if (this.FETCH_ROAD_SEGMENT && this.segmentFetcher && distM > 30) {
      try {
        const roadPath = await this.segmentFetcher(
          this.currentPos!.lat, this.currentPos!.lon, next.lat, next.lon
        );
        if (roadPath && roadPath.length >= 2) {
          path = roadPath;
        }
      } catch (_) {
        // Fall back to straight line
      }
    }

    this._segData = this._buildSegData(path);
    this._animateAlongPath(path, duration, next);
  }

  _buildSegData(path: PathPoint[]) {
    const segLengths: number[] = [];
    const cumLengths: number[] = [0];
    let totalLength = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const d = haversineM(path[i][1], path[i][0], path[i + 1][1], path[i + 1][0]);
      segLengths.push(d);
      totalLength += d;
      cumLengths.push(totalLength);
    }
    if (totalLength === 0) totalLength = 1;

    return { path, segLengths, cumLengths, totalLength };
  }

  _interpolatePosition(targetDist: number): { point: PathPoint, segIndex: number } {
    const { path, segLengths, cumLengths, totalLength } = this._segData!;

    if (targetDist >= totalLength) {
      return { point: path[path.length - 1], segIndex: path.length - 2 };
    }

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

  _animateAlongPath(path: PathPoint[], duration: number, targetPoint: Position) {
    const startTime = Date.now();
    const segData = this._segData!;

    const step = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);

      const targetDist = t * segData.totalLength;
      const { point, segIndex } = this._interpolatePosition(targetDist);

      const drawnPath = segIndex >= 0 ? path.slice(0, segIndex + 1) : [];
      drawnPath.push(point);

      let bearing: number | undefined;
      if (segIndex >= 0 && segIndex < path.length - 1) {
        const [lon1, lat1] = path[segIndex];
        const [lon2, lat2] = path[segIndex + 1];
        const toRad = Math.PI / 180;
        const dLon = (lon2 - lon1) * toRad;
        const y = Math.sin(dLon) * Math.cos(lat2 * toRad);
        const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
                  Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLon);
        bearing = (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
      }

      this.onPositionUpdate(point, drawnPath, bearing);

      if (t < 1) {
        this.animFrame = requestAnimationFrame(step);
      } else {
        this.currentPos = { lat: targetPoint.lat, lon: targetPoint.lon };
        this.onPositionUpdate([targetPoint.lon, targetPoint.lat], path);
        if (this.onSegmentFinished) this.onSegmentFinished(path);
        this._segData = null;
        this._processQueue();
      }
    };

    this.animFrame = requestAnimationFrame(step);
  }

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.queue = [];
    this._segData = null;
  }
}

export default GPSAnimator;
