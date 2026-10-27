-- Existing transactions and future inserts start at revision 0.
ALTER TABLE card_transactions
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 0
  CHECK (revision >= 0 AND revision <= 9007199254740991);
