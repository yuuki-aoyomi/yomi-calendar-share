-- Cover the complete stable sort key for both first-page and cursor queries.
CREATE INDEX IF NOT EXISTS idx_card_transactions_calendar_page
  ON card_transactions(calendar_id, transaction_date DESC, created_at DESC, id DESC);
DROP INDEX IF EXISTS idx_card_transactions_calendar_date;
