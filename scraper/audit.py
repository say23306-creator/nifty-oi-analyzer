"""
Checkpoint & Precision Audit Tool
==================================
Verifies whether hourly scrapings are occurring on schedule without missed hours,
and validates the mathematical accuracy and completeness of stored strike data.
"""

import sys
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

# Ensure root directory is on python path
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from scraper.db import get_db_connection
from scraper.holidays import IST

SCHEDULED_CHECKPOINTS = [
    (9, 15, "09:15"),
    (10, 15, "10:15"),
    (11, 15, "11:15"),
    (12, 15, "12:15"),
    (13, 15, "13:15"),
    (14, 15, "14:15"),
    (15, 15, "15:15"),
    (15, 30, "15:30"),
]

def run_audit(target_date_str: Optional[str] = None):
    now_ist = datetime.now(IST)
    audit_date = target_date_str or now_ist.strftime("%Y-%m-%d")

    print("\n" + "=" * 78)
    print(f" NIFTY 50 OI DATA SCRAPING AUDIT REPORT")
    print(f" Target Date: {audit_date} | Generated at: {now_ist.strftime('%Y-%m-%d %H:%M:%S IST')}")
    print("=" * 78)

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # 1. Fetch all snapshots for the day
            cur.execute(
                """
                SELECT id, ts, spot, checkpoint, pcr, total_ce_oi, total_pe_oi, max_pain, ltp
                FROM snapshots
                WHERE DATE(ts AT TIME ZONE 'Asia/Kolkata') = %s
                ORDER BY ts ASC;
                """,
                (audit_date,)
            )
            snapshots = cur.fetchall()

            if not snapshots:
                # If no records for today, show recent records to help diagnose
                print(f"\n[!] No snapshots recorded for {audit_date}.")
                cur.execute(
                    """
                    SELECT id, ts AT TIME ZONE 'Asia/Kolkata' as ts_ist, spot, checkpoint, pcr, ltp
                    FROM snapshots
                    ORDER BY id DESC
                    LIMIT 5;
                    """
                )
                recent = cur.fetchall()
                if recent:
                    print("\nMost recent snapshots available in DB:")
                    for r in recent:
                        current_ltp = float(r[5] or r[2])
                        print(f"  * Snapshot #{r[0]} at {r[1].strftime('%Y-%m-%d %H:%M:%S')} IST | Checkpoint: {r[3]} | LTP: {current_ltp:,.2f} | PCR: {r[4]}")
                print("\n" + "=" * 78 + "\n")
                return

            snap_by_label = {}
            for s in snapshots:
                cp = s[3] or "UNKNOWN"
                # Store by primary checkpoint prefix (e.g. '09:15', '10:15')
                key = cp.split()[0]
                snap_by_label[key] = s

            print(f"\n[1] HOURLY CHECKPOINT COMPLETION (Expected: 8 Slots)")
            print("-" * 80)
            print(f"{'SLOT':<8} | {'STATUS':<9} | {'SNAP ID':<8} | {'RECORDED TIME (IST)':<20} | {'LTP / SPOT':<11} | {'STRIKES'}")
            print("-" * 80)

            all_passed = True
            total_captured = 0

            for h, m, label in SCHEDULED_CHECKPOINTS:
                if label in snap_by_label:
                    s = snap_by_label[label]
                    snap_id = s[0]
                    ts_ist = s[1].astimezone(IST).strftime("%H:%M:%S IST")
                    ltp_val = float(s[8] or s[2])
                    ltp_fmt = f"{ltp_val:,.2f}"

                    # Count chain rows for this snapshot
                    cur.execute(
                        "SELECT COUNT(*), COUNT(DISTINCT strike) FROM chain_rows WHERE snapshot_id = %s;",
                        (snap_id,)
                    )
                    count_res = cur.fetchone()
                    total_rows = count_res[0] if count_res else 0
                    strikes_count = count_res[1] if count_res else 0

                    status = "[PASS]" if total_rows >= 50 else "[WARN LOW]"
                    total_captured += 1
                    print(f"{label:<8} | {status:<9} | #{snap_id:<7} | {ts_ist:<20} | {ltp_fmt:<11} | {total_rows} rows ({strikes_count} strikes)")
                else:
                    # Check if slot time has passed
                    slot_min = h * 60 + m
                    current_min = now_ist.hour * 60 + now_ist.minute
                    if current_min > slot_min and audit_date == now_ist.strftime("%Y-%m-%d"):
                        print(f"{label:<8} | [MISSED]   | -        | -                    | -           | -")
                        all_passed = False
                    else:
                        print(f"{label:<8} | [PENDING]  | -        | -                    | -           | (Scheduled)")

            print("-" * 80)
            print(f"Captured: {total_captured} of {len(SCHEDULED_CHECKPOINTS)} scheduled checkpoints")

            # Check for extra/manual snapshots recorded today
            other_snaps = [s for s in snapshots if (s[3] or "").split()[0] not in [label for _, _, label in SCHEDULED_CHECKPOINTS]]
            if other_snaps:
                print("\nAdditional / Manual Snapshots on this date:")
                for s in other_snaps:
                    snap_id = s[0]
                    ts_ist = s[1].astimezone(IST).strftime("%H:%M:%S IST")
                    cp = s[3] or "MANUAL"
                    ltp_val = float(s[8] or s[2])
                    ltp_fmt = f"{ltp_val:,.2f}"
                    cur.execute("SELECT COUNT(*) FROM chain_rows WHERE snapshot_id = %s;", (snap_id,))
                    cnt = cur.fetchone()[0]
                    print(f"  * Snapshot #{snap_id} at {ts_ist} | Checkpoint: {cp} | LTP: {ltp_fmt} | Rows: {cnt}")

            # 2. Precision & Sanity Audit on Latest Snapshot
            latest = snapshots[-1]
            latest_id = latest[0]
            cur.execute(
                """
                SELECT strike, type, ltp, oi, change_oi, iv, volume
                FROM chain_rows
                WHERE snapshot_id = %s
                ORDER BY strike ASC, type ASC;
                """,
                (latest_id,)
            )
            rows = cur.fetchall()

            print(f"\n[2] DATA PRECISION CHECK (Snapshot #{latest_id})")
            print("-" * 78)

            strikes = sorted(list(set(r[0] for r in rows)))
            differences = [strikes[i+1] - strikes[i] for i in range(len(strikes)-1)]
            uniform_steps = all(d == 50 for d in differences) if differences else False
            step_desc = "Clean 50-point intervals (NSE standard)" if uniform_steps else f"Non-standard steps: {set(differences)}"

            ce_rows = [r for r in rows if r[1] == 'CE']
            pe_rows = [r for r in rows if r[1] == 'PE']
            positive_oi_ce = sum(1 for r in ce_rows if (r[3] or 0) > 0)
            positive_oi_pe = sum(1 for r in pe_rows if (r[3] or 0) > 0)

            print(f"  * Strike Grid:         {len(strikes)} unique strikes from {strikes[0]} to {strikes[-1]}")
            print(f"  * Strike Step Width:   {step_desc}")
            print(f"  * CE Rows with OI:     {positive_oi_ce} / {len(ce_rows)} non-zero")
            print(f"  * PE Rows with OI:     {positive_oi_pe} / {len(pe_rows)} non-zero")
            print(f"  * Computed PCR:        {float(latest[4]):.3f}")
            print(f"  * Max Pain Strike:     {float(latest[7]):,.0f}")
            print(f"  * Total Call OI:       {int(latest[5]):,}")
            print(f"  * Total Put OI:        {int(latest[6]):,}")
            print("=" * 78 + "\n")

    finally:
        conn.close()

if __name__ == "__main__":
    date_arg = sys.argv[1] if len(sys.argv) > 1 else None
    run_audit(date_arg)
