import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../server/cloudflare/worker.ts';
import { defaultCalendarSnapshot, parseCalendarSnapshot, StoredSnapshotError } from '../server/core/calendarSnapshot.ts';

const legacy = () => ({ events: [{
  id: 'event', date: '2026-10-21', title: '復元する予定', category: 'schedule', createdAt: '', updatedAt: '',
}] });
const invalidSnapshots = [
  'private-corrupt-payload', 'null', '[]', '{"events":null}', '{"dailyPhotos":{}}',
  '{"events":[null]}', JSON.stringify({ events: [{ ...legacy().events[0], date: '2026-02-30' }] }),
  JSON.stringify({ events: [legacy().events[0], legacy().events[0]] }),
];

const setup = () => {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_create_calendar_snapshots.sql', '0002_add_snapshot_version.sql', '0003_add_snapshot_history.sql']) {
    db.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }
  const env = {
    WRITE_TOKEN: 'stored-snapshot-test-token',
    DB: { prepare: (sql: string) => ({ bind: (...args: (string | number)[]) => ({
      run: async () => ({ meta: { changes: db.prepare(sql).run(...args).changes } }),
      first: async () => db.prepare(sql).get(...args) ?? null,
      all: async () => ({ success: true, results: db.prepare(sql).all(...args) }),
    }) }) },
  } as unknown as Parameters<typeof worker.fetch>[1];
  const request = (path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', authorized = true) =>
    worker.fetch(new Request(`https://calendar.example/api/${path}`, {
      method,
      headers: { authorization: authorized ? 'Bearer stored-snapshot-test-token' : '', 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env);
  const seed = (json = JSON.stringify(defaultCalendarSnapshot)) =>
    db.prepare('INSERT INTO calendar_snapshots (calendar_id, snapshot_json, version) VALUES (?, ?, 7)').run('default', json);
  const history = (json: string) =>
    db.prepare('INSERT INTO calendar_snapshot_history (calendar_id, version, snapshot_json) VALUES (?, 2, ?)').run('default', json);
  const state = () => ({
    current: db.prepare('SELECT * FROM calendar_snapshots ORDER BY calendar_id').all(),
    history: db.prepare('SELECT * FROM calendar_snapshot_history ORDER BY calendar_id, version').all(),
  });
  return { db, request, seed, history, state };
};

test('stored parser preserves legacy collection defaults but rejects unreadable snapshots', () => {
  assert.deepEqual(parseCalendarSnapshot('{}'), defaultCalendarSnapshot);
  const normalized = parseCalendarSnapshot(JSON.stringify(legacy()));
  assert.equal(normalized.events[0].title, '復元する予定');
  assert.deepEqual(normalized.events[0].tagIds, []);
  assert.deepEqual(normalized.dailyPhotos, []);
  for (const json of invalidSnapshots) assert.throws(() => parseCalendarSnapshot(json), StoredSnapshotError);
});

test('first use and genuinely empty stored calendars still load successfully', async () => {
  const ctx = setup();
  try {
    const first = await ctx.request('calendar/default');
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { calendarId: 'default', snapshot: defaultCalendarSnapshot, version: 0 });
    ctx.seed();
    const empty = await ctx.request('calendar/default');
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), { calendarId: 'default', snapshot: defaultCalendarSnapshot, version: 7 });
  } finally { ctx.db.close(); }
});

test('corrupted current data fails GET and stale PUT without exposing an empty merge base or changing data', async () => {
  for (const invalid of invalidSnapshots) {
    const ctx = setup();
    try {
      ctx.seed(invalid);
      const before = ctx.state();
      for (const response of [
        await ctx.request('calendar/default'),
        await ctx.request('calendar/default', { snapshot: defaultCalendarSnapshot, expectedVersion: 6 }, 'PUT'),
      ]) {
        assert.equal(response.status, 500);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const payload = await response.json() as { error: { code: string }; snapshot?: unknown };
        assert.equal(payload.error.code, 'invalid_stored_snapshot');
        assert.equal(payload.snapshot, undefined);
        assert.doesNotMatch(JSON.stringify(payload), /private-corrupt-payload/);
      }
      assert.deepEqual(ctx.state(), before);
    } finally { ctx.db.close(); }
  }
});

