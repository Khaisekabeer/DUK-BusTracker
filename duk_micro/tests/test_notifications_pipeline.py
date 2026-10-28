"""
End-to-end check of the notification pipeline against a RUNNING local stack.

It drives the real code paths (trip-lifecycle triggers → Redis Streams →
notification-service consumer → Celery tasks → Postgres; admin broadcast →
WebSocket channel + in-app row; notification API read state) and asserts on
what actually happened, not just that a publish call returned.

Run inside the workers container (it needs the stack's DB/Redis/env):
    docker cp duk_micro/tests/test_notifications_pipeline.py duk_micro-background-workers-1:/tmp/
    docker exec -e HARNESS_ROOT=/app duk_micro-background-workers-1 python /tmp/test_notifications_pipeline.py

Uses a throw-away user / trip and removes them afterwards. FCM sends go to a
dummy token: with no Firebase credentials the send is a counted failure, which
is enough to prove the Celery FCM task ran.
"""
import asyncio
import json
import os
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

# Repo's duk_micro/ dir (or HARNESS_ROOT, e.g. /app when copied to /tmp in a container).
ROOT = os.environ.get("HARNESS_ROOT") or os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "services", "trip-lifecycle"))

import httpx  # noqa: E402
import jwt  # noqa: E402
from sqlalchemy import delete, select  # noqa: E402

from libs.duk_common.redis_client import get_redis, close_redis  # noqa: E402
from libs.duk_common.events import EventBus  # noqa: E402
from libs.duk_common.models import (  # noqa: E402
    AdminBroadcast, BusStop, InAppNotification, Trip, User,
)
from libs.duk_common.settings import get_settings  # noqa: E402
from libs.duk_common.auth import create_access_token  # noqa: E402
from libs.duk_common.cache.stops_cache import get_all_stops  # noqa: E402
import state_machine as sm  # noqa: E402
from database_local import AsyncSessionLocal  # noqa: E402

