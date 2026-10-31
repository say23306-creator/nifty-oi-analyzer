# Nifty 50 Hourly OI Data Scraping System
==========================================

Autonomous, high-precision Open Interest (OI) scraping and database storage engine for Nifty 50 index options.

---

## 🎯 System Objectives
- **Coverage:** Scrapes every single active strike price (Calls & Puts) across the entire option chain.
- **Cadence:** Strictly captures hourly snapshots during NSE market hours from **09:15 AM to 03:15 PM IST** (and 15:30 close wrap).
- **Precision Storage:** Stores spot price, aggregate PCR, Max Pain, and individual strike LTP, OI, $\Delta OI$, Volume, and IV into PostgreSQL (Supabase).
- **Zero-Miss Guarantee:**
  - Automated session warming with Akamai TLS fingerprint bypass (`curl_cffi`).
  - 5-stage exponential backoff retry on transient network drops.
  - Missed checkpoint self-healing: Automatically detects if a past hourly slot was missed today and backfills it immediately.
  - Instant Telegram broadcast confirmation for every stored snapshot.

---

## 🕒 Hourly Checkpoint Schedule (IST)
| Time (IST) | Checkpoint | Focus |
|:---:|:---|:---|
| **09:15** | Market Open Stance | Initial opening positions & morning gap setup |
| **10:15** | Hour 1 Snapshot | Morning trend emergence & initial writing walls |
| **11:15** | Hour 2 Snapshot | Mid-morning buildup continuation |
| **12:15** | Hour 3 Snapshot | Midday consolidation & European market setup |
| **13:15** | Hour 4 Snapshot | Afternoon writing accumulation |
| **14:15** | Hour 5 Snapshot | 2 PM breakout / zero-hero positioning |
| **15:15** | Hour 6 Snapshot | Pre-close institutional unwinding |
| **15:30** | Market Close Wrap | Final closing OI distribution & overnight carry |

---

## 📁 Architecture
```
nifty-oi-analyzer/
├── requirements.txt         # Dependencies (curl_cffi, psycopg2-binary, requests)
├── .env.local               # Database & Telegram credentials
├── scraper/
│   ├── db.py                # PostgreSQL connection pool & transactional batch inserts
│   ├── holidays.py          # NSE trading calendar & holiday filter
│   ├── nse_client.py        # Akamai-bypassed NSE India v3 API client
│   ├── collector.py         # Per-strike parser, PCR, Max Pain & DB committer
│   ├── telegram.py          # Instant confirmation alert dispatcher
│   ├── scheduler.py         # Autonomous 24/7 market hours daemon
│   └── test_scrape.py       # Instant verification script
└── README.md
```

---

## 🚀 How to Run

### 1. Verification Test (Instant One-Off Scrape)
To test the connection and store an immediate snapshot to Supabase right now:
```bash
python scraper/test_scrape.py
```

### 2. Manual Trigger Anytime
To execute a capture on demand:
```bash
python scraper/scheduler.py --now
```

### 3. Start the Autonomous 24/7 Market Daemon
To let it run autonomously in the background across all market days:
```bash
python scraper/scheduler.py
```
*(The daemon sleeps automatically outside market hours, wakes up on trading days, checks for any missed hours, and triggers strictly at 09:15, 10:15, 11:15, 12:15, 13:15, 14:15, 15:15, 15:30 IST).*
