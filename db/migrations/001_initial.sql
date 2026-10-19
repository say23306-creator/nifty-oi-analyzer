-- =============================================================================
-- Migration 001 — Initial schema for Nifty OI Analyzer
-- Run once against your Supabase / Neon Postgres database.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- settings  — key-value store for: access_token, instruments cache, mute flag
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- snapshots  — one row per collection run (per expiry)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS snapshots (
  id      BIGSERIAL PRIMARY KEY,
  ts      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expiry  DATE        NOT NULL,
  spot    NUMERIC(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_ts     ON snapshots(ts DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_expiry ON snapshots(expiry, ts DESC);

-- ---------------------------------------------------------------------------
-- chain_rows  — every option row belonging to a snapshot
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chain_rows (
  id          BIGSERIAL PRIMARY KEY,
  snapshot_id BIGINT       NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  strike      INT          NOT NULL,
  type        CHAR(2)      NOT NULL CHECK (type IN ('CE','PE')),
  ltp         NUMERIC(10,2),
  oi          BIGINT,
  volume      BIGINT,
  iv          NUMERIC(8,4)
);

CREATE INDEX IF NOT EXISTS idx_chain_snapshot    ON chain_rows(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_chain_strike_type ON chain_rows(strike, type);

-- ---------------------------------------------------------------------------
-- signals  — analysis output, deduplication source
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signals (
  id               BIGSERIAL PRIMARY KEY,
  ts               TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind             TEXT        NOT NULL,   -- LONG_BUILDUP | SHORT_BUILDUP | BIAS_CHANGE | …
  strike           INT,
  option_type      CHAR(2),
  detail           JSONB,
  sent_to_telegram BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_signals_ts   ON signals(ts DESC);
CREATE INDEX IF NOT EXISTS idx_signals_kind ON signals(kind, ts DESC);

-- ---------------------------------------------------------------------------
-- paper_trades  — hypothetical entries from signals (paper-trading mode)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS paper_trades (
  id           BIGSERIAL PRIMARY KEY,
  signal_id    BIGINT REFERENCES signals(id),
  entry_ts     TIMESTAMPTZ   NOT NULL,
  exit_ts      TIMESTAMPTZ,
  strike       INT,
  option_type  CHAR(2),
  direction    TEXT          NOT NULL CHECK (direction IN ('LONG','SHORT')),
  entry_price  NUMERIC(10,2),
  exit_price   NUMERIC(10,2),
  pnl          NUMERIC(10,2),
  outcome      TEXT          CHECK (outcome IN ('WIN','LOSS','OPEN'))
);

CREATE INDEX IF NOT EXISTS idx_paper_trades_signal ON paper_trades(signal_id);
CREATE INDEX IF NOT EXISTS idx_paper_trades_ts     ON paper_trades(entry_ts DESC);
