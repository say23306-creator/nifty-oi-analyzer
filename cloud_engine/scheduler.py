"""
Nifty 50 Hourly OI Analysis & Telegram Broadcaster (09:15 to 15:15 IST)
========================================================================
Runs autonomously during Indian market hours (09:15 - 15:30 IST):
- Uses NSE v3 architecture (curl_cffi with Akamai cookie bypass)
- Tracks hourly OI shifts (Calls vs Puts)
- Classifies Long Buildup, Short Buildup, Short Covering, Long Unwinding
- Detects trapped option sellers
- Formats & broadcasts institutional report to Telegram group Pro_9

Usage:
  python cloud_engine/scheduler.py           # Runs autonomous background scheduler
  python cloud_engine/scheduler.py --now     # Sends instant live analysis right now
"""

import os
import sys
import time
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
import requests

# Add root directory to sys.path so we can import from scraper
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from scraper.nse_scraper import fetch_raw, parse_chain

# Setup logging
logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s: %(message)s")
logger = logging.getLogger("hourly_scheduler")

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "8770256098:AAGx07oE-kGp9FZMbjO2E980b8vaAl6JLi4")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "-1003944691807")
IST = timezone(timedelta(hours=5, minutes=30))

# Scheduled hourly checkpoints (IST)
SCHEDULED_HOURS = [
    (9, 15, "Market Open - Initial Positioning"),
    (10, 15, "Hour 1 - Morning Trap & Trend Check"),
    (11, 15, "Hour 2 - Morning Momentum & Squeeze Check"),
    (12, 15, "Midday - European Market Setup & Straddles"),
    (13, 15, "Hour 4 - Afternoon Buildup & Writer Risk"),
    (14, 15, "Hour 5 - 2 PM Breakout / Zero-Hero Watch"),
    (15, 15, "Market Close - Final Wrap & Overnight Shift"),
]

def format_indian_oi(val: float, show_sign: bool = False) -> str:
    sign = "+" if (val > 0 and show_sign) else ""
    abs_val = abs(val)
    if abs_val >= 10000000:
        return f"{sign}{val / 10000000:.2f} Cr"
    if abs_val >= 100000:
        return f"{sign}{val / 100000:.2f} L"
    if abs_val >= 1000:
        return f"{sign}{val / 1000:.1f} k"
    return f"{sign}{int(val):,}"

def send_telegram_alert(message: str) -> bool:
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": message,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }
        resp = requests.post(url, json=payload, timeout=12)
        if resp.status_code == 200:
            logger.info("Telegram broadcast sent successfully.")
            return True
        else:
            logger.error(f"Telegram failed ({resp.status_code}): {resp.text}")
            return False
    except Exception as e:
        logger.error(f"Telegram error: {e}")
        return False

