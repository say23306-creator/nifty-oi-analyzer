"""
Database Handler for Nifty 50 OI Collector
===========================================
Connects to Supabase PostgreSQL using connection pooling and provides
clean transactional insert and query methods.
"""

import os
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
import psycopg2
from psycopg2.extras import execute_batch, RealDictCursor

IST = timezone(timedelta(hours=5, minutes=30))

def get_database_url() -> str:
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        return db_url
    
    # Check .env.local if not in environment
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.local")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("DATABASE_URL="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    
    raise ValueError("DATABASE_URL not found in environment or .env.local")


def get_db_connection():
    db_url = get_database_url()
    conn = psycopg2.connect(db_url, connect_timeout=15)
    return conn


def insert_hourly_snapshot(
    spot: float,
    expiry_date: str,
    checkpoint: str,
    pcr: float,
    total_ce_oi: int,
    total_pe_oi: int,
    max_pain: float,
    captured_at: Optional[datetime] = None,
    ltp: Optional[float] = None,
) -> int:
    """Inserts a master snapshot record and returns its ID."""
    ts = captured_at or datetime.now(timezone.utc)
    current_ltp = ltp if ltp is not None else spot
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO snapshots (ts, expiry, spot, ltp, checkpoint, pcr, total_ce_oi, total_pe_oi, max_pain)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id;
                """,
                (ts, expiry_date, spot, current_ltp, checkpoint, pcr, total_ce_oi, total_pe_oi, max_pain),
            )
            snapshot_id = cur.fetchone()[0]
        conn.commit()
        return snapshot_id
    finally:
        conn.close()


def insert_chain_rows_batch(snapshot_id: int, rows: List[Dict[str, Any]]):
    """
    Inserts all strike rows for the given snapshot.
    Each item in rows has:
      strike, type ('CE' or 'PE'), ltp, oi, change_oi, pchange_oi, volume, iv, price_change,
      bid_qty, bid_price, ask_price, ask_qty
    """
    if not rows:
        return

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            query = """
                INSERT INTO chain_rows 
                (snapshot_id, strike, type, ltp, oi, volume, iv, change_oi, pchange_oi, price_change, bid_qty, bid_price, ask_price, ask_qty)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            """
            data_tuples = [
                (
                    snapshot_id,
                    r["strike"],
                    r["type"],
                    r.get("ltp") or 0.0,
                    r.get("oi") or 0,
                    r.get("volume") or 0,
                    r.get("iv") or 0.0,
                    r.get("change_oi") or 0,
                    r.get("pchange_oi") or 0.0,
                    r.get("price_change") or 0.0,
                    r.get("bid_qty") or 0,
                    r.get("bid_price") or 0.0,
                    r.get("ask_price") or 0.0,
                    r.get("ask_qty") or 0,
                )
                for r in rows
            ]
            execute_batch(cur, query, data_tuples, page_size=250)
        conn.commit()
    finally:
        conn.close()


def get_latest_snapshot() -> Optional[Dict[str, Any]]:
    """Returns the most recent snapshot."""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, ts, expiry, spot, ltp, checkpoint, pcr, total_ce_oi, total_pe_oi, max_pain
                FROM snapshots
                ORDER BY ts DESC
                LIMIT 1;
                """
            )
            row = cur.fetchone()
            return dict(row) if row else None
    finally:
        conn.close()


def get_previous_hourly_snapshot(current_date_str: str) -> Optional[Dict[str, Any]]:
    """Gets the snapshot right before the current one on the same trading day."""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, ts, spot, ltp, checkpoint, pcr, total_ce_oi, total_pe_oi, max_pain
                FROM snapshots
                WHERE DATE(ts AT TIME ZONE 'Asia/Kolkata') = %s
                ORDER BY ts DESC
                LIMIT 1;
                """,
                (current_date_str,),
            )
            row = cur.fetchone()
            return dict(row) if row else None
    finally:
        conn.close()


def get_snapshots_for_day(date_str: str) -> List[Dict[str, Any]]:
    """Returns all snapshots captured on a given date (YYYY-MM-DD in IST)."""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, ts, spot, ltp, checkpoint, pcr, total_ce_oi, total_pe_oi, max_pain
                FROM snapshots
                WHERE DATE(ts AT TIME ZONE 'Asia/Kolkata') = %s
                ORDER BY ts ASC;
                """,
                (date_str,),
            )
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()

