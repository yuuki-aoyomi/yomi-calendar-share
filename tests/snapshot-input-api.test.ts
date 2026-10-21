import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../server/cloudflare/worker.ts';

const empty = () => ({ events: [], moneyRecords: [], loveLogs: [], tags: [], partTimeJobs: [], creditCards: [], subscriptions: [], dailyPhotos: [] });
const setup = () => {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_create_calendar_snapshots.sql', '0002_add_snapshot_version.sql', '0003_add_snapshot_history.sql']) {
    db.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }
  const env = {
    WRITE_TOKEN: 'snapshot-input-test-token',
    DB: { prepare: (sql: string) => ({ bind: (...args: (string | number)[]) => ({
      run: async () => ({ meta: { changes: db.prepare(sql).run(...args).changes } }),
      first: async () => db.prepare(sql).get(...args) ?? null,
    }) }) },
  } as unknown as Parameters<typeof worker.fetch>[1];
  const put = (snapshot: unknown, expectedVersion: number) => worker.fetch(new Request('https://calendar.example/api/calendar/default', {
    method: 'PUT', headers: { authorization: 'Bearer snapshot-input-test-token', 'content-type': 'application/json' },
    body: JSON.stringify({ snapshot, expectedVersion }),
  }), env);
  return { db, put };
};

test('invalid PUT never changes the existing snapshot, version or history', async () => {
  const { db, put } = setup();
  try {
    const original = JSON.stringify(empty());
    db.prepare('INSERT INTO calendar_snapshots (calendar_id, snapshot_json, version) VALUES (?, ?, 7)').run('default', original);
    for (const snapshot of [{ events: null }, { ...empty(), events: [null] },
      { ...empty(), moneyRecords: [{ id: 'm', amount: '100' }] }, []]) {
      const response = await put(snapshot, 7);
      assert.equal(response.status, 400);
      assert.equal((await response.json() as { error: { code: string } }).error.code, 'invalid_snapshot');
      const row = db.prepare('SELECT snapshot_json, version FROM calendar_snapshots').get()!;
      assert.equal(row.snapshot_json, original);
      assert.equal(row.version, 7);
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM calendar_snapshot_history').get()!.count, 1);
    }
  } finally { db.close(); }
});

test('valid and legacy PUTs retain optimistic locking and advance history', async () => {
  const { db, put } = setup();
  try {
    const { subscriptions: _subs, dailyPhotos: _photos, ...legacy } = empty();
    assert.equal((await put(legacy, 0)).status, 200);
    const row = db.prepare('SELECT snapshot_json, version FROM calendar_snapshots').get()!;
    assert.equal(row.version, 1);
    assert.deepEqual(JSON.parse(String(row.snapshot_json)), empty());
    assert.equal((await put(empty(), 1)).status, 200);
    assert.equal((await put(empty(), 1)).status, 409);
    assert.equal(db.prepare('SELECT version FROM calendar_snapshots').get()!.version, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM calendar_snapshot_history').get()!.count, 2);
    assert.equal((await put(empty(), Number.MAX_SAFE_INTEGER + 1)).status, 400);
  } finally { db.close(); }
});

test('invalid first PUT and oversized snapshots never create database rows', async () => {
  const { db, put } = setup();
  try {
    assert.equal((await put({ ...empty(), events: [null] }, 0)).status, 400);
    assert.equal((await put({ ...empty(), futureMetadata: 'x'.repeat(1_000_001) }, 0)).status, 413);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM calendar_snapshots').get()!.count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM calendar_snapshot_history').get()!.count, 0);
  } finally { db.close(); }
});
