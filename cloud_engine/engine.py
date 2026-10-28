"""
Nifty 50 Autonomous Cloud Engine
================================
Runs 24/7 in the cloud (Render, Railway, or VPS) with zero broker dependencies.
Directly fetches from NSE India, executes the Price x OI Matrix,
detects trapped institutional writers, and broadcasts alerts to Telegram.

Exposes REST endpoints for the Next.js Dashboard, MCP Server, and Chrome Extension.
"""

import os
import time
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s: %(message)s")
logger = logging.getLogger("nifty_engine")

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "8770256098:AAGx07oE-kGp9FZMbjO2E980b8vaAl6JLi4")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "-1003944691807")
PORT = int(os.getenv("PORT", "8000"))

# Indian Standard Time (UTC + 5:30)
IST = timezone(timedelta(hours=5, minutes=30))

app = FastAPI(title="Nifty 50 Autonomous Cloud Engine", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# NSE Session Handler (Akamai Bypass & Cookie Rotation)
# -----------------------------------------------------------------------------
class NSESession:
    def __init__(self):
        self.session = requests.Session()
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept": "*/*",
            "Referer": "https://www.nseindia.com/option-chain",
            "Connection": "keep-alive",
        }
        self.session.headers.update(self.headers)
        self.last_init = 0.0
        self.ttl = 300  # Refresh session cookies every 5 minutes

    def init_cookies(self):
        logger.info("Initializing fresh NSE India session cookies...")
        try:
            self.session.get("https://www.nseindia.com", timeout=12)
            time.sleep(1)
            self.session.get("https://www.nseindia.com/option-chain", timeout=12)
            time.sleep(0.5)
            self.last_init = time.time()
            logger.info("NSE session cookies ready.")
        except Exception as e:
            logger.warning(f"Session init warning: {e}")

    def fetch_raw_chain(self, symbol: str = "NIFTY") -> dict:
        if (time.time() - self.last_init) > self.ttl:
            self.init_cookies()

        url = f"https://www.nseindia.com/api/option-chain-indices?symbol={symbol.upper()}"
        resp = self.session.get(url, timeout=12)

        if resp.status_code in (401, 403):
            logger.info("Session expired/blocked. Re-initializing...")
            self.init_cookies()
            resp = self.session.get(url, timeout=12)

        if resp.status_code != 200:
            raise RuntimeError(f"NSE returned status code {resp.status_code}")

        return resp.json()

nse = NSESession()

# -----------------------------------------------------------------------------
# In-Memory Snapshot & History Storage
# -----------------------------------------------------------------------------
latest_state: Dict[str, Any] = {
    "available": False,
    "spot": 0.0,
    "timestamp": None,
    "expiry": None,
    "pcr": 1.0,
    "max_pain": 0,
    "bias": "NEUTRAL",
    "bias_reasons": [],
    "support": [],
    "resistance": [],
    "trapped_writers": [],
    "chain": [],
}
previous_chain_map: Dict[str, Dict[str, Any]] = {}

# -----------------------------------------------------------------------------
# Financial Math & Price x OI Matrix Engine (OI_INTERPRETATION_RULES.md)
# -----------------------------------------------------------------------------
def calculate_max_pain(strikes: List[int], chain_rows: List[dict]) -> int:
    """Calculates Max Pain strike where option writers lose the least money."""
    loss_map = {}
    for settle_strike in strikes:
        total_loss = 0.0
        for r in chain_rows:
            strike = r["strike"]
            # Call loss: if settlement > strike, call writers lose (settle - strike) * OI
            if settle_strike > strike:
                total_loss += (settle_strike - strike) * r.get("ce_oi", 0)
            # Put loss: if settlement < strike, put writers lose (strike - settle) * OI
            if settle_strike < strike:
                total_loss += (strike - settle_strike) * r.get("pe_oi", 0)
        loss_map[settle_strike] = total_loss

    if not loss_map:
        return 0
    return min(loss_map, key=loss_map.get)


def parse_and_analyze(raw: dict) -> Dict[str, Any]:
    global previous_chain_map

    records = raw.get("records", {})
    spot = float(records.get("underlyingValue", 0.0))
    expiries = records.get("expiryDates", [])
    current_expiry = expiries[0] if expiries else "CURRENT"

    atm_strike = round(spot / 50) * 50

    raw_data = records.get("data", [])
    chain_rows = []
    strikes = []

    total_ce_oi = 0
    total_pe_oi = 0
    total_ce_vol = 0
    total_pe_vol = 0

    curr_map = {}

    for item in raw_data:
        if item.get("expiryDate") != current_expiry:
            continue

        strike = int(item.get("strikePrice", 0))
        strikes.append(strike)
        ce = item.get("CE", {})
        pe = item.get("PE", {})

        ce_oi = ce.get("openInterest", 0)
        ce_change_oi = ce.get("changeinOpenInterest", 0)
        ce_ltp = ce.get("lastPrice", 0.0)
        ce_vol = ce.get("totalTradedVolume", 0)
        ce_iv = ce.get("impliedVolatility", 0.0)

        pe_oi = pe.get("openInterest", 0)
        pe_change_oi = pe.get("changeinOpenInterest", 0)
        pe_ltp = pe.get("lastPrice", 0.0)
        pe_vol = pe.get("totalTradedVolume", 0)
        pe_iv = pe.get("impliedVolatility", 0.0)

        total_ce_oi += ce_oi
        total_pe_oi += pe_oi
        total_ce_vol += ce_vol
        total_pe_vol += pe_vol

        # Classify Buildup using Price x OI Matrix
        # CALLS:
        ce_buildup = "CONSOLIDATION"
        ce_equity_bias = "NEUTRAL"
        if ce_ltp > 0 and ce_oi > 0:
            if ce_change_oi > 0 and ce.get("pChange", 0) > 0:
                ce_buildup = "LONG_BUILDUP"
                ce_equity_bias = "BULLISH"
            elif ce_change_oi > 0 and ce.get("pChange", 0) < 0:
                ce_buildup = "SHORT_BUILDUP"
                ce_equity_bias = "BEARISH"
            elif ce_change_oi < 0 and ce.get("pChange", 0) > 0:
                ce_buildup = "SHORT_COVERING"
                ce_equity_bias = "STR_BULLISH"
            elif ce_change_oi < 0 and ce.get("pChange", 0) < 0:
                ce_buildup = "LONG_UNWINDING"
                ce_equity_bias = "STR_BEARISH"

        # PUTS (Inverted Equity View):
        pe_buildup = "CONSOLIDATION"
        pe_equity_bias = "NEUTRAL"
        if pe_ltp > 0 and pe_oi > 0:
            if pe_change_oi > 0 and pe.get("pChange", 0) > 0:
                pe_buildup = "LONG_BUILDUP"
                pe_equity_bias = "BEARISH"
            elif pe_change_oi > 0 and pe.get("pChange", 0) < 0:
                pe_buildup = "SHORT_BUILDUP"
                pe_equity_bias = "BULLISH"
            elif pe_change_oi < 0 and pe.get("pChange", 0) > 0:
                pe_buildup = "SHORT_COVERING"
                pe_equity_bias = "STR_BEARISH"
            elif pe_change_oi < 0 and pe.get("pChange", 0) < 0:
                pe_buildup = "LONG_UNWINDING"
                pe_equity_bias = "STR_BULLISH"

        # Moneyness
        ce_moneyness = "ATM" if abs(strike - spot) <= 25 else ("ITM" if strike < spot else "OTM")
        pe_moneyness = "ATM" if abs(strike - spot) <= 25 else ("ITM" if strike > spot else "OTM")

        row = {
            "strike": strike,
            "ce": {
                "strike": strike,
                "type": "CE",
                "ltp": ce_ltp,
                "p_change": ce.get("pChange", 0.0),
                "oi": ce_oi,
                "change_oi": ce_change_oi,
                "volume": ce_vol,
                "iv": ce_iv,
                "moneyness": ce_moneyness,
                "buildup": ce_buildup,
                "equity_bias": ce_equity_bias,
            },
            "pe": {
                "strike": strike,
                "type": "PE",
                "ltp": pe_ltp,
                "p_change": pe.get("pChange", 0.0),
                "oi": pe_oi,
                "change_oi": pe_change_oi,
                "volume": pe_vol,
                "iv": pe_iv,
                "moneyness": pe_moneyness,
                "buildup": pe_buildup,
                "equity_bias": pe_equity_bias,
            },
        }
        chain_rows.append(row)
        curr_map[f"{strike}_CE"] = row["ce"]
        curr_map[f"{strike}_PE"] = row["pe"]

    previous_chain_map = curr_map

    # PCR Calculation
    pcr = round(total_pe_oi / total_ce_oi, 2) if total_ce_oi > 0 else 1.0

    # Max Pain
    strikes.sort()
    max_pain = calculate_max_pain(strikes, [{"strike": r["strike"], "ce_oi": r["ce"]["oi"], "pe_oi": r["pe"]["oi"]} for r in chain_rows])

    # Key Support (Put Wall below/at spot) & Resistance (Call Wall above/at spot)
    active_pe = [r for r in chain_rows if r["strike"] <= spot + 50]
    active_ce = [r for r in chain_rows if r["strike"] >= spot - 50]

    sorted_by_pe_oi = sorted(active_pe if active_pe else chain_rows, key=lambda x: x["pe"]["oi"], reverse=True)[:3]
    sorted_by_ce_oi = sorted(active_ce if active_ce else chain_rows, key=lambda x: x["ce"]["oi"], reverse=True)[:3]

    support_levels = [{"strike": r["strike"], "oi": r["pe"]["oi"]} for r in sorted_by_pe_oi]
    resistance_levels = [{"strike": r["strike"], "oi": r["ce"]["oi"]} for r in sorted_by_ce_oi]

    support_wall = support_levels[0]["strike"] if support_levels else (atm_strike - 100)
    resistance_wall = resistance_levels[0]["strike"] if resistance_levels else (atm_strike + 100)

    # Detect Trapped Institutional Sellers via True Breakevens & Unwinding
    trapped = []
    for r in chain_rows:
        s = r["strike"]
        ce_ltp = r["ce"]["ltp"]
        pe_ltp = r["pe"]["ltp"]
        ce_chg = r["ce"]["change_oi"]
        pe_chg = r["pe"]["change_oi"]

        # Call writer trap: Spot >= Strike (or past breakeven Strike + Premium) with active OI panic unwinding
        if s <= spot and ce_chg < -10000:
            breakeven = s + ce_ltp
            severity = "CRITICAL" if spot >= breakeven else "HIGH"
            trapped.append({
                "strike": s,
                "type": "CE",
                "breakeven": round(breakeven, 1),
                "unwinding_oi": abs(ce_chg),
                "message": f"Trapped Call Writers panicking at {s} CE (Spot {spot:.0f} >= Strike, ΔOI {ce_chg:,}). Squeeze risk.",
                "severity": severity,
            })

        # Put writer trap: Spot <= Strike (or below breakeven Strike - Premium) with active OI panic unwinding
        if s >= spot and pe_chg < -10000:
            breakeven = s - pe_ltp
            severity = "CRITICAL" if spot <= breakeven else "HIGH"
            trapped.append({
                "strike": s,
                "type": "PE",
                "breakeven": round(breakeven, 1),
                "unwinding_oi": abs(pe_chg),
                "message": f"Trapped Put Writers panicking at {s} PE (Spot {spot:.0f} <= Strike, ΔOI {pe_chg:,}). Downside risk.",
                "severity": severity,
            })

    # Pro-Grade 5-Zone PCR & Bias Score
    bias_score = 0
    reasons = []

    if pcr >= 1.60:
        bias_score -= 1
        reasons.append(f"PCR {pcr} >= 1.60: Extreme Overbought / Complacency zone (Reversal warning)")
    elif pcr >= 1.20:
        bias_score += 2
        reasons.append(f"PCR {pcr}: Bullish Put-Writing dominance")
    elif pcr < 0.60:
        bias_score += 1
        reasons.append(f"PCR {pcr} < 0.60: Extreme Oversold / Short Squeeze alert (Contrarian bounce setup)")
    elif pcr <= 0.85:
        bias_score -= 2
        reasons.append(f"PCR {pcr}: Bearish Call-Writing dominance")
    else:
        reasons.append(f"PCR {pcr}: Balanced neutral zone")

    # Max Pain Gravitational Drag (Mean reversion towards pin)
    if spot > max_pain + 150:
        reasons.append(f"Spot {spot:.0f} is extended above Max Pain ({max_pain}) — gravitational mean-reversion drag")
    elif spot < max_pain - 150:
        reasons.append(f"Spot {spot:.0f} is below Max Pain ({max_pain}) — upward gravitational pull toward pin")

    # Final Market Regime Determination
    if pcr >= 1.60:
        regime = "OVERBOUGHT_EXHAUSTION"
    elif pcr < 0.60:
        regime = "OVERSOLD_SQUEEZE_SETUP"
    elif bias_score >= 1:
        regime = "TRENDING_BULLISH"
    elif bias_score <= -1:
        regime = "TRENDING_BEARISH"
    else:
        regime = "RANGEBOUND"

    final_bias = "BULLISH" if bias_score >= 1 else ("BEARISH" if bias_score <= -1 else "NEUTRAL")

    # Pro Trader Action & Strategy Recommendation
    if regime == "TRENDING_BULLISH":
        trade_action = f"BUY DIPS NEAR {support_wall} PUT FLOOR"
        rec_strategy = f"Bull Put Credit Spread (Sell {support_wall} PE / Buy {support_wall - 100} PE)"
    elif regime == "TRENDING_BEARISH":
        trade_action = f"SELL RALLIES NEAR {resistance_wall} CALL WALL"
        rec_strategy = f"Bear Call Credit Spread (Sell {resistance_wall} CE / Buy {resistance_wall + 100} CE)"
    elif regime == "OVERBOUGHT_EXHAUSTION":
        trade_action = "TIGHTEN LONG STOPS / CASH OUT CALLS"
        rec_strategy = "Bear Call Spread or Wait for Pullback to Support"
    elif regime == "OVERSOLD_SQUEEZE_SETUP":
        trade_action = "WATCH FOR SHORT SQUEEZE BREAKOUT"
        rec_strategy = "Long Call Breakout on confirmation"
    else:
        trade_action = f"PLAY RANGE {support_wall} - {resistance_wall}"
        rec_strategy = f"Iron Condor (Sell {resistance_wall} CE & Sell {support_wall} PE)"

    return {
        "available": True,
        "spot": spot,
        "timestamp": datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST"),
        "expiry": current_expiry,
        "atm_strike": atm_strike,
        "pcr": pcr,
        "max_pain": max_pain,
        "bias": final_bias,
        "bias_score": bias_score,
        "bias_reasons": reasons,
        "regime": regime,
        "trade_action": trade_action,
        "recommended_strategy": rec_strategy,
        "support_wall": support_wall,
        "resistance_wall": resistance_wall,
        "support": support_levels,
        "resistance": resistance_levels,
        "trapped_writers": trapped,
        "total_ce_oi": total_ce_oi,
        "total_pe_oi": total_pe_oi,
        "chain": chain_rows,
    }


# -----------------------------------------------------------------------------
# Telegram Broadcast Engine
# -----------------------------------------------------------------------------
def send_telegram_alert(text: str) -> bool:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        logger.warning("Telegram credentials not configured.")
        return False
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        resp = requests.post(url, json={
            "chat_id": TELEGRAM_CHAT_ID,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }, timeout=8)
        return resp.status_code == 200
    except Exception as e:
        logger.error(f"Telegram broadcast error: {e}")
        return False


def broadcast_market_update(state: Dict[str, Any]):
    spot = state["spot"]
    pcr = state["pcr"]
    max_pain = state["max_pain"]
    bias = state["bias"]
    exp = state["expiry"]

    icon = "🟢" if bias == "BULLISH" else ("🔴" if bias == "BEARISH" else "🟡")

    msg = (
        f"<b>{icon} NIFTY 50 INSTITUTIONAL REPORT</b>\n"
        f"<i>{state['timestamp']} (Expiry: {exp})</i>\n\n"
        f"<b>• Nifty Spot:</b> <code>{spot:.2f}</code>\n"
        f"<b>• Market Bias:</b> <b>{bias}</b>\n"
        f"<b>• Put-Call Ratio (PCR):</b> <code>{pcr:.2f}</code>\n"
        f"<b>• Max Pain Strike:</b> <code>{max_pain}</code>\n\n"
        f"<b>🛡️ Institutional Key Levels:</b>\n"
        f"• Major Resistances (Call Walls): " + ", ".join([f"<code>{r['strike']}</code>" for r in state['resistance']]) + "\n"
        f"• Major Supports (Put Floors): " + ", ".join([f"<code>{s['strike']}</code>" for s in state['support']]) + "\n"
    )

    if state["trapped_writers"]:
        msg += "\n<b>⚡ TRAPPED SELLERS ALERT:</b>\n"
        for t in state["trapped_writers"][:3]:
            msg += f"• ⚠️ {t['message']}\n"

    msg += "\n<i>Generated by Autonomous Cloud Engine</i>"
    send_telegram_alert(msg)


# -----------------------------------------------------------------------------
# Core Polling Loop
# -----------------------------------------------------------------------------
def refresh_data(broadcast: bool = False) -> Dict[str, Any]:
    global latest_state
    try:
        logger.info("Fetching fresh option chain from NSE...")
        raw = nse.fetch_raw_chain("NIFTY")
        latest_state = parse_and_analyze(raw)
        logger.info(f"Updated: Spot {latest_state['spot']}, Bias: {latest_state['bias']}, PCR: {latest_state['pcr']}")

        if broadcast and latest_state["available"]:
            broadcast_market_update(latest_state)

        return latest_state
    except Exception as e:
        logger.error(f"Fetch failed: {e}")
        raise HTTPException(status_code=502, detail=f"Failed to fetch from NSE: {str(e)}")


# -----------------------------------------------------------------------------
# REST API Endpoints
# -----------------------------------------------------------------------------
@app.get("/")
def root():
    return {
        "status": "online",
        "service": "Nifty 50 Autonomous Cloud Engine",
        "timestamp": datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST"),
        "latest_spot": latest_state.get("spot", 0.0),
    }

@app.get("/health")
def health():
    return {"status": "healthy", "has_data": latest_state.get("available", False)}

@app.get("/api/summary")
def get_summary():
    """Returns high-level institutional summary (Spot, PCR, Max Pain, Bias)."""
    if not latest_state.get("available"):
        refresh_data(broadcast=False)
    return {
        "spot": latest_state["spot"],
        "timestamp": latest_state["timestamp"],
        "expiry": latest_state["expiry"],
        "pcr": latest_state["pcr"],
        "max_pain": latest_state["max_pain"],
        "bias": latest_state["bias"],
        "reasons": latest_state["bias_reasons"],
        "support": latest_state["support"],
        "resistance": latest_state["resistance"],
        "trapped_writers": latest_state["trapped_writers"],
    }

@app.get("/api/chain")
def get_chain():
    """Returns full parsed option chain."""
    if not latest_state.get("available"):
        refresh_data(broadcast=False)
    return {
        "spot": latest_state["spot"],
        "timestamp": latest_state["timestamp"],
        "expiry": latest_state["expiry"],
        "chain": latest_state["chain"],
    }

@app.get("/api/screen")
def screen_options(
    option_type: Optional[str] = Query(None, description="CE or PE"),
    moneyness: Optional[str] = Query(None, description="ITM, ATM, or OTM"),
    bias: Optional[str] = Query(None, description="BULLISH or BEARISH"),
    max_price: Optional[float] = Query(None, description="Max LTP"),
    min_oi: Optional[int] = Query(None, description="Minimum Open Interest"),
):
    """Screener API powering the MCP Server and Frontend."""
    if not latest_state.get("available"):
        refresh_data(broadcast=False)

    results = []
    for r in latest_state.get("chain", []):
        for side in ("ce", "pe"):
            opt = r[side]
            if option_type and opt["type"] != option_type.upper():
                continue
            if moneyness and opt["moneyness"] != moneyness.upper():
                continue
            if bias and opt["equity_bias"] != bias.upper():
                continue
            if max_price is not None and opt["ltp"] > max_price:
                continue
            if min_oi is not None and opt["oi"] < min_oi:
                continue

            results.append(opt)

    # Sort by highest OI descending
    results.sort(key=lambda x: x["oi"], reverse=True)
    return {"matched_count": len(results), "options": results}

@app.post("/api/broadcast")
def trigger_broadcast():
    """Manually triggers an instant Telegram institutional alert."""
    state = refresh_data(broadcast=True)
    return {"status": "broadcast_sent", "spot": state["spot"], "bias": state["bias"]}


# -----------------------------------------------------------------------------
# Standalone Runner
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    logger.info(f"Starting Autonomous Cloud Engine on port {PORT}...")
    uvicorn.run("engine:app", host="0.0.0.0", port=PORT, reload=False)
