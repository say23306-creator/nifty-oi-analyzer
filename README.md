# Nifty 50 Option Chain OI Analyzer & Telegram Alerts

A production-ready, serverless tool deployed on **Vercel** that collects the full Nifty 50 option chain (all strikes, OI, LTP, volume, IV), classifies Open Interest buildups in real time, computes institutional indicators (PCR, Max Pain, Dynamic Support/Resistance, Market Bias), runs optional offline-trained Machine Learning inference via ONNX, and dispatches automated alerts to Telegram.

---

## ⚡ Key Capabilities

- **Institutional Buildup Engine**: Automatically classifies every strike into:
  - 🟢 **Long Buildup**: Price ↑, OI ↑ (Fresh Longs entering)
  - 🔴 **Short Buildup**: Price ↓, OI ↑ (Fresh Shorts entering / resistance building)
  - 🔵 **Short Covering**: Price ↑, OI ↓ (Sellers unwinding)
  - 🟠 **Long Unwinding**: Price ↓, OI ↓ (Buyers exiting)
- **Advanced Aggregates**:
  - **PCR (Put-Call Ratio)**: Intraday tracking of both Open Interest PCR and Volume PCR with rate-of-change delta.
  - **Max Pain**: Precise mathematical strike calculation where option writers' losses are minimised.
  - **Dynamic Support & Resistance**: Real-time floor and ceiling strikes derived from top PE and CE OI concentrations.
  - **Institutional Bias Engine**: 0–100 weighted confidence scoring (BULLISH / BEARISH / NEUTRAL) combining PCR trend, ATM buildup dominance, and spot momentum.
- **Interactive Dark-Mode Terminal**:
  - Heatmap Option Chain Table with CE/PE sides, visual bar volume/OI fills, ATM strike highlighting, and buildup badges.
  - Interactive Recharts Open Interest bar charts and intraday PCR trend lines.
  - Password-gated security (`DASHBOARD_PASSWORD`) via stateless edge middleware.
- **Telegram Bot Integration**:
  - Instant HTML-formatted alerts on major buildup triggers and bias changes.
  - Interactive 2-way bot commands: `/status`, `/chain`, `/pcr`, `/bias`, `/paper`, `/mute`, `/unmute`.
- **Paper Trading Engine**: Automatically simulates hypothetical trades on high-conviction signals and logs win rate, PnL, and open positions.
- **Phase 3 Machine Learning**: Offline Python LightGBM training pipeline with ONNX runtime inference in Vercel serverless functions.
- **100% Free Broker Adapter**: Powered by **DhanHQ API v2** (Free forever, dedicated `/v2/optionchain` endpoint, zero monthly fees). Swappable `BrokerAdapter` architecture.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             VERCEL (Serverless)                             │
│                                                                             │
│  ┌──────────────┐   cron / webhook   ┌──────────────────────────────────┐   │
│  │ cron-job.org │ ─────────────────► │ /api/collect                     │   │
│  │ or GH Actions│                    │  • Market hours gate (IST)       │   │
│  └──────────────┘                    │  • BrokerAdapter.getChain()      │   │
│                                      │  • Snapshot & chain_rows insert  │   │
│  ┌──────────────┐                    │  • Buildup classification        │   │
│  │ Telegram Bot │ ◄────────────────► │  • Telegram alert dispatch       │   │
│  └──────────────┘  webhook /         │  • Paper trade logging           │   │
│                    sendMessage       └──────────────────────────────────┘   │
│                                      ┌──────────────────────────────────┐   │
│  ┌──────────────┐                    │ /api/auth/kite                   │   │
│  │   Browser    │ ─────────────────► │  OAuth login & token persistence │   │
│  └──────────────┘                    └──────────────────────────────────┘   │
│         │                            ┌──────────────────────────────────┐   │
│         ▼                            │ /api/predict                     │   │
│  ┌──────────────┐                    │  ONNX runtime inference (ML)     │   │
│  │  Dashboard   │                    └──────────────────────────────────┘   │
│  │  (Next.js)   │                    ┌──────────────────────────────────┐   │
│  └──────────────┘                    │ /api/telegram/webhook            │   │
│                                      │  Bot commands handler            │   │
│                                      └──────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
              │                                      │
              ▼                                      ▼
   ┌─────────────────────┐              ┌────────────────────────┐
   │  Supabase Postgres  │              │  Zerodha Kite Connect  │
   │  (snapshots, rows,  │              │  (Quotes, Expiries,    │
   │   signals, trades)  │              │   Instruments cache)   │
   └─────────────────────┘              └────────────────────────┘
