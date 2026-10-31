# Nifty 50 Hourly OI Data Scraping System
==========================================

Autonomous, high-precision Open Interest (OI) scraping and database storage engine for Nifty 50 index options.

---

## 🎯 System Objectives
- **Coverage:** Scrapes every single active strike price (Calls & Puts) across the entire option chain.
- **Cadence:** Strictly captures hourly snapshots during NSE market hours from **09:15 AM to 03:15 PM IST** (and 15:30 close wrap).
- **Precision Storage:** Stores underlying index LTP & spot price, aggregate PCR, Max Pain, and individual strike LTP, OI, $\Delta OI$, Volume, and IV into PostgreSQL (Supabase).
- **Zero-Miss Guarantee:**
  - Automated session warming with Akamai TLS fingerprint bypass (`curl_cffi`).
  - 5-stage exponential backoff retry on transient network drops.
  - Missed checkpoint self-healing: Automatically detects if a past hourly slot was missed today and backfills it immediately.
  - Instant Telegram broadcast confirmation for every stored snapshot.

---

## 🗄️ Database Schema (Supabase PostgreSQL)

### 1. `snapshots` (Master Hourly Checkpoints)
| Column | Type | Description |
|:---|:---|:---|
| `id` | `BIGINT` | Auto-incrementing primary key |
| `ts` | `TIMESTAMPTZ` | Timestamp in UTC |
| `expiry` | `DATE` | Current weekly/monthly option contract expiry date |
| `spot` | `NUMERIC` | Underlying Nifty 50 index spot price |
| `ltp` | `NUMERIC` | Current market price (LTP) of the index for that hour |
| `checkpoint` | `VARCHAR` | Hourly label (`09:15`, `10:15`, ..., `15:30`) |
| `pcr` | `NUMERIC` | Aggregate Put-Call Ratio ($\Sigma PE\_OI / \Sigma CE\_OI$) |
| `total_ce_oi` | `BIGINT` | Sum of Open Interest across all Call strikes |
| `total_pe_oi` | `BIGINT` | Sum of Open Interest across all Put strikes |
| `max_pain` | `NUMERIC` | True settlement loss minimization strike |

### 2. `chain_rows` (Granular Strike-Level Data)
| Column | Type | Description |
|:---|:---|:---|
| `id` | `BIGINT` | Primary key |
| `snapshot_id` | `BIGINT` | Foreign key referencing `snapshots(id)` |
| `strike` | `INTEGER` | Strike price (e.g., `23000`, `23050`, `23100`) |
| `type` | `CHAR` | `'CE'` (Call) or `'PE'` (Put) |
| `ltp` | `NUMERIC` | Current Last Traded Price of that specific option |
| `price_change`| `NUMERIC` | Net price change |
| `oi` | `BIGINT` | Total Open Interest for that strike |
| `change_oi` | `BIGINT` | Absolute change in OI |
| `pchange_oi`| `NUMERIC` | Percentage change in OI |
| `volume` | `BIGINT` | Contracts traded volume |
| `iv` | `NUMERIC` | Implied Volatility |
| `bid_qty`, `bid_price`, `ask_price`, `ask_qty` | `NUMERIC/BIGINT` | Market depth |

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

