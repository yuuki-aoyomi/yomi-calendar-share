export type BackupRow = { calendar_id: string; snapshot_json: string; created_at: string; updated_at: string };
export type CalendarBackup = {
  format: 'yomi-calendar-d1-backup';
  version: 1;
  createdAt: string;
  rowCount: number;
  rows: BackupRow[];
};

export function createCalendarBackup(rows: BackupRow[], createdAt: string): CalendarBackup {
  for (const row of rows) {
    if (!row.calendar_id || !row.snapshot_json || !row.created_at || !row.updated_at) {
      throw new Error('Invalid calendar snapshot row');
    }
    const snapshot: unknown = JSON.parse(row.snapshot_json);
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new Error('Invalid calendar snapshot JSON');
    }
  }
  return { format: 'yomi-calendar-d1-backup', version: 1, createdAt, rowCount: rows.length, rows };
}

export function parseCalendarBackup(value: unknown): CalendarBackup {
  if (!value || typeof value !== 'object') throw new Error('Invalid backup');
  const backup = value as Partial<CalendarBackup>;
  if (backup.format !== 'yomi-calendar-d1-backup' || backup.version !== 1 ||
    typeof backup.createdAt !== 'string' || !Array.isArray(backup.rows) ||
    backup.rowCount !== backup.rows.length) throw new Error('Unsupported backup format');
  return createCalendarBackup(backup.rows, backup.createdAt);
}