```

---

## 🚀 Setup & Deployment Guide

### 1. Prerequisites
- Node.js 20+ installed
- PostgreSQL database (free instance on [Supabase](https://supabase.com) or [Neon](https://neon.tech))
- Zerodha Kite Connect developer app credentials
- Telegram Bot token from [@BotFather](https://t.me/BotFather)

### 2. Clone & Install
```bash
git clone <repository_url>
cd nifty-oi-analyzer
npm install
```

### 3. Database Migration
Run the SQL migration script located at `db/migrations/001_initial.sql` in your Supabase / Neon SQL Editor:
- Creates `settings` (stores Kite tokens & bot settings across serverless cold starts)
- Creates `snapshots` and `chain_rows` (stores full option chains efficiently)
- Creates `signals` (stores buildup alerts and Telegram delivery status)
- Creates `paper_trades` (tracks simulated win rates and PnL)

### 4. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in the following variables:
```env
# Database
DATABASE_URL=postgres://user:password@host:port/database?sslmode=require

# Broker Configuration (100% Free DhanHQ API)
BROKER=dhan
DHAN_CLIENT_ID=your_dhan_client_id
DHAN_ACCESS_TOKEN=your_dhan_access_token

# Telegram
TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
TELEGRAM_CHAT_ID=your_telegram_chat_id_or_channel_id

# Google Gemini AI (100% Free Tier)
GEMINI_API_KEY=your_gemini_api_key

# Security
CRON_SECRET=super_secret_cron_string_for_authorization
DASHBOARD_PASSWORD=your_secure_dashboard_password
```

---

## 🔑 DhanHQ 100% Free Broker Setup

DhanHQ API v2 is **completely free forever** with no monthly charges and no daily manual re-login:

1. Open your browser to **[web.dhan.co](https://web.dhan.co)** and log in.
2. Click your **Profile Icon** → **DhanHQ Trading APIs**.
3. Click **"Generate Access Token"** (choose standard 30-day validity).
4. Copy:
   - **`DHAN_CLIENT_ID`**: Your 10-digit Dhan Account ID (e.g. `1000123456`)
   - **`DHAN_ACCESS_TOKEN`**: The generated token string
5. Add them to your `.env.local` or Vercel Environment Variables.
6. Done! The system will automatically fetch live Nifty option chains without needing any daily OAuth login.

---

## 🤖 Telegram Bot Webhook Setup

Register your Telegram webhook to enable 2-way bot commands:
```bash
curl -F "url=https://<your-vercel-domain>/api/telegram/webhook" \
  https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook
```

### Supported Bot Commands
| Command | Description |
|---|---|
| `/status` | Check system health, last collection snapshot time, and alert state |
| `/chain` | View current key Support, Resistance, and Max Pain levels |
| `/pcr` | View current Put-Call Ratio and sentiment zone |
| `/bias` | Get institutional market bias report with contributing catalysts |
| `/paper` | View Paper Trading win rate, total closed trades, and open positions |
| `/mute` | Temporarily mute automated alert broadcasts |
| `/unmute` | Resume automated alert broadcasts |
| `/help` | Display command instructions |

---

## ⏰ Cron Job Automation

### On Vercel Pro
The `vercel.json` file is pre-configured to invoke `/api/collect` every minute during market hours (03:45–10:00 UTC / 09:15–15:30 IST):
```json
{
  "crons": [
    {
      "path": "/api/collect",
      "schedule": "*/1 3-10 * * 1-5"
    }
  ]
}
```

### On Vercel Hobby (Free Tier)
Vercel Hobby plan limits native crons to once daily. To run every 1–3 minutes for free:
1. Go to [cron-job.org](https://cron-job.org).
2. Create a new cron job:
   - **URL**: `https://<your-vercel-domain>/api/collect`
   - **Method**: `POST`
   - **Schedule**: Every 2 minutes, Monday through Friday, between 03:45 and 10:00 UTC.
   - **Headers**:
     ```
     Authorization: Bearer <CRON_SECRET>
     Content-Type: application/json
     ```

---

## 🧪 Testing

Run the full automated test suite (18 unit tests covering buildup classification, PCR, Max Pain, Support/Resistance, Market Hours, and ML feature extraction):
```bash
npm test
```

---

## 🧠 Phase 3 Machine Learning Pipeline

The `/ml` directory contains an offline training workflow:
1. `ml/build_features.py`: Pulls snapshots and extracts the exact 15 feature vector matching the Next.js runtime.
2. `ml/train.py`: Trains a LightGBM multi-class classifier using walk-forward temporal cross-validation.
3. `ml/export_onnx.py`: Exports the trained model to `models/model.onnx` and validates numerical parity against ONNX Runtime.
4. Set `ML_INFERENCE_ENABLED=true` in `.env` to activate real-time serverless inference in Next.js via `onnxruntime-node`.

See [`ml/README.md`](file:///e:/oi%20chain/nifty-oi-analyzer/ml/README.md) for full instructions.

---

## ⚠️ Financial Disclaimer

This tool is strictly for informational and educational purposes. Options trading involves substantial risk of loss and is not suitable for all investors. None of the signals, indicators, or machine learning predictions constitute financial advice. Always perform your own due diligence.
