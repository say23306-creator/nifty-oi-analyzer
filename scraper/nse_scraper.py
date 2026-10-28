"""
NSE Option Chain Scraper & Microservice
Scrapes live Nifty / BankNifty option chain data directly from NSE India v3 API.

Usage:
  1. Direct Terminal Scrape (default):
     python scraper/nse_scraper.py
     python scraper/nse_scraper.py --symbol BANKNIFTY
     python scraper/nse_scraper.py --symbol NIFTY --save output.json

  2. Run as FastAPI Microservice:
     python scraper/nse_scraper.py --server
     (Serves at http://localhost:8000 for Next.js dashboard)
"""

import sys
import time
import json
import argparse
from typing import Optional, Dict, Any, List

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Try importing curl_cffi for Akamai TLS fingerprint bypass; fallback to requests
try:
    from curl_cffi import requests as cffi_requests
    HAS_CURL_CFFI = True
except ImportError:
    import requests
    HAS_CURL_CFFI = False

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="NSE Option Chain Scraper", version="2.0.0")

# Allow Next.js (port 3000) to call this service
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# NSE Session Management
# ─────────────────────────────────────────────────────────────────────────────

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "*/*",
    "Referer": "https://www.nseindia.com/option-chain",
    "Connection": "keep-alive",
}

_session = None
_session_ok = False
_session_ts = 0.0
SESSION_TTL = 300  # Refresh session cookies every 5 minutes


def get_new_session():
    if HAS_CURL_CFFI:
        sess = cffi_requests.Session(impersonate="chrome120")
    else:
        sess = requests.Session()
    sess.headers.update(BROWSER_HEADERS)
    return sess


def init_nse_session():
    global _session, _session_ok, _session_ts
    print("[*] Initialising secure NSE session...")
    _session = get_new_session()
    try:
        _session.get("https://www.nseindia.com", timeout=12)
        time.sleep(0.8)
        _session.get("https://www.nseindia.com/option-chain", timeout=12)
        time.sleep(0.5)
        _session_ok = True
        _session_ts = time.time()
        print("[OK] NSE session ready (Akamai bypassed)")
    except Exception as e:
        _session_ok = False
        print(f"[!] Session initialisation warning: {e}")


def ensure_session():
    global _session
    if _session is None or not _session_ok or (time.time() - _session_ts) > SESSION_TTL:
        init_nse_session()


# ─────────────────────────────────────────────────────────────────────────────
# Core Scraping Engine (NSE v3 Architecture)
# ─────────────────────────────────────────────────────────────────────────────

INDEX_SYMBOLS = {"NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50"}


def fetch_contract_info(symbol: str) -> Dict[str, Any]:
    """Fetch valid contract metadata including all active expiry dates."""
    ensure_session()
    sym = symbol.upper()
    url = f"https://www.nseindia.com/api/option-chain-contract-info?symbol={sym}"
    headers = {"Referer": "https://www.nseindia.com/option-chain"}

    resp = _session.get(url, headers=headers, timeout=12)
    if resp.status_code in (401, 403):
        # Refresh session once on token expiry
        init_nse_session()
        resp = _session.get(url, headers=headers, timeout=12)

    if resp.status_code != 200:
        raise RuntimeError(f"NSE returned HTTP {resp.status_code} for contract info: {sym}")

    return resp.json()


def fetch_raw(symbol: str, expiry: Optional[str] = None) -> Dict[str, Any]:
    """
    Fetch full option chain data from NSE API v3.
    Requires expiry date; if None, automatically detects nearest active expiry.
    """
    ensure_session()
    sym = symbol.upper()

    # 1. Fetch contract info to discover active expiries
    info = fetch_contract_info(sym)
    expiries = info.get("expiryDates", [])
    if not expiries:
        raise RuntimeError(f"No active option chain expiry dates found for {sym}")

    target_expiry = expiry if (expiry and expiry in expiries) else expiries[0]

    # 2. Call the v3 option chain endpoint
    asset_type = "Indices" if sym in INDEX_SYMBOLS else "Equity"
    url = f"https://www.nseindia.com/api/option-chain-v3?type={asset_type}&symbol={sym}&expiry={target_expiry}"
    headers = {"Referer": "https://www.nseindia.com/option-chain"}

    resp = _session.get(url, headers=headers, timeout=12)
    if resp.status_code in (401, 403):
        init_nse_session()
        resp = _session.get(url, headers=headers, timeout=12)

    if resp.status_code != 200:
        raise RuntimeError(f"NSE returned HTTP {resp.status_code} for {sym} (v3 endpoint)")

    data = resp.json()
    # Attach full list of expiries for frontend selectors
    if "records" in data:
        data["records"]["expiryDates"] = expiries
        data["records"]["selectedExpiry"] = target_expiry

    return data


