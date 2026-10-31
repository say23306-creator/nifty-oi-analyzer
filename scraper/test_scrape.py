"""
Test & Verification Script
==========================
Runs a single collection test to verify NSE connection, strike parsing,
and database insertion into Supabase.
"""

import sys
import os
import logging

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s: %(message)s")

# Ensure root folder is in python path
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from scraper.collector import OptionChainCollector
from scraper.db import get_latest_snapshot

def main():
    print("=" * 60)
    print("NIFTY 50 OI DATA SCRAPING SYSTEM — VERIFICATION TEST")
    print("=" * 60)

    collector = OptionChainCollector()
    print("[1] Executing live test collection...")
    result = collector.collect_and_store(checkpoint_label="TEST_VERIFY")

    print("\n[OK] COLLECTION SUCCESSFUL!")
    print(f"Snapshot ID:       {result['snapshot_id']}")
    print(f"Timestamp (IST):   {result['timestamp_ist']}")
    print(f"Expiry:            {result['expiry']}")
    print(f"Spot Price:        {result['spot']}")
    print(f"Put-Call Ratio:    {result['pcr']}")
    print(f"Max Pain Strike:   {result['max_pain']}")
    print(f"Strikes Parsed:    {result['strikes_count']}")
    print(f"Database Rows:     {result['rows_saved']} (CE + PE)")

    print("\n[2] Verifying record in Supabase...")
    latest = get_latest_snapshot()
    if latest and latest["id"] == result["snapshot_id"]:
        print(f"[OK] Verified latest DB Snapshot ID: {latest['id']} matching inserted record!")
    else:
        print(f"[!] Warning: Latest DB record is {latest}")

    print("=" * 60)

if __name__ == "__main__":
    main()

