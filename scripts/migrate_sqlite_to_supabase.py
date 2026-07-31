"""
migrate_sqlite_to_supabase.py
Migrates GPS logs and suggestions from the local SQLite DB
into the Supabase PostgreSQL database.

Usage:
    python scripts/migrate_sqlite_to_supabase.py
"""

import sqlite3
import psycopg2
import psycopg2.extras
import os
import sys
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────

SQLITE_PATH = "/Users/aaronr/Desktop/BUS_TRACKER/gps_tracker (1).db"

SUPABASE_CONN = {
    "host":     "aws-1-ap-south-1.pooler.supabase.com",
    "port":     6543,
    "dbname":   "postgres",
    "user":     "postgres.mtkdzcdzxtfjwpgnpujc",
    "password": "duk@can2026",
    "connect_timeout": 15,
}

BATCH_SIZE = 5000   # Increased batch size for execute_values


def parse_sqlite_datetime(value: str | None) -> str | None:
    if not value:
        return None
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%Y-%m-%d %H:%M:%S.%f",
    ):
        try:
            return datetime.strptime(value.strip(), fmt).isoformat()
        except ValueError:
            continue
    return value.strip()


def batched(iterable, n):
    batch = []
    for item in iterable:
        batch.append(item)
        if len(batch) == n:
            yield batch
            batch = []
    if batch:
        yield batch


def migrate():
    if not os.path.exists(SQLITE_PATH):
        print(f"❌  SQLite file not found: {SQLITE_PATH}")
        sys.exit(1)

    print("🔌  Connecting to SQLite …")
    src = sqlite3.connect(SQLITE_PATH)
    src.row_factory = sqlite3.Row

    print("🔌  Connecting to Supabase …")
    try:
        dst = psycopg2.connect(**SUPABASE_CONN)
    except Exception as e:
        print(f"❌  Supabase connection failed: {e}")
        sys.exit(1)

    dst_cur = dst.cursor()

    # 1. Truncate tables to ensure a clean import (since user might have partial data)
    print("🧹  Cleaning up ALL existing data in Supabase ...")
    dst_cur.execute("TRUNCATE TABLE users, trips, gps_logs, suggestions RESTART IDENTITY CASCADE;")
    dst.commit()

    # ── GPS Logs ──────────────────────────────────────────────────────────────
    print("\n📡  Migrating gps_logs …")
    rows = src.execute("SELECT server_time, gps_time, lat, lon, event FROM gps_logs ORDER BY id").fetchall()
    total_gps = len(rows)
    print(f"    Found {total_gps:,} rows in SQLite.")

    inserted_gps = 0
    for chunk in batched(rows, BATCH_SIZE):
        values = []
        for r in chunk:
            values.append((
                parse_sqlite_datetime(r["server_time"]),
                parse_sqlite_datetime(r["gps_time"]),
                r["lat"],
                r["lon"],
                r["event"],
            ))
        psycopg2.extras.execute_values(
            dst_cur,
            "INSERT INTO gps_logs (server_time, gps_time, lat, lon, event) VALUES %s",
            values,
            page_size=BATCH_SIZE
        )
        dst.commit()
        inserted_gps += len(chunk)
        print(f"    ✅  {inserted_gps:,} / {total_gps:,}  ({inserted_gps / total_gps * 100:.1f}%)", end="\r")

    print(f"\n    Done — {inserted_gps:,} gps_logs migrated.")

    # ── Suggestions ────────────────────────────────────────────────────────────
    # User specifically requested to ONLY push gps logs from SQLite and not suggestions.
    print("\n⏭️   Skipping suggestions migration as requested.")

    src.close()
    dst_cur.close()
    dst.close()

    print("\n🎉  Database Wipe & GPS Log Migration complete!")


if __name__ == "__main__":
    migrate()