# ─────────────────────────────────────────────────────────────────────────────
# Buildup & Institutional Aggregates Computation
# ─────────────────────────────────────────────────────────────────────────────

def classify_buildup(price_change: float, oi_change: float) -> str:
    """Classify strike into Institutional Buildup types."""
    if price_change > 0 and oi_change > 0:
        return "Long Buildup"
    elif price_change < 0 and oi_change > 0:
        return "Short Buildup"
    elif price_change > 0 and oi_change < 0:
        return "Short Covering"
    elif price_change < 0 and oi_change < 0:
        return "Long Unwinding"
    return "Neutral"


def compute_max_pain(rows: List[Dict[str, Any]]) -> float:
    """Compute Max Pain strike price where option sellers lose minimum money."""
    if not rows:
        return 0.0

    strikes = [r["strike"] for r in rows]
    min_loss = float("inf")
    max_pain_strike = strikes[0]

    for test_strike in strikes:
        total_loss = 0.0
        for r in rows:
            strike = r["strike"]
            # Call loss: intrinsic value * CE OI
            if test_strike > strike:
                total_loss += (test_strike - strike) * r["ce_oi"]
            # Put loss: intrinsic value * PE OI
            if test_strike < strike:
                total_loss += (strike - test_strike) * r["pe_oi"]

        if total_loss < min_loss:
            min_loss = total_loss
            max_pain_strike = test_strike

    return max_pain_strike


def parse_chain(raw: Dict[str, Any], expiry: Optional[str] = None) -> Dict[str, Any]:
    records = raw.get("records", {})
    spot = records.get("underlyingValue", 0.0)
    expiries = records.get("expiryDates", [])
    target_expiry = records.get("selectedExpiry") or expiry or (expiries[0] if expiries else None)

    raw_data = records.get("data", [])
    rows = []

    for item in raw_data:
        strike = item.get("strikePrice", 0)
        ce = item.get("CE", {})
        pe = item.get("PE", {})

        ce_price_change = ce.get("change", 0.0)
        ce_oi_change = ce.get("changeinOpenInterest", 0)
        pe_price_change = pe.get("change", 0.0)
        pe_oi_change = pe.get("changeinOpenInterest", 0)

        rows.append({
            "strike": strike,
            # Calls
            "ce_oi": ce.get("openInterest", 0),
            "ce_change_oi": ce_oi_change,
            "ce_pchange_oi": ce.get("pchangeinOpenInterest", 0.0),
            "ce_ltp": ce.get("lastPrice", 0.0),
            "ce_change": ce_price_change,
            "ce_volume": ce.get("totalTradedVolume", 0),
            "ce_iv": ce.get("impliedVolatility", 0.0),
            "ce_buildup": classify_buildup(ce_price_change, ce_oi_change),
            # Puts
            "pe_oi": pe.get("openInterest", 0),
            "pe_change_oi": pe_oi_change,
            "pe_pchange_oi": pe.get("pchangeinOpenInterest", 0.0),
            "pe_ltp": pe.get("lastPrice", 0.0),
            "pe_change": pe_price_change,
            "pe_volume": pe.get("totalTradedVolume", 0),
            "pe_iv": pe.get("impliedVolatility", 0.0),
            "pe_buildup": classify_buildup(pe_price_change, pe_oi_change),
        })

    rows.sort(key=lambda x: x["strike"])

    total_ce_oi = sum(r["ce_oi"] for r in rows)
    total_pe_oi = sum(r["pe_oi"] for r in rows)
    total_ce_vol = sum(r["ce_volume"] for r in rows)
    total_pe_vol = sum(r["pe_volume"] for r in rows)

    pcr_oi = round(total_pe_oi / total_ce_oi, 3) if total_ce_oi > 0 else 0.0
    pcr_vol = round(total_pe_vol / total_ce_vol, 3) if total_ce_vol > 0 else 0.0

    max_pain = compute_max_pain(rows)

    # Key Support (Max PE OI strike) and Resistance (Max CE OI strike)
    support_strike = max(rows, key=lambda x: x["pe_oi"])["strike"] if rows else 0
    resistance_strike = max(rows, key=lambda x: x["ce_oi"])["strike"] if rows else 0

    return {
        "symbol": records.get("data", [{}])[0].get("CE", {}).get("underlying", "NIFTY") if records.get("data") else "NIFTY",
        "spot": spot,
        "expiries": expiries,
        "selected_expiry": target_expiry,
        "pcr": pcr_oi,
        "pcr_volume": pcr_vol,
        "max_pain": max_pain,
        "support": support_strike,
        "resistance": resistance_strike,
        "total_ce_oi": total_ce_oi,
        "total_pe_oi": total_pe_oi,
        "total_ce_volume": total_ce_vol,
        "total_pe_volume": total_pe_vol,
        "chain": rows,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI Microservice Routes
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "NSE Option Chain Scraper (v3)",
        "version": "2.0.0",
        "port": 8000,
        "endpoints": [
            "/api/option-chain?symbol=NIFTY",
            "/api/spot?symbol=NIFTY",
            "/api/expiries?symbol=NIFTY",
            "/health",
        ]
    }


