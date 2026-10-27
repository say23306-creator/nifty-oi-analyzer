# OI Chain Signal Interpretation Rules — Nifty 50

## Instrument Focus
- **Underlying:** Nifty 50 (stock/equity)
- **Instruments analysed:** Call Options (CE) & Put Options (PE)
- **Futures:** Not in scope for this panel (rules exist but are separate)

---

## How the Classification Works

Every strike is compared between two snapshots separated by a configurable window.

| Metric | Signal |
|--------|--------|
| **LTP (Price) ↑** | Option premium is rising |
| **LTP (Price) ↓** | Option premium is falling |
| **OI ↑** | New positions being built (fresh money entering) |
| **OI ↓** | Positions being closed (money exiting) |

---

## Call Option (CE) — Rules

> For CE: Option View **=** Equity View. They always agree.

| Price | OI | Observation | Option View | Nifty 50 (Equity) |
|-------|----|-------------|-------------|-------------------|
| ▲ UP  | ▲ UP | **Long Build Up** | 🟢 BULLISH | 🟢 BULLISH |
| ▼ DOWN | ▼ DOWN | **Long Covering** | 🔴 STR. BEARISH | 🔴 STR. BEARISH |
| ▼ DOWN | ▲ UP | **Short Build Up** | 🔴 BEARISH | 🔴 BEARISH |
| ▲ UP | ▼ DOWN | **Short Covering** | 🟢 STR. BULLISH | 🟢 STR. BULLISH |

### CE Interpretations
- **CE Long Build Up (↑↑):** Fresh call buyers are entering the market. Both the option and Nifty 50 index are bullish.
- **CE Long Covering (↓↓):** Call buyers are exiting their longs — both the option and Nifty are strongly bearish (people booking profits or cutting losses).
- **CE Short Build Up (↓↑):** Call writers are adding fresh shorts. This implies a ceiling/resistance being built — bearish for both option and equity.
- **CE Short Covering (↑↓):** Call writers are buying back (covering). Shorts are unwinding — strongly bullish for both.

---

## Put Option (PE) — Rules

> ⚠️ For PE: Option View and Equity View are **always inverted**.  
> Put buyers profit when Nifty falls, so their bullish option action = bearish for the index.

| Price | OI | Observation | Option View | Nifty 50 (Equity) |
|-------|----|-------------|-------------|-------------------|
| ▲ UP  | ▲ UP | **Long Build Up** | 🟢 BULLISH | 🔴 BEARISH |
| ▼ DOWN | ▼ DOWN | **Long Covering** | 🔴 STR. BEARISH | 🟢 STR. BULLISH |
| ▼ DOWN | ▲ UP | **Short Build Up** | 🔴 BEARISH | 🟢 BULLISH |
| ▲ UP | ▼ DOWN | **Short Covering** | 🟢 STR. BULLISH | 🔴 STR. BEARISH |

### PE Interpretations
- **PE Long Build Up (↑↑):** Put buyers are building fresh longs — they expect Nifty to fall → **Bearish for Nifty 50**.
- **PE Long Covering (↓↓):** Put buyers are exiting their longs — bearish pressure easing → **Strongly Bullish for Nifty 50**.
- **PE Short Build Up (↓↑):** Put writers are adding fresh short positions — they expect Nifty to stay up or rise → **Bullish for Nifty 50**.
- **PE Short Covering (↑↓):** Put writers are buying back their shorts — the bullish thesis is unwinding → **Strongly Bearish for Nifty 50**.

---

## Aggregate Equity Bias Scoring

Each interpreted signal contributes a score toward the aggregate Nifty 50 view:

| Equity View | Score Weight |
|-------------|-------------|
| STR. BULLISH | +2 |
| BULLISH | +1 |
| NEUTRAL | 0 |
| BEARISH | -1 |
| STR. BEARISH | -2 |

**Final Label:**
- Net ≥ +4 → **STR. BULLISH**
- Net ≥ +1 → **BULLISH**
- Net ≤ -4 → **STR. BEARISH**
- Net ≤ -1 → **BEARISH**
- Otherwise → **NEUTRAL**

---

## Code Locations

| File | Purpose |
|------|---------|
| `lib/analysis/interpretation.ts` | Core rules engine — `interpretSignal()`, `interpretAll()`, `aggregateEquityBias()` |
| `app/dashboard/components/OIInterpretationPanel.tsx` | Dashboard panel with signal cards, bias bar, reference matrix |
| `lib/analysis/buildup.ts` | Upstream buildup classifier (produces `BuildupSignal[]` fed into interpreter) |
| `lib/analysis/bias.ts` | Separate market bias score engine (PCR + buildups + spot momentum) |
