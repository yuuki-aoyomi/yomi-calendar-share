import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { buildRestoreSql } from '../scripts/restore-d1-sql.mjs';
import worker from '../server/cloudflare/worker.ts';
import { defaultCalendarSnapshot } from '../server/core/calendarSnapshot.ts';

const setup = () => {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_create_calendar_snapshots.sql', '0002_add_snapshot_version.sql', '0003_add_snapshot_history.sql']) {
    db.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }
  return db;
};
const row = (id: string) => ({ calendar_id: id, snapshot_json: JSON.stringify(defaultCalendarSnapshot), created_at: '2020-01-01', updated_at: '2020-01-02' });

test('backup restore advances existing versions, records restore and preserves subsequent API locking', async () => {
  const db = setup();
  try {
    db.prepare('INSERT INTO calendar_snapshots (calendar_id, snapshot_json, version, restored_from_version) VALUES (?, ?, 7, 2)')
      .run('existing', JSON.stringify(defaultCalendarSnapshot));
    db.exec(buildRestoreSql([row('existing'), row("new'calendar")]));
    const env = {
      WRITE_TOKEN: 'restore-test-token',
      DB: { prepare: (sql: string) => ({ bind: (...args: (string | number)[]) => ({
        run: async () => ({ meta: { changes: db.prepare(sql).run(...args).changes } }),
        first: async () => db.prepare(sql).get(...args) ?? null,
      }) }) },
    } as unknown as Parameters<typeof worker.fetch>[1];
    for (const [id, version] of [['existing', 8], ["new'calendar", 1]] as const) {
      const current = db.prepare('SELECT * FROM calendar_snapshots WHERE calendar_id = ?').get(id)!;
      assert.equal(current.version, version);
      assert.notEqual(current.updated_at, row(id).updated_at);
      assert.equal(current.restored_from_version, null);
      const history = db.prepare('SELECT * FROM calendar_snapshot_history WHERE calendar_id = ? AND version = ?').get(id, version)!;
      assert.equal(history.operation, 'restore');
      assert.equal(history.restored_from_version, null);
      assert.equal(history.snapshot_json, row(id).snapshot_json);
      const put = (expectedVersion: number) => worker.fetch(new Request(`https://calendar.example/api/calendar/${encodeURIComponent(id)}`, {
        method: 'PUT', headers: { authorization: 'Bearer restore-test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ snapshot: defaultCalendarSnapshot, expectedVersion }),
      }), env);
      assert.equal((await put(version - 1)).status, 409);
      assert.equal(db.prepare('SELECT version FROM calendar_snapshots WHERE calendar_id = ?').get(id)!.version, version);
      assert.equal((await put(version)).status, 200);
      assert.equal(db.prepare('SELECT operation FROM calendar_snapshot_history WHERE calendar_id = ? AND version = ?').get(id, version + 1)!.operation, 'save');
    }
  } finally { db.close(); }
});

test('a failed history write rolls back all restored calendars', () => {
  const db = setup();
  try {
    db.prepare('INSERT INTO calendar_snapshots (calendar_id, snapshot_json, version) VALUES (?, ?, 4)').run('existing', '{}');
    db.exec("CREATE TRIGGER fail_restore BEFORE UPDATE ON calendar_snapshot_history WHEN NEW.calendar_id = 'fail' BEGIN SELECT RAISE(ABORT, 'restore_failure'); END;");
    assert.throws(() => db.exec(buildRestoreSql([row('existing'), row('fail')])), /restore_failure/);
    db.exec('ROLLBACK');
    assert.equal(db.prepare('SELECT version FROM calendar_snapshots WHERE calendar_id = ?').get('existing')!.version, 4);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM calendar_snapshots').get()!.n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM calendar_snapshot_history').get()!.n, 1);
  } finally { db.close(); }
});