@app.get("/health")
def health():
    return {"status": "healthy", "session_ready": _session_ok, "curl_cffi": HAS_CURL_CFFI}


@app.get("/api/option-chain")
def get_option_chain(symbol: str = "NIFTY", expiry: Optional[str] = None):
    """
    Fetch parsed option chain with institutional buildups, PCR, Max Pain, Support & Resistance.
    ?symbol=NIFTY&expiry=27-Oct-2026
    """
    try:
        raw = fetch_raw(symbol, expiry)
        return parse_chain(raw, expiry)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/spot")
def get_spot(symbol: str = "NIFTY"):
    """Quick spot price lookup."""
    try:
        raw = fetch_raw(symbol)
        spot = raw.get("records", {}).get("underlyingValue", 0.0)
        return {"symbol": symbol.upper(), "spot": spot}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/expiries")
def get_expiries(symbol: str = "NIFTY"):
    """List of all active expiry dates."""
    try:
        info = fetch_contract_info(symbol)
        dates = info.get("expiryDates", [])
        return {"symbol": symbol.upper(), "expiries": dates}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# CLI Scrape Runner & Pretty Printer
# ─────────────────────────────────────────────────────────────────────────────

def print_terminal_dashboard(parsed: Dict[str, Any]):
    spot = parsed["spot"]
    symbol = parsed.get("symbol", "NIFTY")
    expiry = parsed["selected_expiry"]
    pcr = parsed["pcr"]
    max_pain = parsed["max_pain"]
    support = parsed["support"]
    resistance = parsed["resistance"]
    chain = parsed["chain"]

    # Sentiment bias evaluation
    bias = "NEUTRAL"
    if pcr >= 1.2 and spot >= max_pain:
        bias = "🟢 BULLISH"
    elif pcr <= 0.8 and spot <= max_pain:
        bias = "🔴 BEARISH"
    elif pcr > 1.0:
        bias = "🟢 MILDLY BULLISH"
    elif pcr < 1.0:
        bias = "🔴 MILDLY BEARISH"

    print("\n" + "=" * 90)
    print(f"  NSE LIVE OPTION CHAIN SCRAPER — {symbol} ({expiry})")
    print("=" * 90)
    print(f"  Spot Price       : {spot:,.2f}")
    print(f"  PCR (OI)         : {pcr:.3f} | PCR (Vol): {parsed['pcr_volume']:.3f}")
    print(f"  Market Bias      : {bias}")
    print(f"  Max Pain Strike  : {max_pain:,.0f}")
    print(f"  Major Support    : {support:,.0f} (PE OI: {max(r['pe_oi'] for r in chain):,})")
    print(f"  Major Resistance : {resistance:,.0f} (CE OI: {max(r['ce_oi'] for r in chain):,})")
    print(f"  Total CE OI      : {parsed['total_ce_oi']:,} | Total PE OI: {parsed['total_pe_oi']:,}")
    print("-" * 90)

    # Filter to display 10 strikes around ATM
    atm_strike = min(chain, key=lambda x: abs(x["strike"] - spot))["strike"] if chain else 0
    atm_idx = next((i for i, r in enumerate(chain) if r["strike"] == atm_strike), 0)
    start_idx = max(0, atm_idx - 5)
    end_idx = min(len(chain), atm_idx + 6)
    table_rows = chain[start_idx:end_idx]

    header = (
        f"{'CE Buildup':<15} {'CE OI':>10} {'CE Chg':>9} {'CE LTP':>8} | "
        f"{'STRIKE':^8} | "
        f"{'PE LTP':>8} {'PE Chg':>9} {'PE OI':>10} {'PE Buildup':<15}"
    )
    print(header)
    print("-" * 90)

    for r in table_rows:
        is_atm = " <ATM>" if r["strike"] == atm_strike else ""
        ce_b = r["ce_buildup"]
        pe_b = r["pe_buildup"]
        strike_str = f"{r['strike']:,.0f}{is_atm}"
        row_str = (
            f"{ce_b:<15} {r['ce_oi']:>10,} {r['ce_change_oi']:>+9,} {r['ce_ltp']:>8.2f} | "
            f"{strike_str:^8} | "
            f"{r['pe_ltp']:>8.2f} {r['pe_change_oi']:>+9,} {r['pe_oi']:>10,} {pe_b:<15}"
        )
        print(row_str)

    print("=" * 90)
    print(f"Scraped at: {parsed['timestamp']} UTC | Total Strikes: {len(chain)}\n")


