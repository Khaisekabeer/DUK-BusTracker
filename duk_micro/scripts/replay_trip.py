#!/usr/bin/env python3
"""
replay_trip.py — stream a recorded bus trip into the LOCAL GPS ingestion API.

Reproduces live-map bugs (jitter, back-jumps, catch-up rush, trail gaps,
wrong visited stops / ETAs) from real data, then lets you watch the PWA
(http://localhost:5175) while the trip plays back.

Sources (pick one):
  --trip-id N            gps_logs rows tagged with that trip (default table)
  (nothing)              the latest completed trip
  --from/--to "YYYY-MM-DD HH:MM"   gps_logs by IST time window
  --file trip.json       a dump made with --dump (works with no DB at all)
  --table trip_trace     use trip_trace.raw_* instead of gps_logs

Typical local run (stack up with ./dev-up.sh):
  # 1. export a real trip from a DB that has data (read-only query):
  python3 duk_micro/scripts/replay_trip.py --db postgresql://user:pw@host/db --trip-id 123 --dump /tmp/trip123.json
  # 2. replay it locally, creating a running trip for today so trace/lifecycle/ETA engage:
  python3 duk_micro/scripts/replay_trip.py --file /tmp/trip123.json --make-trip --speed 2

Empty local DB? Seed the real stop list + pinned fixed route, then replay a
synthetic trip (stops with 8 m GPS drift, motion noise, one 60 s GPS gap):
  python3 duk_micro/scripts/replay_trip.py --seed-demo
  python3 duk_micro/scripts/replay_trip.py --synthetic reverse --make-trip --speed 4

Each point is POSTed to /api/v1/gps (X-API-Key) as {"event":"GPS",...}; the
response carries the processed (snapped/clustered) position. Route progress
`s` / off-route state are read back from Redis (routestate:<device>).

DB / Redis access: uses asyncpg / redis-py when importable, else falls back to
`docker exec` into the local postgres / redis containers (REPLAY_PG_CONTAINER /
REPLAY_REDIS_CONTAINER, default duk_micro-postgres-1 / duk_micro-redis-1).
Write actions (--make-trip, --reset-state) refuse non-local databases.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone, timedelta

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ENV_FILE = os.path.join(ROOT, "duk_micro", ".env")
IST = timezone(timedelta(hours=5, minutes=30))


# ── helpers ───────────────────────────────────────────────────────────────────

def read_env(name: str, default: str = "") -> str:
    if os.environ.get(name):
        return os.environ[name]
    try:
        with open(ENV_FILE) as fh:
            for line in fh:
                if line.startswith(name + "="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return default


def hav_m(la1, lo1, la2, lo2) -> float:
    r = 6_371_000.0
    dlat, dlon = math.radians(la2 - la1), math.radians(lo2 - lo1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(la1)) * math.cos(math.radians(la2)) * math.sin(dlon / 2) ** 2
    return r * 2 * math.asin(math.sqrt(min(1.0, a)))


PG_CONTAINER = os.environ.get("REPLAY_PG_CONTAINER", "duk_micro-postgres-1")
REDIS_CONTAINER = os.environ.get("REPLAY_REDIS_CONTAINER", "duk_micro-redis-1")


def is_local(url: str) -> bool:
    return any(h in url for h in ("@127.0.0.1", "@localhost", "@postgres"))


# ── DB access ─────────────────────────────────────────────────────────────────

class Db:
    """Tiny query runner: asyncpg if available, else psql in the compose container."""

    def __init__(self, url: str | None):
        self.url = (url or "").replace("postgresql+asyncpg://", "postgresql://")
        if not url:
            # No URL given: always talk to the compose postgres container, never
            # whatever else happens to listen on localhost:5432.
            self.mode = "docker"
            return
        try:
            import asyncpg  # noqa: F401
            self.mode = "asyncpg"
        except ImportError:
            self.mode = "psql" if shutil.which("psql") else "docker"

    def query(self, sql: str, *params) -> list[dict]:
        if self.mode == "asyncpg":
            return asyncio.run(self._aq(sql, *params))
        # psql path: inline params (only ints / ISO strings are ever passed here).
        for i, p in enumerate(params, 1):
            lit = str(int(p)) if isinstance(p, int) else "'" + str(p).replace("'", "''") + "'"
            sql = sql.replace(f"${i}", lit)
        # CTE form so INSERT/UPDATE ... RETURNING works as well as SELECT.
        wrapped = f"WITH t AS ({sql}) SELECT coalesce(json_agg(t), '[]'::json) FROM t"
        if self.mode == "psql":
            cmd = ["psql", self.url, "-At", "-c", wrapped]
        else:
            cmd = ["docker", "exec", "-i", PG_CONTAINER, "psql", "-U", "duk", "-d", "duk_bus", "-At", "-c", wrapped]
        out = subprocess.run(cmd, capture_output=True, text=True)
        if out.returncode != 0:
            sys.exit(f"DB query failed: {out.stderr.strip()}")
        return json.loads(out.stdout.strip() or "[]")

    async def _aq(self, sql, *params):
        import asyncpg
        conn = await asyncpg.connect(self.url)
        try:
            rows = await conn.fetch(sql, *params)
            return [dict(r) for r in rows]
        finally:
            await conn.close()


# ── Redis access ──────────────────────────────────────────────────────────────

class Rds:
    def __init__(self):
        self.pw = read_env("REDIS_PASSWORD")
        self.url = os.environ.get("REDIS_URL") or f"redis://:{self.pw}@127.0.0.1:6379/0"
        self.client = None
        try:
            import redis  # noqa: F401
            self.client = redis.Redis.from_url(self.url, socket_timeout=1)
            self.client.ping()
        except Exception:
            self.client = None

    def _cli(self, *args) -> str:
        cmd = ["docker", "exec", "-i", REDIS_CONTAINER, "redis-cli", "--no-auth-warning",
               *(("-a", self.pw) if self.pw else ()), *args]
        out = subprocess.run(cmd, capture_output=True, text=True)
        return out.stdout.strip() if out.returncode == 0 else ""

    def get(self, key: str):
        if self.client is not None:
            v = self.client.get(key)
            return v.decode() if isinstance(v, bytes) else v
        return self._cli("GET", key) or None

    def delete(self, *keys: str):
        if self.client is not None:
            self.client.delete(*keys)
        else:
            self._cli("DEL", *keys)


# ── point loading ─────────────────────────────────────────────────────────────

def load_points(args, db: Db) -> tuple[list[dict], dict]:
    if args.file:
        with open(args.file) as fh:
            data = json.load(fh)
        return data["points"], data.get("trip", {})

    trip = {}
    trip_id = args.trip_id
    if trip_id is None and not args.from_:
        rows = db.query("SELECT id FROM trips WHERE status = 'completed' "
                        "ORDER BY ended_at DESC NULLS LAST, id DESC LIMIT 1")
        if not rows:
            sys.exit("No completed trip found — pass --trip-id or --from/--to.")
        trip_id = int(rows[0]["id"])
    if trip_id is not None:
        rows = db.query("SELECT id, route_id, direction, date::text AS date, status FROM trips WHERE id = $1", trip_id)
        trip = rows[0] if rows else {"id": trip_id}

    if args.table == "trip_trace":
        if trip_id is None:
            sys.exit("--table trip_trace needs a trip id")
        pts = db.query("SELECT raw_lat AS lat, raw_lon AS lon, speed_kmh AS speed, gps_time::text AS ts "
                       "FROM trip_trace WHERE trip_id = $1 ORDER BY gps_time", trip_id)
    elif trip_id is not None:
        pts = db.query("SELECT lat, lon, speed, coalesce(gps_time, server_time)::text AS ts FROM gps_logs "
                       "WHERE trip_id = $1 AND lat IS NOT NULL AND event IS NULL ORDER BY server_time", trip_id)
    else:
        pts = db.query("SELECT lat, lon, speed, coalesce(gps_time, server_time)::text AS ts FROM gps_logs "
                       "WHERE ist_time >= $1 AND ist_time <= $2 AND lat IS NOT NULL AND event IS NULL "
                       "ORDER BY server_time", args.from_, args.to or "2999-01-01")
    return pts, trip


def parse_ts(ts) -> float:
    s = str(ts).replace(" ", "T")
    if s.endswith("+00"):
        s += ":00"
    d = datetime.fromisoformat(s)
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.timestamp()


# ── demo seed + synthetic trip (local DB only) ────────────────────────────────

# Stop list / schedule as published on the public site (duk_bus_website/src/constants.js).
DEMO_STOPS = [
    ("Central Polytechnic", 8.5350, 76.9908, "07:30 AM", "07:00 PM"),
    ("Vattiyoorkavu Jn", 8.5241, 76.9882, "07:33 AM", "06:55 PM"),
    ("Manjadimoodu", 8.5233, 76.9852, "07:37 AM", "06:48 PM"),
    ("Maruthankuzhi", 8.5138, 76.9790, "07:42 AM", "06:43 PM"),
    ("Sasthamangalam", 8.5129, 76.9710, "07:50 AM", "06:35 PM"),
    ("Vellayambalam", 8.5116, 76.9626, "07:57 AM", "06:28 PM"),
    ("Thampanoor", 8.4875, 76.9528, "08:03 AM", "06:22 PM"),
    ("Chandrasekharan Nair Stadium", 8.5046, 76.9512, "08:06 AM", "06:19 PM"),
    ("PMG", 8.5084, 76.9500, "08:08 AM", "06:17 PM"),
    ("Pattom", 8.5186, 76.9424, "08:10 AM", "06:15 PM"),
    ("Kesavadasapuram", 8.5297, 76.9386, "08:12 AM", "06:13 PM"),
    ("Ulloor", 8.5299, 76.9288, "08:14 AM", "06:11 PM"),
    ("Pongumoodu", 8.5402, 76.9246, "08:17 AM", "06:08 PM"),
    ("Sreekaryam", 8.5488, 76.9172, "08:20 AM", "06:05 PM"),
    ("Chavadimukku", 8.5510, 76.9114, "08:22 AM", "06:03 PM"),
    ("Karyavattom", 8.5665, 76.8912, "08:25 AM", "06:00 PM"),
    ("IIITMK", 8.5588, 76.8790, "08:30 AM", "05:55 PM"),
    ("Technopark Front", 8.5578, 76.8763, "08:32 AM", "05:53 PM"),
    ("Kazhakuttam", 8.5668, 76.8743, "08:33 AM", "05:52 PM"),
    ("Pallipuram", 8.5979, 76.8546, "08:40 AM", "05:45 PM"),
    ("Digital University Kerala", 8.6158, 76.8527, "08:45 AM", "05:40 PM"),
]
FIXED_ROUTES = os.path.join(ROOT, "duk_micro", "deploy", "fixed_routes")


def _fixed_line(direction: str) -> list:
    with open(os.path.join(FIXED_ROUTES, f"{direction}.geojson")) as fh:
        g = json.load(fh)
    feat = g["features"][0] if "features" in g else g
    return feat["geometry"]["coordinates"]


def seed_demo(db: Db, rds: Rds):
    if not is_local(db.url) and db.mode != "docker":
        sys.exit("--seed-demo refuses a non-local DATABASE_URL.")
    if db.query("SELECT id FROM bus_stops LIMIT 1"):
        print("[seed] bus_stops already has rows — leaving stops as they are.")
        route_id = int(db.query("SELECT route_id FROM bus_stops LIMIT 1")[0]["route_id"])
    else:
        rows = db.query("SELECT id FROM routes ORDER BY id LIMIT 1") or \
            db.query("INSERT INTO routes (name) VALUES ('DUK Main Route') RETURNING id")
        route_id = int(rows[0]["id"])
        n = len(DEMO_STOPS)
        for i, (name, lat, lon, mt, et) in enumerate(DEMO_STOPS):
            db.query(
                "INSERT INTO bus_stops (route_id, name, lat, lon, order_index, morning_order_index, "
                "evening_order_index, morning_time, evening_time, is_morning_origin, is_morning_destination, "
                "is_evening_origin, is_evening_destination) VALUES "
                f"($1, $2, {lat}, {lon}, {i}, {i}, {n - 1 - i}, $3, $4, {str(i == 0).lower()}, {str(i == n - 1).lower()}, "
                f"{str(i == n - 1).lower()}, {str(i == 0).lower()}) RETURNING id",
                route_id, name, mt, et)
        print(f"[seed] inserted {n} stops on route {route_id}")
    for direction in ("forward", "reverse"):
        line = _fixed_line(direction)
        payload = json.dumps({"coordinates": [line], "type": "MultiLineString"})
        db.query("INSERT INTO route_geometry_cache (route_id, direction, coordinates, computed_at) "
                 "VALUES ($1, $2, CAST($3 AS jsonb), now()) ON CONFLICT (route_id, direction) "
                 "DO UPDATE SET coordinates = EXCLUDED.coordinates, computed_at = now() RETURNING id",
                 route_id, direction, json.dumps([line]))
        if rds.client is not None:
            rds.client.set(f"cache:route_geometry:{direction}", payload)
            rds.client.set(f"cache:route_geometry_pinned:{direction}", "1")
            rds.client.incr(f"cache:route_geometry_version:{direction}")
        else:
            rds._cli("SET", f"cache:route_geometry:{direction}", payload)
            rds._cli("SET", f"cache:route_geometry_pinned:{direction}", "1")
            rds._cli("INCR", f"cache:route_geometry_version:{direction}")
    rds.delete("cache:stops:v2", "cache:routes:v2")
    print("[seed] pinned fixed routes (forward/reverse) in DB + Redis")


def synthetic_points(direction: str, seed: int = 7) -> list[dict]:
    """Drive the fixed route: ~32 km/h, 3 s pings, 25 s dwell with ±8 m drift
    at each stop, ±4 m noise in motion, and one 60 s GPS blackout mid-trip."""
    import random
    rnd = random.Random(seed)
    line = _fixed_line(direction)
    # Densify the polyline to 1 m steps by distance.
    cum = [0.0]
    for a, b in zip(line, line[1:]):
        cum.append(cum[-1] + hav_m(a[1], a[0], b[1], b[0]))
    total = cum[-1]

    def at(d):
        d = max(0.0, min(d, total))
        i = next(k for k in range(1, len(cum)) if cum[k] >= d)
        seg = cum[i] - cum[i - 1] or 1.0
        t = (d - cum[i - 1]) / seg
        (lo1, la1), (lo2, la2) = line[i - 1], line[i]
        return la1 + t * (la2 - la1), lo1 + t * (lo2 - lo1)

    def jitter(lat, lon, m):
        return (lat + rnd.uniform(-m, m) / 111_320.0,
                lon + rnd.uniform(-m, m) / (111_320.0 * math.cos(math.radians(lat))))

    # Distance along the line of each stop (nearest vertex, in travel order).
    stops = DEMO_STOPS if direction == "forward" else list(reversed(DEMO_STOPS))
    stop_d, last = [], 0
    for _, slat, slon, *_ in stops:
        best = min(range(last, len(line)), key=lambda k: hav_m(slat, slon, line[k][1], line[k][0]))
        if hav_m(slat, slon, line[best][1], line[best][0]) < 300:
            stop_d.append(cum[best])
            last = best
    t = datetime.now(timezone.utc).timestamp()
    pts, d, v = [], 0.0, 32 / 3.6
    gap_at = total * 0.45
    gapped = False
    next_stop = 0
    while d < total:
        if next_stop < len(stop_d) and d >= stop_d[next_stop]:
            for _ in range(8):  # dwell ~25 s, bus stopped, GPS drifting
                lat, lon = jitter(*at(stop_d[next_stop]), 8)
                pts.append({"lat": lat, "lon": lon, "speed": round(rnd.uniform(0, 1.5), 1), "ts": t})
                t += 3
            next_stop += 1
        d += v * 3
        t += 3
        if not gapped and d >= gap_at:
            gapped = True
            d += v * 60  # bus keeps driving through a 60 s blackout
            t += 60
        lat, lon = jitter(*at(d), 4)
        pts.append({"lat": lat, "lon": lon, "speed": round(32 + rnd.uniform(-6, 6), 1), "ts": t})
    for p in pts:
        p["ts"] = datetime.fromtimestamp(p["ts"], timezone.utc).isoformat()
    return pts


# ── local trip setup ──────────────────────────────────────────────────────────

def make_trip(db: Db, rds: Rds, src_trip: dict, args) -> int:
    if not is_local(db.url) and db.mode != "docker":
        sys.exit("--make-trip refuses a non-local DATABASE_URL.")
    direction = args.direction or src_trip.get("direction") or "forward"
    route_id = src_trip.get("route_id") or args.route_id
    today = datetime.now(IST).date().isoformat()
    # Retire other running trips today so ingestion/tracking resolve this one.
    db.query("UPDATE trips SET status = 'completed', ended_at = now() "
             "WHERE date = $1 AND status IN ('on_trip','active','late') RETURNING id", today)
    rows = db.query("INSERT INTO trips (route_id, date, direction, status, started_at) "
                    "VALUES ($1, $2, $3, 'on_trip', now()) RETURNING id", int(route_id), today, direction)
    new_id = int(rows[0]["id"])
    reset_state(rds, args.device)
    print(f"[replay] created running trip #{new_id} ({direction}, route {route_id}) for {today}")
    return new_id


def reset_state(rds: Rds, device: str):
    rds.delete(f"routestate:{device}", f"cluster:{device}", f"gpsfilter:{device}", f"snapstate:{device}",
               "cache:active_trip_id:running", "cache:active_trip_id:morning", "cache:active_trip_id:evening",
               "cache:active_trip_id")


# ── sending ───────────────────────────────────────────────────────────────────

def send_http(url: str, key: str, lat: float, lon: float, speed) -> dict:
    body = json.dumps({"event": "GPS", "lat": lat, "lon": lon, "speed": float(speed or 0.0)}).encode()
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"X-API-Key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return {"status": "error", "code": e.code, "detail": e.read().decode(errors="ignore")[:200]}
    except urllib.error.URLError as e:
        return {"status": "error", "detail": str(e.reason)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--trip-id", type=int)
    ap.add_argument("--from", dest="from_", help='IST start, "YYYY-MM-DD HH:MM"')
    ap.add_argument("--to", help='IST end, "YYYY-MM-DD HH:MM"')
    ap.add_argument("--file", help="replay a JSON dump instead of querying a DB")
    ap.add_argument("--dump", help="write the selected points to this JSON file and exit")
    ap.add_argument("--table", choices=["gps_logs", "trip_trace"], default="gps_logs")
    ap.add_argument("--speed", type=float, default=1.0,
                    help="playback factor (1 = real time). Ingest stamps points with arrival time, so "
                         "speed x bus km/h must stay under the GPS filter's 110 km/h limit (≈3 for city trips)")
    ap.add_argument("--step", action="store_true", help="wait for Enter before each point")
    ap.add_argument("--max-gap", type=float, default=30.0, help="cap a recorded silence to this many seconds")
    ap.add_argument("--start", type=int, default=0, help="skip the first N points")
    ap.add_argument("--limit", type=int, default=0, help="send at most N points")
    ap.add_argument("--url", default="http://127.0.0.1:8000/api/v1/gps")
    ap.add_argument("--key", default=None, help="GPS API key (default: GPS_API_KEY from env / duk_micro/.env)")
    ap.add_argument("--device", default=read_env("DEVICE_ID", "bus-1"))
    ap.add_argument("--db", default=os.environ.get("REPLAY_DATABASE_URL"),
                    help="source DB URL (default: the local compose postgres container)")
    ap.add_argument("--make-trip", action="store_true", help="create a running trip for TODAY in the local DB first")
    ap.add_argument("--direction", choices=["forward", "reverse"])
    ap.add_argument("--route-id", type=int, default=1)
    ap.add_argument("--reset-state", action="store_true", help="clear device filter/snap/cluster state in Redis first")
    ap.add_argument("--seed-demo", action="store_true", help="seed stops + pinned fixed routes into the LOCAL DB and exit")
    ap.add_argument("--synthetic", choices=["forward", "reverse"], help="generate a trip along the fixed route")
    args = ap.parse_args()

    db = Db(args.db)
    if args.seed_demo:
        seed_demo(db, Rds())
        return
    if args.synthetic:
        points = synthetic_points(args.synthetic)
        rows = db.query("SELECT route_id FROM bus_stops LIMIT 1") if not args.dump else []
        src_trip = {"id": "synthetic", "direction": args.synthetic,
                    "route_id": int(rows[0]["route_id"]) if rows else args.route_id}
    else:
        points, src_trip = load_points(args, db) if not args.file else load_points(args, None)
    if not points:
        sys.exit("No GPS points for that selection.")
    print(f"[replay] {len(points)} points (trip {src_trip.get('id', '?')}, {src_trip.get('direction', '?')})")

    if args.dump:
        with open(args.dump, "w") as fh:
            json.dump({"trip": src_trip, "points": points}, fh, default=str)
        print(f"[replay] wrote {args.dump}")
        return

    key = args.key or read_env("GPS_API_KEY")
    if not key:
        sys.exit("No GPS API key (set GPS_API_KEY or --key).")

    rds = Rds()
    if args.make_trip:
        make_trip(Db(args.db), rds, src_trip, args)
    elif args.reset_state:
        reset_state(rds, args.device)

    pts = points[args.start:]
    if args.limit:
        pts = pts[:args.limit]
    prev_t = None
    prev_s = None
    back_jumps = 0
    t0 = time.time()
    for i, p in enumerate(pts, start=args.start):
        lat, lon, spd = float(p["lat"]), float(p["lon"]), p.get("speed")
        t = parse_ts(p["ts"])
        if prev_t is not None and not args.step:
            wait = min(max(0.0, t - prev_t), args.max_gap) / max(args.speed, 0.01)
            time.sleep(wait)
        prev_t = t
        if args.step:
            input(f"[{i}] Enter to send {lat:.6f},{lon:.6f} ...")

        res = send_http(args.url, key, lat, lon, spd)
        state = {}
        raw = rds.get(f"routestate:{args.device}")
        if raw:
            try:
                state = json.loads(raw)
            except ValueError:
                pass
        s = state.get("s")
        flag = ""
        if s is not None and prev_s is not None and s < prev_s - 0.5:
            back_jumps += 1
            flag = "  <-- BACKWARD"
        if s is not None:
            prev_s = s
        if res.get("status") == "error":
            print(f"[{i:5d}] ERROR {res}")
            continue
        out_lat, out_lon = res.get("lat"), res.get("lon")
        shift = hav_m(lat, lon, out_lat, out_lon) if out_lat is not None else float("nan")
        ts_ist = datetime.fromtimestamp(t, IST).strftime("%H:%M:%S")
        s_txt = f"{s:8.1f}" if s is not None else "     n/a"
        print(f"[{i:5d}] {ts_ist} sent {lat:.6f},{lon:.6f} {float(spd or 0):5.1f}km/h "
              f"-> {out_lat:.6f},{out_lon:.6f} shift {shift:5.1f}m  s={s_txt} "
              f"off_route={'Y' if state.get('off_route_hits', 0) >= 3 else 'n'}{flag}"
              if out_lat is not None else f"[{i:5d}] {ts_ist} sent {lat:.6f},{lon:.6f} -> {res}")

    print(f"[replay] done: {len(pts)} points in {time.time() - t0:.0f}s, backward s steps: {back_jumps}")


if __name__ == "__main__":
    main()