def generate_report_from_data(data: dict, checkpoint_title: str) -> str:
    spot = data.get("spot", 0.0)
    pcr = data.get("pcr", 1.0)
    max_pain = data.get("max_pain", 0)
    bias = data.get("market_bias", "NEUTRAL")
    selected_expiry = data.get("selected_expiry", "N/A")
    total_ce_oi = data.get("total_ce_oi", 0)
    total_pe_oi = data.get("total_pe_oi", 0)
    support = data.get("support", 0)
    resistance = data.get("resistance", 0)
    chain = data.get("chain", [])

    total_ce_chg = sum(r.get("ce_change_oi", 0) for r in chain)
    total_pe_chg = sum(r.get("pe_change_oi", 0) for r in chain)

    now_str = datetime.now(IST).strftime("%I:%M %p IST")

    # Icon based on bias
    if "BULL" in bias.upper():
        icon = "🟢"
    elif "BEAR" in bias.upper():
        icon = "🔴"
    else:
        icon = "🟡"

    lines = [
        f"<b>📊 NIFTY 50 • HOURLY OI SHIFT REPORT</b>",
        f"<i>{checkpoint_title} • {now_str} (Exp: {selected_expiry})</i>",
        "━━━━━━━━━━━━━━━━━━━━━━",
        f"🎯 <b>Nifty Spot:</b> <code>{spot:.2f}</code>",
        f"⚖️ <b>Market Bias:</b> {icon} <b>{bias}</b>",
        f"📈 <b>Put-Call Ratio (PCR):</b> <code>{pcr:.3f}</code>",
        f"⚖️ <b>Max Pain Strike:</b> <code>{max_pain}</code>",
        "",
        f"<b>⚔️ 1-HOUR NET OI ACCUMULATION:</b>",
        f"• Fresh Call (CE) Writing: <code>{format_indian_oi(total_ce_chg, True)}</code>",
        f"• Fresh Put (PE) Writing:  <code>{format_indian_oi(total_pe_chg, True)}</code>",
    ]

    net_diff = total_pe_chg - total_ce_chg
    if net_diff > 0:
        lines.append(f"• Dominance: 🟢 <b>+{format_indian_oi(net_diff)} PE Dominance (Bulls Defending Floor)</b>")
    else:
        lines.append(f"• Dominance: 🔴 <b>{format_indian_oi(net_diff)} CE Dominance (Bears Overhead)</b>")

    # Key Support & Resistance with OI
    sup_row = next((r for r in chain if r.get("strike") == support), None)
    res_row = next((r for r in chain if r.get("strike") == resistance), None)
    sup_oi = sup_row.get("pe_oi", 0) if sup_row else 0
    res_oi = res_row.get("ce_oi", 0) if res_row else 0

    lines.extend([
        "",
        f"<b>🎯 KEY INSTITUTIONAL LEVELS:</b>",
        f"• 🔴 Major Resistance (Call Wall): <b>{resistance}</b> ({format_indian_oi(res_oi)} CE OI)",
        f"• 🟢 Major Support (Put Floor): <b>{support}</b> ({format_indian_oi(sup_oi)} PE OI)",
    ])

    # Trapped Sellers (Verified past Strike/Breakeven with active panic unwinding)
    trapped = []
    for r in chain:
        s = r.get("strike", 0)
        c_chg = r.get("ce_change_oi", 0)
        p_chg = r.get("pe_change_oi", 0)
        if s <= spot and c_chg < -15000:
            trapped.append(f"Call Writers trapped at <b>{s} CE</b> (Spot: {spot:.0f} &ge; {s}, ΔOI: <code>{format_indian_oi(c_chg, True)}</code> covering)")
        elif s >= spot and p_chg < -15000:
            trapped.append(f"Put Writers trapped at <b>{s} PE</b> (Spot: {spot:.0f} &le; {s}, ΔOI: <code>{format_indian_oi(p_chg, True)}</code> unwinding)")

    # Top Buildups
    notable = []
    for r in chain:
        s = r.get("strike", 0)
        if abs(r.get("ce_change_oi", 0)) > 25000:
            b = r.get("ce_buildup", "")
            emoji = "🟢" if "Long" in b else "🔴" if "Short Buildup" in b else "🚀"
            notable.append((abs(r["ce_change_oi"]), f"• {emoji} <b>{s} CE</b>: {b} (ΔOI: <code>{format_indian_oi(r['ce_change_oi'], True)}</code> | LTP: ₹{r['ce_ltp']:.1f})"))
        if abs(r.get("pe_change_oi", 0)) > 25000:
            b = r.get("pe_buildup", "")
            emoji = "🔴" if "Long" in b else "🟢" if "Short Buildup" in b else "🚀"
            notable.append((abs(r["pe_change_oi"]), f"• {emoji} <b>{s} PE</b>: {b} (ΔOI: <code>{format_indian_oi(r['pe_change_oi'], True)}</code> | LTP: ₹{r['pe_ltp']:.1f})"))

    notable.sort(key=lambda x: x[0], reverse=True)
    if notable:
        lines.extend(["", "<b>🚨 NOTABLE BUILDUP MOVES:</b>"] + [item[1] for item in notable[:4]])

    if trapped:
        lines.extend(["", "<b>⚡ TRAPPED SELLERS SQUEEZE ALERT:</b>"] + [f"• ⚠️ {t}" for t in trapped[:2]])

    # Pro Trader Action & Decision Guidance
    if pcr >= 1.60:
        action_text = f"⚠️ <b>EXTREME OVERBOUGHT (PCR {pcr:.2f})</b> — Avoid chasing calls; prepare for mean-reversion toward {max_pain}."
    elif pcr < 0.60:
        action_text = f"🚀 <b>OVERSOLD SQUEEZE RADAR</b> — Call writers crowded; watch for sharp short-covering spike."
    elif "BULL" in bias.upper():
        action_text = f"🟢 <b>BUY DIPS NEAR {support} PUT FLOOR</b> — Target: {resistance} | Stop-Loss below {support - 40}."
    elif "BEAR" in bias.upper():
        action_text = f"🔴 <b>SELL RALLIES NEAR {resistance} CALL WALL</b> — Target: {support} | Stop-Loss above {resistance + 40}."
    else:
        action_text = f"⚖️ <b>RANGEBOUND CONSOLIDATION</b> — Play corridor [{support} – {resistance}] with Iron Condors."

    lines.extend([
        "",
        f"<b>🎯 PRO TRADER ACTION PLAN:</b>",
        f"• {action_text}",
    ])

    lines.extend([
        "",
        f"🌐 <b>Live Terminal:</b> <a href='https://nifty-oi-analyzer-seven.vercel.app/dashboard'>Open Dashboard</a>",
        "<i>Autonomous analysis • Educational F&O intelligence</i>"
    ])

    return "\n".join(lines)

def run_single_broadcast(title: str = "Live Market Update"):
    logger.info(f"Executing on-demand broadcast: {title}...")
    try:
        raw = fetch_raw("NIFTY")
        data = parse_chain(raw)
        msg = generate_report_from_data(data, title)
        send_telegram_alert(msg)
    except Exception as e:
        logger.error(f"Broadcast failed: {e}")

def run_loop():
    logger.info("Starting Autonomous Hourly Scheduler (09:15 to 15:15 IST)...")
    sent_today = set()
    current_day = datetime.now(IST).date()

    while True:
        now = datetime.now(IST)

        # Reset checklist at midnight IST
        if now.date() != current_day:
            sent_today.clear()
            current_day = now.date()

        # Check if weekday (Mon=0, Fri=4)
        if now.weekday() < 5:
            for hour, minute, title in SCHEDULED_HOURS:
                slot_key = f"{now.date()}_{hour:02d}:{minute:02d}"

                # Trigger if within current minute window and not sent yet
                if now.hour == hour and now.minute == minute and slot_key not in sent_today:
                    logger.info(f"Triggering scheduled checkpoint: {title} ({hour:02d}:{minute:02d} IST)")
                    run_single_broadcast(title)
                    sent_today.add(slot_key)
                    time.sleep(60)
                    break

        time.sleep(15)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--now":
        run_single_broadcast("Live Market Update")
    else:
        run_loop()
