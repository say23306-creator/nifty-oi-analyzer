"""
Syncs scraped live option chain data into the Supabase PostgreSQL database.
Can be executed as a one-off or called every minute.
"""

import os
import sys
import json
import urllib.parse
from datetime import datetime

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "psycopg2-binary"])
    import psycopg2
    from psycopg2.extras import execute_values

from nse_scraper import fetch_raw, parse_chain

def get_db_url():
    # Read DATABASE_URL from .env.local if not in environment
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    
    env_file = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    if os.path.exists(env_file):
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("DATABASE_URL="):
                    return line.strip().split("=", 1)[1]
    return None

def sync_to_db(symbol="NIFTY", target_expiry=None):
    db_url = get_db_url()
    if not db_url:
        print("[ERROR] DATABASE_URL not found!")
        return False

    print(f"[*] Fetching live data for {symbol}...")
    raw = fetch_raw(symbol, target_expiry)
    parsed = parse_chain(raw, target_expiry)
    
    spot = parsed["spot"]
    expiry_str = parsed["selected_expiry"]
    chain = parsed["chain"]
    
    # Standardize expiry date to YYYY-MM-DD
    try:
        # NSE format is typically '28-May-2026' or '28-MAY-2026'
        dt = datetime.strptime(expiry_str.title(), "%d-%b-%Y")
        expiry_date = dt.strftime("%Y-%m-%d")
    except Exception:
        # Fallback if already ISO
        expiry_date = expiry_str

    print(f"[*] Connecting to Supabase Postgres...")
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        # 1. Insert Snapshot
        cur.execute(
            """
            INSERT INTO snapshots (ts, expiry, spot)
            VALUES (now(), %s, %s)
            RETURNING id;
            """,
            (expiry_date, spot)
        )
        snapshot_id = cur.fetchone()[0]
        print(f"[OK] Created Snapshot ID: {snapshot_id} (Spot: {spot}, Expiry: {expiry_date})")

        # 2. Insert Chain Rows (both CE and PE)
        rows_to_insert = []
        for item in chain:
            strike = item["strike"]
            # CE
            rows_to_insert.append((
                snapshot_id,
                strike,
                "CE",
                item.get("ce_ltp"),
                item.get("ce_oi"),
                item.get("ce_volume"),
                item.get("ce_iv")
            ))
            # PE
            rows_to_insert.append((
                snapshot_id,
                strike,
                "PE",
                item.get("pe_ltp"),
                item.get("pe_oi"),
                item.get("pe_volume"),
                item.get("pe_iv")
            ))

        execute_values(
            cur,
            """
            INSERT INTO chain_rows (snapshot_id, strike, type, ltp, oi, volume, iv)
            VALUES %s;
            """,
            rows_to_insert
        )
        print(f"[OK] Inserted {len(rows_to_insert)} option contracts into chain_rows.")

        # 3. Check for buildup signals & insert into signals table
        for item in chain:
            strike = item["strike"]
            # Alert on prominent buildups
            for opt_type, buildup, ltp, oi_chg in [
                ("CE", item.get("ce_buildup"), item.get("ce_ltp"), item.get("ce_change_oi")),
                ("PE", item.get("pe_buildup"), item.get("pe_ltp"), item.get("pe_change_oi"))
            ]:
                if buildup in ("Long Buildup", "Short Buildup") and abs(oi_chg or 0) > 100000:
                    kind = buildup.upper().replace(" ", "_")
                    cur.execute(
                        """
                        INSERT INTO signals (ts, kind, strike, option_type, detail, sent_to_telegram)
                        VALUES (now(), %s, %s, %s, %s, false)
                        """,
                        (
                            kind,
                            strike,
                            opt_type,
                            json.dumps({"ltp": ltp, "oi_change": oi_chg, "spot": spot})
                        )
                    )

        conn.commit()
        print(f"🎉 Successfully synced {symbol} live option chain snapshot to Supabase!")
        return True

    except Exception as e:
        conn.rollback()
        print(f"[ERROR] Sync failed: {e}")
        return False
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    sync_to_db("NIFTY")
