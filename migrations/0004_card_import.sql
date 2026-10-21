-- Automatic card imports are intentionally stored outside calendar snapshot JSON.
CREATE TABLE IF NOT EXISTS card_import_sources (
  id TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL,
  credit_card_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('jcb', 'olive')),
  label TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_card_sources_calendar ON card_import_sources(calendar_id);

CREATE TABLE IF NOT EXISTS card_transactions (
  id TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES card_import_sources(id),
  external_reference TEXT,
  used_at TEXT,
  transaction_date TEXT NOT NULL,
  amount_yen INTEGER NOT NULL CHECK (amount_yen >= 0),
  merchant TEXT,
  category TEXT NOT NULL DEFAULT '未分類',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  confirmed_amount_yen INTEGER CHECK (confirmed_amount_yen IS NULL OR confirmed_amount_yen >= 0),
  expected_payment_date TEXT,
  confirmed_payment_date TEXT,
  linked_money_record_id TEXT,
  needs_review INTEGER NOT NULL DEFAULT 1 CHECK (needs_review IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_card_transactions_calendar_date ON card_transactions(calendar_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_card_transactions_source ON card_transactions(source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_card_transactions_external ON card_transactions(source_id, external_reference) WHERE external_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS card_import_events (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES card_import_sources(id),
  message_fingerprint TEXT NOT NULL,
  transaction_id TEXT REFERENCES card_transactions(id),
  result TEXT NOT NULL CHECK (result IN ('imported', 'duplicate', 'needs_review', 'rejected')),
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id, message_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_card_import_events_created ON card_import_events(source_id, created_at DESC);