test('corrupted history cannot be previewed or restored and leaves every live/history field unchanged', async () => {
  for (const invalid of invalidSnapshots) {
    const ctx = setup();
    try {
      ctx.seed();
      ctx.history(invalid);
      const before = ctx.state();
      for (const response of [
        await ctx.request('calendar-history/default?version=2'),
        await ctx.request('calendar-history/default', { version: 2, expectedVersion: 7 }),
      ]) {
        assert.equal(response.status, 500);
        assert.equal((await response.json() as { error: { code: string } }).error.code, 'invalid_stored_snapshot');
      }
      assert.equal((await ctx.request('calendar-history/default')).status, 200);
      assert.deepEqual(ctx.state(), before);
    } finally { ctx.db.close(); }
  }
});

test('valid legacy history restores as a new normalized version and retains optimistic locking', async () => {
  const ctx = setup();
  try {
    ctx.seed();
    ctx.history(JSON.stringify(legacy()));
    const preview = await ctx.request('calendar-history/default?version=2');
    assert.equal(preview.status, 200);
    const expected = parseCalendarSnapshot(JSON.stringify(legacy()));
    assert.deepEqual((await preview.json() as { snapshot: unknown }).snapshot, expected);
    const restore = await ctx.request('calendar-history/default', { version: 2, expectedVersion: 7 });
    assert.equal(restore.status, 200);
    assert.deepEqual(await restore.json(), { ok: true, calendarId: 'default', version: 8, restoredFromVersion: 2 });
    const current = ctx.db.prepare('SELECT * FROM calendar_snapshots WHERE calendar_id = ?').get('default')!;
    assert.equal(current.version, 8);
    assert.deepEqual(JSON.parse(String(current.snapshot_json)), expected);
    const entry = ctx.db.prepare('SELECT * FROM calendar_snapshot_history WHERE version = 8').get()!;
    assert.equal(entry.operation, 'restore');
    assert.equal(entry.restored_from_version, 2);
    const before = ctx.state();
    assert.equal((await ctx.request('calendar-history/default', { version: 2, expectedVersion: 7 })).status, 409);
    assert.deepEqual(ctx.state(), before);
  } finally { ctx.db.close(); }
});

test('a valid history remains usable to recover a corrupted current snapshot', async () => {
  const ctx = setup();
  try {
    ctx.seed('broken');
    ctx.history(JSON.stringify(legacy()));
    assert.equal((await ctx.request('calendar/default')).status, 500);
    assert.equal((await ctx.request('calendar-history/default')).status, 200);
    assert.equal((await ctx.request('calendar-history/default', { version: 2, expectedVersion: 7 })).status, 200);
    assert.equal((await ctx.request('calendar/default')).status, 200);
  } finally { ctx.db.close(); }
});

test('oversized history and unsafe versions are refused without modifying live data', async () => {
  const ctx = setup();
  try {
    ctx.seed();
    ctx.history(JSON.stringify({ ...defaultCalendarSnapshot, futureMetadata: 'x'.repeat(1_000_001) }));
    const before = ctx.state();
    assert.equal((await ctx.request('calendar-history/default', { version: 2, expectedVersion: 7 })).status, 413);
    assert.equal((await ctx.request(`calendar-history/default?version=${Number.MAX_SAFE_INTEGER + 1}`)).status, 400);
    assert.equal((await ctx.request('calendar-history/default', { version: Number.MAX_SAFE_INTEGER + 1, expectedVersion: 7 })).status, 400);
    assert.equal((await ctx.request('calendar-history/default', { version: 2, expectedVersion: Number.MAX_SAFE_INTEGER + 1 })).status, 400);
    assert.deepEqual(ctx.state(), before);
  } finally { ctx.db.close(); }
});

test('corrupt data does not bypass authentication or turn missing history into a successful restore', async () => {
  const ctx = setup();
  try {
    ctx.seed('broken');
    const before = ctx.state();
    assert.equal((await ctx.request('calendar/default', undefined, 'GET', false)).status, 401);
    assert.equal((await ctx.request('calendar-history/default', { version: 7, expectedVersion: 7 }, 'POST', false)).status, 401);
    assert.equal((await ctx.request('calendar-history/default?version=99')).status, 404);
    assert.equal((await ctx.request('calendar-history/default', { version: 99, expectedVersion: 7 })).status, 404);
    assert.deepEqual(ctx.state(), before);
  } finally { ctx.db.close(); }
});