def main():
    parser = argparse.ArgumentParser(description="NSE Option Chain Scraper (CLI & FastAPI)")
    parser.add_argument("--symbol", default="NIFTY", help="Symbol (NIFTY, BANKNIFTY, FINNIFTY, RELIANCE, etc.)")
    parser.add_argument("--expiry", default=None, help="Target expiry date (e.g. 27-Oct-2026)")
    parser.add_argument("--server", action="store_true", help="Launch FastAPI microservice on port 8000")
    parser.add_argument("--port", type=int, default=8000, help="Microservice port (default 8000)")
    parser.add_argument("--save", default=None, help="Save parsed JSON to specified file path")
    parser.add_argument("--sync-db", action="store_true", help="Automatically sync scraped snapshot into Supabase PostgreSQL")

    args = parser.parse_args()

    if args.server:
        print("[START] Launching NSE Option Chain FastAPI Microservice...")
        print(f"   Listening on http://localhost:{args.port}")
        print("   Interactive docs: http://localhost:8000/docs")
        uvicorn.run(app, host="0.0.0.0", port=args.port)
        return

    # Direct terminal scrape execution
    print(f"[*] Scraping live option chain for {args.symbol} from NSE India...")
    raw = fetch_raw(args.symbol, args.expiry)
    parsed = parse_chain(raw, args.expiry)
    print_terminal_dashboard(parsed)

    save_path = args.save or "scraper/scraped_data.json"
    with open(save_path, "w", encoding="utf-8") as f:
        json.dump(parsed, f, indent=2)
    print(f"[OK] Full scraped dataset ({len(parsed['chain'])} strikes) saved to: {save_path}")

    if args.sync_db:
        try:
            from sync_db import sync_to_db
            print("[*] Syncing snapshot directly to Supabase...")
            sync_to_db(args.symbol, args.expiry)
        except Exception as e:
            print(f"[WARN] Failed to auto-sync to DB: {e}")


if __name__ == "__main__":
    main()