API = os.environ.get("HARNESS_API_URL", "http://core-api:8000")
TOKEN = "fcm_dummy_test_token_agent_check"
IST = timezone(timedelta(hours=5, minutes=30))
results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = ""):
    results.append((name, bool(ok), detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}{(' — ' + detail) if detail else ''}")


async def stream_tail(redis, stream: str) -> str:
    last = await redis.xrevrange(stream, count=1)
    return last[0][0] if last else "0-0"


async def stream_new(redis, stream: str, after: str) -> list[dict]:
    rows = await redis.xrange(stream, min=f"({after}", max="+")
    out = []
    for _id, fields in rows:
        f = {(k.decode() if isinstance(k, bytes) else k): (v.decode() if isinstance(v, bytes) else v)
             for k, v in fields.items()}
        raw = f.get("data") or f.get("payload") or next(iter(f.values()), "{}")
        try:
            out.append(json.loads(raw))
        except (TypeError, ValueError):
            out.append(f)
    return out


async def wait_consumed(redis, stream: str, group: str, upto: str, timeout: float = 15.0) -> bool:
    """True once the consumer group has delivered past `upto` and acked everything."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        for g in await redis.xinfo_groups(stream):
            name = g["name"].decode() if isinstance(g["name"], bytes) else g["name"]
            if name != group:
                continue
            last = g["last-delivered-id"]
            last = last.decode() if isinstance(last, bytes) else last
            ms, seq = (int(x) for x in last.split("-"))
            ums, useq = (int(x) for x in upto.split("-"))
            if (ms, seq) >= (ums, useq) and g["pending"] == 0:
                return True
        await asyncio.sleep(0.5)
    return False


async def wait_row(db_factory, stmt, timeout: float = 20.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        async with db_factory() as db:
            row = (await db.execute(stmt)).scalars().first()
            if row:
                return row
        await asyncio.sleep(0.5)
    return None


async def main():
    settings = get_settings()
    redis = await get_redis()
    bus = EventBus(redis)
    started = datetime.now(timezone.utc)
    user_id = uuid.uuid4()
    trip_id = None
    bcast_title = f"Harness broadcast {int(time.time())}"

    async with AsyncSessionLocal() as db:
        stops = {s.name: s for s in (await db.execute(select(BusStop))).scalars().all()}
        if "Kazhakuttam" not in stops or "Digital University Kerala" not in stops:
            sys.exit("Needs the demo stop list (python3 duk_micro/scripts/replay_trip.py --seed-demo).")
        kaz, duk = stops["Kazhakuttam"], stops["Digital University Kerala"]
        route_id = kaz.route_id
        # Boarding alert at Kazhakuttam; drop-off alert at DUK, which is the
        # ORIGIN of the evening trip — that one must NOT fire.
        db.add(User(id=user_id, email=f"harness-{user_id.hex[:8]}@duk.ac.in", name="Harness",
                    verified=True, device_token=TOKEN, notifications_on=True,
                    notify_trip_started=True, notify_delays=True, notify_admin_broadcasts=True,
                    boarding_alert_stop_id=kaz.id, destination_alert_stop_id=duk.id))
        trip = Trip(route_id=route_id, date=datetime.now(IST).date(), direction="reverse",
                    status="on_trip", started_at=started)
        db.add(trip)
        await db.commit()
        trip_id = trip.id

    try:
        print("\n[1] Proximity alerts (trip-lifecycle → notifications.proximity → consumer)")
        await redis.delete(f"trip:{trip_id}:stop:{kaz.id}:notified", f"trip:{trip_id}:stop:{duk.id}:notified")
        tail = await stream_tail(redis, "notifications.proximity")
        async with AsyncSessionLocal() as db:
            trip = (await db.execute(select(Trip).where(Trip.id == trip_id))).scalar_one()
            all_stops = await get_all_stops(db, redis, BusStop)
            await sm.run_proximity_alerts(db, bus, redis, trip, kaz.lat, kaz.lon, all_stops)
            new = await stream_new(redis, "notifications.proximity", tail)
            mine = [e for e in new if e.get("trip_id") == trip_id]
            board = [e for e in mine if e.get("alert_type") == "boarding" and e.get("stop_id") == kaz.id]
            check("boarding alert emitted at boarding stop", len(board) == 1 and TOKEN in board[0]["user_tokens"],
                  f"{len(mine)} event(s)")
            ttl = await redis.ttl(f"trip:{trip_id}:stop:{kaz.id}:notified")
            check("dedup key set (1 h TTL)", 0 < ttl <= 3600, f"ttl={ttl}s")

            tail2 = await stream_tail(redis, "notifications.proximity")
            await sm.run_proximity_alerts(db, bus, redis, trip, kaz.lat, kaz.lon, all_stops)
            again = [e for e in await stream_new(redis, "notifications.proximity", tail2) if e.get("trip_id") == trip_id]
            check("no repeat on next GPS tick", not again, f"{len(again)} repeat(s)")

            tail3 = await stream_tail(redis, "notifications.proximity")
            await sm.run_proximity_alerts(db, bus, redis, trip, duk.lat, duk.lon, all_stops)
            at_origin = [e for e in await stream_new(redis, "notifications.proximity", tail3)
                         if e.get("trip_id") == trip_id and e.get("alert_type") == "destination"]
            check("no 'destination approaching' at the trip origin", not at_origin)
        last = await stream_tail(redis, "notifications.proximity")
        check("consumer group consumed + acked proximity events",
              await wait_consumed(redis, "notifications.proximity", "notif-proximity-group", last))

        print("\n[2] Trip started (alias direction 'Evening' → in-app row via Celery)")
        tail = await stream_tail(redis, "notifications.trip_started")
        err = ""
        try:
            await sm._notify_trip_started_event(bus, SimpleNamespace(id=trip_id, direction="Evening"))
        except Exception as e:  # the old code raised a pydantic error here
            err = repr(e)
        check("TripStartedEvent accepts alias direction", not err, err)
        last = await stream_tail(redis, "notifications.trip_started")
        check("consumer consumed trip_started",
              last != tail and await wait_consumed(redis, "notifications.trip_started", "notif-trip-start-group", last))
        row = await wait_row(AsyncSessionLocal, select(InAppNotification).where(
            InAppNotification.type == "trip_started", InAppNotification.created_at >= started))
        check("in-app 'trip started' row written by Celery", row is not None and row.title == "Evening Bus Trip Started!",
              row.title if row else "no row within 20 s")

        print("\n[3] Late ETA (scheduled arrival in the past → notifications.late_eta)")
        await redis.delete(f"trip_{trip_id}_delay_tier")
        now_ist = datetime.now(IST)
        sched = now_ist.hour * 60 + now_ist.minute - 15  # destination was due 15 min ago
        tail = await stream_tail(redis, "notifications.late_eta")
        async with AsyncSessionLocal() as db:
            trip = (await db.execute(select(Trip).where(Trip.id == trip_id))).scalar_one()
            far = stops.get("Central Polytechnic") or kaz
            await sm.check_eta_late_notification(db, bus, redis, trip, kaz.lat, kaz.lon, far.lat, far.lon, sched)
            ev = [e for e in await stream_new(redis, "notifications.late_eta", tail) if e.get("trip_id") == trip_id]
            check("late ETA emitted vs destination's scheduled time",
                  len(ev) == 1 and ev[0]["delay_min"] >= 10 and TOKEN in ev[0]["user_tokens"],
                  f"delay={ev[0]['delay_min']} min" if ev else "none")
            tail2 = await stream_tail(redis, "notifications.late_eta")
            await sm.check_eta_late_notification(db, bus, redis, trip, kaz.lat, kaz.lon, far.lat, far.lon, sched)
            again = [e for e in await stream_new(redis, "notifications.late_eta", tail2) if e.get("trip_id") == trip_id]
            check("same delay tier not re-sent", not again)
        last = await stream_tail(redis, "notifications.late_eta")
        check("consumer consumed late_eta", await wait_consumed(redis, "notifications.late_eta", "notif-late-eta-group", last))

        print("\n[4] Celery FCM task (real worker round-trip)")
        # A drained queue proves nothing (failed tasks drain too). Send one task
        # and wait for its RESULT: with the dummy token and no Firebase creds it
        # must come back as a counted failure — not an exception.
        sys.path.insert(0, os.path.join(ROOT, "services", "notification-service"))
        from tasks import send_fcm_notification_task
        res = send_fcm_notification_task.delay([TOKEN], "Harness", "FCM task check", {"type": "harness"})
        try:
            out = await asyncio.get_running_loop().run_in_executor(None, lambda: res.get(timeout=30))
            check("send_fcm_notification task completes", isinstance(out, dict) and "failure" in out, str(out))
        except Exception as e:
            check("send_fcm_notification task completes", False, repr(e)[:200])

        print("\n[5] Admin broadcast (HTTP → in-app row + live WebSocket channel)")
        admin_jwt = jwt.encode({"sub": "harness", "role": "admin",
                                "exp": datetime.now(timezone.utc) + timedelta(minutes=10)},
                               settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        pubsub = redis.pubsub()
        await pubsub.subscribe("bus:broadcast")
        async with httpx.AsyncClient(base_url=API, timeout=15) as http:
            r = await http.post("/api/v1/admin/broadcast", headers={"X-Admin-Token": admin_jwt},
                                json={"title": bcast_title, "body": "Pipeline audit"})
            check("POST /api/v1/admin/broadcast", r.status_code == 200, f"{r.status_code} {r.text[:120]}")
            live = None
            deadline = time.time() + 5
            while time.time() < deadline and live is None:
                m = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if m and m.get("type") == "message":
                    d = json.loads(m["data"])
                    if d.get("type") == "announcement" and d.get("title") == bcast_title:
                        live = d
            await pubsub.unsubscribe("bus:broadcast")
            check("announcement published on bus:broadcast (WS toast)", live is not None and live.get("id"),
                  f"id={live.get('id') if live else None}")
            async with AsyncSessionLocal() as db:
                row = (await db.execute(select(InAppNotification).where(
                    InAppNotification.title == bcast_title))).scalars().first()
                ab = (await db.execute(select(AdminBroadcast).where(AdminBroadcast.title == bcast_title))).scalars().first()
            check("broadcast in-app row + admin_broadcasts row", row is not None and ab is not None)

            print("\n[6] Notification drawer API (GET list, PUT read)")
            user_jwt, _ = create_access_token(str(user_id), settings.SECRET_KEY, expire_minutes=10)
            hdr = {"Authorization": f"Bearer {user_jwt}"}
            r = await http.get("/api/v1/notifications", headers=hdr)
            items = r.json().get("notifications", []) if r.status_code == 200 else []
            mine = [n for n in items if row and n["id"] == row.id]
            check("GET /api/v1/notifications lists the broadcast", bool(mine), f"{r.status_code}, {len(items)} items")
            if row:
                r2 = await http.put(f"/api/v1/notifications/{row.id}/read", headers=hdr)
                r3 = await http.get("/api/v1/notifications", headers=hdr)
                now_read = [n for n in r3.json().get("notifications", []) if n["id"] == row.id]
                check("PUT .../read marks broadcast read for this user",
                      r2.status_code == 200 and now_read and now_read[0]["is_read"] is True)
                check("read state kept in Redis per user", bool(await redis.get(f"notif_read:{user_id}:{row.id}")))

        print("\n[7] Web push payload")
        from libs.duk_common import firebase_app as fa
        from firebase_admin import messaging
        from firebase_admin._messaging_encoder import MessageEncoder
        cfg = fa._webpush_config({"type": "proximity", "stop_id": "19"})
        check("proximity tag collapses per stop", cfg.notification.tag == "proximity-19", cfg.notification.tag)
        check("vibration pattern set", cfg.notification.vibrate == [200, 100, 200])
        try:
            MessageEncoder().default(messaging.Message(token=TOKEN, webpush=cfg,
                                                      notification=messaging.Notification(title="t", body="b")))
            ok, why = True, ""
        except Exception as e:
            ok, why = False, repr(e)
        check("message encodes (no invalid click link)", ok, why)

    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(InAppNotification).where(InAppNotification.title == bcast_title))
            await db.execute(delete(AdminBroadcast).where(AdminBroadcast.title == bcast_title))
            await db.execute(delete(InAppNotification).where(
                InAppNotification.type == "trip_started", InAppNotification.created_at >= started))
            if trip_id:
                await db.execute(delete(Trip).where(Trip.id == trip_id))
            await db.execute(delete(User).where(User.id == user_id))
            await db.commit()
        await redis.delete(f"trip_{trip_id}_delay_tier", f"trip:{trip_id}:stop:{kaz.id}:notified")
        await close_redis()

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    asyncio.run(main())
