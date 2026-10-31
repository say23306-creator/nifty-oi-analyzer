"""
Nifty 50 Hourly Option Chain Collector
=======================================
Pulls live chain from NSE India, calculates aggregates (PCR, Max Pain, Walls),
and saves the master snapshot and all per-strike data into Supabase PostgreSQL.
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta
from .nse_client import NSEClient
from .db import insert_hourly_snapshot, insert_chain_rows_batch

logger = logging.getLogger("collector")
IST = timezone(timedelta(hours=5, minutes=30))

def parse_expiry_date(date_str: str) -> str:
    """
    Converts NSE format ('03-Nov-2026') to ISO date ('2026-11-03') for PostgreSQL.
    """
    try:
        dt = datetime.strptime(date_str, "%d-%b-%Y")
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return date_str


def calculate_max_pain(rows: List[Dict[str, Any]]) -> float:
    """
    Max Pain strike: the strike price where option sellers lose minimum aggregate payout.
    Loss at settlement K = Σ max(0, K - strike) * CE_OI + Σ max(0, strike - K) * PE_OI
    """
    if not rows:
        return 0.0

    strikes = sorted(list(set(r["strike"] for r in rows)))
    min_loss = float("inf")
    max_pain_strike = strikes[0]

    for test_strike in strikes:
        total_loss = 0.0
        for r in rows:
            s = r["strike"]
            ce_oi = r.get("ce_oi", 0)
            pe_oi = r.get("pe_oi", 0)

            # In-the-money Call payout if settlement at test_strike
            if test_strike > s:
                total_loss += (test_strike - s) * ce_oi
            # In-the-money Put payout if settlement at test_strike
            if test_strike < s:
                total_loss += (s - test_strike) * pe_oi

        if total_loss < min_loss:
            min_loss = total_loss
            max_pain_strike = test_strike

    return float(max_pain_strike)


class OptionChainCollector:
    def __init__(self, client: Optional[NSEClient] = None):
        self.client = client or NSEClient()

    def collect_and_store(
        self, checkpoint_label: str = "MANUAL", expiry: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes a complete collection run:
        1. Scrapes raw option chain from NSE
        2. Computes PCR, Max Pain, and total volumes
        3. Inserts snapshot into Supabase
        4. Batch inserts every single strike (CE & PE)
        """
        now_utc = datetime.now(timezone.utc)
        now_ist = datetime.now(IST)
        logger.info(f"[collector] Starting collection for {checkpoint_label} at {now_ist.strftime('%Y-%m-%d %H:%M:%S IST')}")

        raw = self.client.fetch_option_chain_v3(symbol="NIFTY", expiry=expiry)
        records = raw.get("records", {})
        spot = float(records.get("underlyingValue", 0.0))
        selected_expiry = records.get("selectedExpiry", "")
        expiry_iso = parse_expiry_date(selected_expiry)
        raw_data = records.get("data", [])

        if not raw_data:
            raise RuntimeError(f"No option chain data rows returned for expiry {selected_expiry}")

        total_ce_oi = 0
        total_pe_oi = 0
        total_ce_vol = 0
        total_pe_vol = 0

        parsed_pairs = []
        db_rows = []

        for item in raw_data:
            strike = int(item.get("strikePrice", 0))
            ce = item.get("CE", {})
            pe = item.get("PE", {})

            ce_oi = int(ce.get("openInterest", 0) or 0)
            ce_chg_oi = int(ce.get("changeinOpenInterest", 0) or 0)
            ce_pchg_oi = float(ce.get("pchangeinOpenInterest", 0.0) or 0.0)
            ce_ltp = float(ce.get("lastPrice", 0.0) or 0.0)
            ce_change = float(ce.get("change", 0.0) or 0.0)
            ce_vol = int(ce.get("totalTradedVolume", 0) or 0)
            ce_iv = float(ce.get("impliedVolatility", 0.0) or 0.0)
            ce_bid_qty = int(ce.get("buyQuantity1", 0) or 0)
            ce_bid_price = float(ce.get("buyPrice1", 0.0) or 0.0)
            ce_ask_price = float(ce.get("sellPrice1", 0.0) or 0.0)
            ce_ask_qty = int(ce.get("sellQuantity1", 0) or 0)

            pe_oi = int(pe.get("openInterest", 0) or 0)
            pe_chg_oi = int(pe.get("changeinOpenInterest", 0) or 0)
            pe_pchg_oi = float(pe.get("pchangeinOpenInterest", 0.0) or 0.0)
            pe_ltp = float(pe.get("lastPrice", 0.0) or 0.0)
            pe_change = float(pe.get("change", 0.0) or 0.0)
            pe_vol = int(pe.get("totalTradedVolume", 0) or 0)
            pe_iv = float(pe.get("impliedVolatility", 0.0) or 0.0)
            pe_bid_qty = int(pe.get("buyQuantity1", 0) or 0)
            pe_bid_price = float(pe.get("buyPrice1", 0.0) or 0.0)
            pe_ask_price = float(pe.get("sellPrice1", 0.0) or 0.0)
            pe_ask_qty = int(pe.get("sellQuantity1", 0) or 0)

            total_ce_oi += ce_oi
            total_pe_oi += pe_oi
            total_ce_vol += ce_vol
            total_pe_vol += pe_vol

            # CE row
            db_rows.append({
                "strike": strike,
                "type": "CE",
                "ltp": ce_ltp,
                "oi": ce_oi,
                "change_oi": ce_chg_oi,
                "pchange_oi": ce_pchg_oi,
                "volume": ce_vol,
                "iv": ce_iv,
                "price_change": ce_change,
                "bid_qty": ce_bid_qty,
                "bid_price": ce_bid_price,
                "ask_price": ce_ask_price,
                "ask_qty": ce_ask_qty,
            })

            # PE row
            db_rows.append({
                "strike": strike,
                "type": "PE",
                "ltp": pe_ltp,
                "oi": pe_oi,
                "change_oi": pe_chg_oi,
                "pchange_oi": pe_pchg_oi,
                "volume": pe_vol,
                "iv": pe_iv,
                "price_change": pe_change,
                "bid_qty": pe_bid_qty,
                "bid_price": pe_bid_price,
                "ask_price": pe_ask_price,
                "ask_qty": pe_ask_qty,
            })

            parsed_pairs.append({
                "strike": strike,
                "ce_oi": ce_oi,
                "pe_oi": pe_oi,
                "ce_ltp": ce_ltp,
                "pe_ltp": pe_ltp,
            })

        # Calculate Put-Call Ratio
        pcr = round(total_pe_oi / total_ce_oi, 3) if total_ce_oi > 0 else 1.0

        # Calculate True Max Pain
        max_pain = calculate_max_pain(parsed_pairs)

        # ── 1. Insert Master Snapshot ──────────────────────────────────────────
        snapshot_id = insert_hourly_snapshot(
            spot=spot,
            expiry_date=expiry_iso,
            checkpoint=checkpoint_label,
            pcr=pcr,
            total_ce_oi=total_ce_oi,
            total_pe_oi=total_pe_oi,
            max_pain=max_pain,
            captured_at=now_utc,
        )

        # ── 2. Batch Insert All Strike Rows ────────────────────────────────────
        insert_chain_rows_batch(snapshot_id, db_rows)

        logger.info(
            f"[collector] Saved Snapshot #{snapshot_id} ({checkpoint_label}): "
            f"Spot={spot:.2f}, PCR={pcr:.3f}, MaxPain={max_pain}, Strikes={len(raw_data)} (Total Rows: {len(db_rows)})"
        )

        result_summary = {
            "snapshot_id": snapshot_id,
            "checkpoint": checkpoint_label,
            "timestamp_ist": now_ist.strftime("%Y-%m-%d %H:%M:%S IST"),
            "expiry": selected_expiry,
            "spot": spot,
            "pcr": pcr,
            "max_pain": max_pain,
            "total_ce_oi": total_ce_oi,
            "total_pe_oi": total_pe_oi,
            "strikes_count": len(raw_data),
            "rows_saved": len(db_rows),
        }

        # Cache locally for quick status inspection
        try:
            cache_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "latest_chain.json")
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(result_summary, f, indent=2)
        except Exception:
            pass

        return result_summary

