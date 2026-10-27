# Nifty 50 Autonomous Cloud Deployment Guide
=============================================

This setup allows your **Nifty 50 Option Chain Analyzer & Telegram Alert System** to run 24/7 in the cloud with **zero broker accounts (No Upstox, No Angel One)** and **while your laptop is completely turned off**.

---

## 📁 What Has Been Built:

1. `cloud_engine/` — **The 24/7 Autonomous Cloud Engine**
   - Directly fetches from NSE India with browser session rotation.
   - Computes PCR, Max Pain, and Price × OI Buildup matrix.
   - Detects trapped institutional option sellers (short squeezes).
   - Broadcasts real-time alerts to your Telegram group (`Pro_9`).
   - Exposes REST endpoints (`/api/summary`, `/api/chain`, `/api/screen`).

2. `mcp_server/` — **The Option Chain MCP Server (`mcp-nifty-oi`)**
   - Connects to Antigravity IDE, Claude Desktop, or Cursor.
   - Ask AI about live spot, trapped sellers, and options screener via natural language prompts.

3. `extension/` — **Chrome Browser Extension**
   - Injects a live floating Institutional OI HUD onto **TradingView**, **NSE India**, and **Dhan Web**.

---

## 🚀 How to Deploy the Engine to Cloud (Free 24/7 - Laptop OFF):

### Option A: 1-Click Free Deploy on Render.com (Recommended)
1. Push your project to a GitHub repository.
2. Go to **[render.com](https://render.com)** (Free account).
3. Click **New +** → **Web Service** → Connect your GitHub repository.
4. Select **Docker** or **Python** environment.
   - Root Directory: `cloud_engine`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `python engine.py`
5. Add your Environment Variables:
   - `TELEGRAM_BOT_TOKEN`: `8770256098:AAGx07oE-kGp9FZMbjO2E980b8vaAl6JLi4`
   - `TELEGRAM_CHAT_ID`: `-1003944691807`
6. Click **Deploy Web Service**.
   - Your service is now live 24/7 in the cloud!
   - It will monitor the market and send alerts to Telegram even with your laptop shut down.

---

## 🔌 How to Use the MCP Server (`mcp_server/`):
To enable your AI assistant to query live Nifty data:
In your Claude Desktop or Antigravity configuration (`mcp_config.json`):
```json
{
  "mcpServers": {
    "nifty-oi": {
      "command": "python",
      "args": ["E:/oi chain/nifty-oi-analyzer/mcp_server/mcp_nifty.py"]
    }
  }
}
```
Now you can simply ask the AI:
- *"What is the current Nifty PCR and institutional bias?"*
- *"Are call writers trapped at 22,800 right now?"*
- *"Screen cheap OTM calls under ₹50 with bullish buildup."*

---

## 🧩 How to Install the Chrome Extension:
1. Open Google Chrome and go to `chrome://extensions/`.
2. Turn ON **"Developer mode"** (top right corner).
3. Click **"Load unpacked"** (top left).
4. Select the folder: `e:\oi chain\nifty-oi-analyzer\extension`.
5. Open **TradingView** or **NSE India** — you will see the floating **Nifty OI HUD** on your screen!
