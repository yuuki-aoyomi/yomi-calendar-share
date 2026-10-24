// Backup generations are not local history versions. A backup restore has no
// restored_from_version, but is explicitly marked as a restore in history.
export function buildRestoreSql(rows) {
  const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
  return [
    'BEGIN TRANSACTION;',
    ...rows.flatMap((row) => [
      `INSERT INTO calendar_snapshots (calendar_id, snapshot_json, created_at, updated_at, version, restored_from_version) VALUES (${quote(row.calendar_id)}, ${quote(row.snapshot_json)}, ${quote(row.created_at)}, CURRENT_TIMESTAMP, 1, NULL) ON CONFLICT(calendar_id) DO UPDATE SET snapshot_json = excluded.snapshot_json, updated_at = CURRENT_TIMESTAMP, version = calendar_snapshots.version + 1, restored_from_version = NULL;`,
      `UPDATE calendar_snapshot_history SET operation = 'restore', restored_from_version = NULL WHERE calendar_id = ${quote(row.calendar_id)} AND version = (SELECT version FROM calendar_snapshots WHERE calendar_id = ${quote(row.calendar_id)});`,
    ]),
    'COMMIT;',
  ].join('\n');
}
