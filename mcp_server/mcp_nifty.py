#!/usr/bin/env python3
"""
Nifty 50 Option Chain Model Context Protocol (MCP) Server
=========================================================
Exposes real-time Nifty 50 Open Interest, Trapped Writer, and Screener tools
to Claude Desktop, Antigravity IDE, Cursor, or any MCP client.

Protocol: MCP Stdio (JSON-RPC 2.0)
"""

import sys
import json
import logging
import requests

logging.basicConfig(level=logging.ERROR, stream=sys.stderr)

ENGINE_URL = "http://localhost:8000"

def call_engine(endpoint: str, params: dict = None, method: str = "GET") -> dict:
    try:
        url = f"{ENGINE_URL}{endpoint}"
        if method == "POST":
            r = requests.post(url, json=params or {}, timeout=10)
        else:
            r = requests.get(url, params=params or {}, timeout=10)
        if r.status_code == 200:
            return r.json()
        return {"error": f"Engine HTTP {r.status_code}: {r.text}"}
    except Exception as e:
        return {"error": f"Failed to connect to Cloud Engine: {str(e)}"}

TOOLS = [
    {
        "name": "get_nifty_market_bias",
        "description": "Fetch real-time Nifty 50 Spot price, Put-Call Ratio (PCR), Max Pain strike, and Institutional Market Bias (Bullish/Bearish).",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_trapped_sellers",
        "description": "Scan the option chain to detect trapped option writers (e.g. Call writers panicking in short squeezes or Put writers under severe pressure).",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "screen_options",
        "description": "Screen and filter Nifty options by Moneyness (ITM/ATM/OTM), Contract Type (CE/PE), Nifty Equity Bias, and Maximum Premium (LTP).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "option_type": {
                    "type": "string",
                    "enum": ["CE", "PE"],
                    "description": "Call Option (CE) or Put Option (PE)"
                },
                "moneyness": {
                    "type": "string",
                    "enum": ["ITM", "ATM", "OTM"],
                    "description": "In The Money, At The Money, or Out of The Money"
                },
                "bias": {
                    "type": "string",
                    "enum": ["BULLISH", "BEARISH"],
                    "description": "Desired impact on Nifty 50 index"
                },
                "max_price": {
                    "type": "number",
                    "description": "Maximum premium (LTP) in Rupees, e.g. 50.0"
                }
            },
            "required": [],
        },
    },
    {
        "name": "send_telegram_briefing",
        "description": "Broadcast an instant institutional report to the user's private Telegram group.",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
]

def handle_tool_call(name: str, arguments: dict) -> dict:
    if name == "get_nifty_market_bias":
        res = call_engine("/api/summary")
        if "error" in res:
            return {"content": [{"type": "text", "text": f"Error: {res['error']}"}]}
        text = (
            f"NIFTY 50 SPOT: {res.get('spot')}\n"
            f"Market Bias: {res.get('bias')}\n"
            f"Put-Call Ratio (PCR): {res.get('pcr')}\n"
            f"Max Pain Strike: {res.get('max_pain')}\n"
            f"Expiry: {res.get('expiry')}\n"
            f"Key Resistances (Call Walls): {', '.join([str(r['strike']) for r in res.get('resistance', [])])}\n"
            f"Key Supports (Put Floors): {', '.join([str(s['strike']) for s in res.get('support', [])])}\n"
            f"Institutional Drivers: {'; '.join(res.get('reasons', []))}"
        )
        return {"content": [{"type": "text", "text": text}]}

    elif name == "get_trapped_sellers":
        res = call_engine("/api/summary")
        if "error" in res:
            return {"content": [{"type": "text", "text": f"Error: {res['error']}"}]}
        trapped = res.get("trapped_writers", [])
        if not trapped:
            return {"content": [{"type": "text", "text": "No trapped option writers detected at present. Market is trading within standard equilibrium."}]}
        
        lines = ["TRAPPED INSTITUTIONAL SELLERS DETECTED:"]
        for t in trapped:
            lines.append(f"• [{t['severity']}] {t['message']}")
        return {"content": [{"type": "text", "text": "\n".join(lines)}]}

    elif name == "screen_options":
        params = {}
        if "option_type" in arguments:
            params["option_type"] = arguments["option_type"]
        if "moneyness" in arguments:
            params["moneyness"] = arguments["moneyness"]
        if "bias" in arguments:
            params["bias"] = arguments["bias"]
        if "max_price" in arguments:
            params["max_price"] = arguments["max_price"]

        res = call_engine("/api/screen", params=params)
        if "error" in res:
            return {"content": [{"type": "text", "text": f"Error: {res['error']}"}]}
        
        opts = res.get("options", [])[:10]
        if not opts:
            return {"content": [{"type": "text", "text": "No option contracts matched the specified criteria."}]}
        
        lines = [f"MATCHED {res.get('matched_count', len(opts))} CONTRACTS (Showing Top 10 by Open Interest):"]
        for o in opts:
            lines.append(
                f"• {o['strike']} {o['type']} ({o['moneyness']}) | LTP: ₹{o['ltp']} | "
                f"OI: {o['oi']:,} | Buildup: {o['buildup']} | Bias: {o['equity_bias']}"
            )
        return {"content": [{"type": "text", "text": "\n".join(lines)}]}

    elif name == "send_telegram_briefing":
        res = call_engine("/api/broadcast", method="POST")
        if "error" in res:
            return {"content": [{"type": "text", "text": f"Broadcast Failed: {res['error']}"}]}
        return {"content": [{"type": "text", "text": f"Successfully broadcast market briefing to Telegram! (Spot: {res.get('spot')}, Bias: {res.get('bias')})"}]}

    return {"error": f"Unknown tool: {name}"}

def main():
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            request = json.loads(line)
            req_id = request.get("id")
            method = request.get("method")

            if method == "initialize":
                response = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {"tools": {}},
                        "serverInfo": {
                            "name": "mcp-nifty-oi",
                            "version": "1.0.0"
                        }
                    }
                }
            elif method == "tools/list":
                response = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {"tools": TOOLS}
                }
            elif method == "tools/call":
                params = request.get("params", {})
                name = params.get("name")
                args = params.get("arguments", {})
                result = handle_tool_call(name, args)
                response = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": result
                }
            else:
                response = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {"code": -32601, "message": f"Method {method} not found"}
                }

            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()
        except Exception as e:
            err_resp = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32603, "message": str(e)}
            }
            sys.stdout.write(json.dumps(err_resp) + "\n")
            sys.stdout.flush()

if __name__ == "__main__":
    main()
