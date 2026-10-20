import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../server/cloudflare/worker.ts';

const migration = (file: string) => readFileSync(`migrations/${file}`, 'utf8');
const createDb = () => {
  const db = new DatabaseSync(':memory:');
  db.exec(migration('0001_create_calendar_snapshots.sql'));
  db.exec(migration('0002_add_snapshot_version.sql'));
  return db;
};

test('migration backfills existing data, records saves/restores, and keeps 50 versions', () => {
  const db = createDb();
  try {
    db.prepare("INSERT INTO calendar_snapshots (calendar_id, snapshot_json, version) VALUES (?, ?, ?)").run('default', '{"events":[]}', 4);
    db.exec(migration('0003_add_snapshot_history.sql'));
    let row = db.prepare("SELECT version, operation, restored_from_version FROM calendar_snapshot_history WHERE calendar_id = ?").get('default') as Record<string, unknown>;
    assert.deepEqual([row.version, row.operation, row.restored_from_version], [4, 'save', null]);
    db.prepare("UPDATE calendar_snapshots SET snapshot_json = ?, version = version + 1, restored_from_version = ? WHERE calendar_id = ?")
      .run('{"events":[1]}', 4, 'default');
    row = db.prepare("SELECT operation, restored_from_version FROM calendar_snapshot_history WHERE calendar_id = ? AND version = 5").get('default') as Record<string, unknown>;
    assert.deepEqual([row.operation, row.restored_from_version], ['restore', 4]);
    db.prepare("UPDATE calendar_snapshots SET snapshot_json = ?, version = version + 1, restored_from_version = NULL WHERE calendar_id = ?")
      .run('{"events":[2]}', 'default');
    row = db.prepare("SELECT operation, restored_from_version FROM calendar_snapshot_history WHERE calendar_id = ? AND version = 6").get('default') as Record<string, unknown>;
    assert.deepEqual([row.operation, row.restored_from_version], ['save', null]);
    const stmt = db.prepare("UPDATE calendar_snapshots SET snapshot_json = ?, version = version + 1, restored_from_version = NULL WHERE calendar_id = ?");
    for (let i = 0; i < 55; i++) stmt.run(JSON.stringify({ events: [i] }), 'default');
    const stats = db.prepare("SELECT COUNT(*) AS count, MIN(version) AS first, MAX(version) AS last FROM calendar_snapshot_history WHERE calendar_id = ?").get('default') as Record<string, number>;
    assert.equal(stats.count, 50);
    assert.equal(stats.last, 61);
    assert.equal(stats.first, 12);
  } finally { db.close(); }
});

test('history trigger fails atomically with current snapshot update', () => {
  const db = createDb();
  try {
    db.exec(migration('0003_add_snapshot_history.sql'));
    db.prepare("INSERT INTO calendar_snapshots (calendar_id, snapshot_json, version) VALUES (?, ?, ?)").run('default', '{"events":[]}', 1);
    db.exec("CREATE TRIGGER force_history_failure BEFORE INSERT ON calendar_snapshot_history BEGIN SELECT RAISE(ABORT, 'history_failure'); END");
    assert.throws(() => db.prepare("UPDATE calendar_snapshots SET snapshot_json = ?, version = version + 1, restored_from_version = 1 WHERE calendar_id = 'default'").run('changed'), /history_failure/);
    const current = db.prepare("SELECT snapshot_json, version FROM calendar_snapshots WHERE calendar_id = 'default'").get() as Record<string, unknown>;
    assert.equal(current.snapshot_json, '{"events":[]}');
    assert.equal(current.version, 1);
  } finally { db.close(); }
});
