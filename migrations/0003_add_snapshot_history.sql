CREATE TABLE IF NOT EXISTS calendar_snapshot_history (
  calendar_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  operation TEXT NOT NULL DEFAULT 'save',
  restored_from_version INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (calendar_id, version)
);

INSERT OR IGNORE INTO calendar_snapshot_history
  (calendar_id, version, snapshot_json, operation, created_at)
SELECT calendar_id, version, snapshot_json, 'save', updated_at
FROM calendar_snapshots;

CREATE TRIGGER IF NOT EXISTS calendar_snapshot_history_after_insert
AFTER INSERT ON calendar_snapshots
BEGIN
  INSERT OR REPLACE INTO calendar_snapshot_history
    (calendar_id, version, snapshot_json, operation, created_at)
  VALUES
    (NEW.calendar_id, NEW.version, NEW.snapshot_json, 'save', CURRENT_TIMESTAMP);

  DELETE FROM calendar_snapshot_history
  WHERE calendar_id = NEW.calendar_id
    AND version NOT IN (
      SELECT version FROM calendar_snapshot_history
      WHERE calendar_id = NEW.calendar_id
      ORDER BY version DESC LIMIT 50
    );
END;

CREATE TRIGGER IF NOT EXISTS calendar_snapshot_history_after_update
AFTER UPDATE OF snapshot_json, version ON calendar_snapshots
WHEN NEW.version <> OLD.version
BEGIN
  INSERT OR REPLACE INTO calendar_snapshot_history
    (calendar_id, version, snapshot_json, operation, created_at)
  VALUES
    (NEW.calendar_id, NEW.version, NEW.snapshot_json, 'save', CURRENT_TIMESTAMP);

  DELETE FROM calendar_snapshot_history
  WHERE calendar_id = NEW.calendar_id
    AND version NOT IN (
      SELECT version FROM calendar_snapshot_history
      WHERE calendar_id = NEW.calendar_id
      ORDER BY version DESC LIMIT 50
    );
END;

CREATE INDEX IF NOT EXISTS calendar_snapshot_history_calendar_created_idx
ON calendar_snapshot_history (calendar_id, created_at DESC);
