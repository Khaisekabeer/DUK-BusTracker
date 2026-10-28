# libs/duk_common/route_progress.py
"""
Stop positions along the planned route (linear reference ``s``, metres).

The ETA endpoints used to treat every *unvisited* stop as "ahead". When the
visited list lagged or was empty, stops the bus had already driven past were
predicted too, and the monotonic clamp then pushed their (large) ETA onto every
later stop — the "+1 min per stop" staircase. Comparing each stop's ``s`` with
the bus's tracked ``s`` (from gps-ingestion's route snap) answers "is this stop
still ahead?" geometrically, without depending on visited bookkeeping.

Pure functions only (no Redis) so they stay unit-testable.
"""
import math
from typing import Dict, List, Optional, Any

from .state.route_snap import snap_to_route


def _hav_m(la1: float, lo1: float, la2: float, lo2: float) -> float:
    r = 6_371_000.0
    dlat = math.radians(la2 - la1)
    dlon = math.radians(lo2 - lo1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(la1)) * math.cos(math.radians(la2)) * math.sin(dlon / 2) ** 2)
    return r * 2 * math.asin(math.sqrt(min(1.0, a)))


def longest_line(coords: list) -> list:
    """MultiLineString → its longest LineString (same rule gps-ingestion uses)."""
    if coords and isinstance(coords[0], list) and coords[0] and isinstance(coords[0][0], list):
        return coords[0] if len(coords) == 1 else max(coords, key=len)
    return coords or []


def stop_progress(index: Dict[str, Any], ordered_stops: List[dict],
                  corridor_m: float = 300.0) -> Dict[Any, float]:
    """
    Project stops (already sorted in travel order) onto the route, each one
    constrained to lie after the previous stop so an out-and-back route can't
    put a stop on the wrong arm. Stops farther than ``corridor_m`` from the
    line are left out (unknown position).
    """
    out: Dict[Any, float] = {}
    if not index.get("pts"):
        return out
    prev_s: Optional[float] = None
    prev_ll = None
    for st in ordered_stops:
        try:
            lat, lon = float(st["lat"]), float(st["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        if prev_s is None:
            res = snap_to_route(lat, lon, index, None)
        else:
            gap = _hav_m(prev_ll[0], prev_ll[1], lat, lon)
            # Road distance between stops is rarely > 3× the straight line.
            res = snap_to_route(lat, lon, index, prev_s,
                                max_back_m=20.0, max_fwd_m=max(500.0, 3.0 * gap + 300.0))
        if res is None or res[3] > corridor_m:
            continue
        prev_s = res[2]
        prev_ll = (lat, lon)
        out[st["id"]] = prev_s
    return out


def filter_ahead(ordered_stops: List[dict], stop_s: Dict[Any, float],
                 bus_s: Optional[float], behind_tol_m: float = 40.0) -> List[dict]:
    """
    Keep stops still ahead of the bus. A stop with unknown ``s`` is kept only if
    it comes after the last stop known to be behind (travel order is trusted).
    """
    if bus_s is None or not stop_s:
        return list(ordered_stops)
    last_behind = -1
    for i, st in enumerate(ordered_stops):
        s = stop_s.get(st["id"])
        if s is not None and s < bus_s - behind_tol_m:
            last_behind = i
    return [st for i, st in enumerate(ordered_stops)
            if i > last_behind and (stop_s.get(st["id"]) is None
                                    or stop_s[st["id"]] >= bus_s - behind_tol_m)]


def smooth_arrival(prev_arrival_ts: Optional[float], prev_saved_ts: Optional[float],
                   new_arrival_ts: float, now_ts: float,
                   alpha: float = 0.4, max_age_s: float = 600.0) -> float:
    """
    EMA on the predicted *arrival time* (epoch seconds), not on minutes-to-go.
    A steady prediction then counts down one minute per minute instead of
    bouncing between polls. Stale history (> ``max_age_s``) is ignored.
    """
    if prev_arrival_ts is None or prev_saved_ts is None or now_ts - prev_saved_ts > max_age_s:
        return new_arrival_ts
    return alpha * new_arrival_ts + (1 - alpha) * prev_arrival_ts
