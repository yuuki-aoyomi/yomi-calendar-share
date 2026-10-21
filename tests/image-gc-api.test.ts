import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../server/cloudflare/worker.ts';
import { imageGcGracePeriodMs } from '../server/core/imageStorageGc.ts';

const imageKey = (name: string) => `daily-images/optimized/default/${name}.webp`;
const snapshot = (photos: unknown[] = []) => JSON.stringify({ dailyPhotos: photos });

const setup = () => {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_create_calendar_snapshots.sql', '0002_add_snapshot_version.sql', '0003_add_snapshot_history.sql']) {
    db.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }
  const deleted: string[] = [];
  const objects = new Map<string, { key: string; size: number; uploaded: Date }>();
  let beforeQuery: ((sql: string, args: unknown[]) => void) | undefined;
  const env = {
    WRITE_TOKEN: 'test-only-image-gc-token',
    DB: { prepare: (sql: string) => ({ bind: (...args: unknown[]) => ({ all: async () => {
      beforeQuery?.(sql, args);
      return { success: true, results: db.prepare(sql).all(...args as (string | number | null)[]) };
    } }) }) },
    IMAGES: {
      list: async () => ({ objects: [...objects.values()], truncated: false }),
      delete: async (key: string) => { deleted.push(key); objects.delete(key); },
    },
  } as unknown as Parameters<typeof worker.fetch>[1];
  const addImage = (name: string, uploaded = new Date(Date.now() - 2 * imageGcGracePeriodMs)) => {
    const key = imageKey(name);
    objects.set(key, { key, size: 10, uploaded });
    return key;
  };
  const insertCurrent = (id: string, json = snapshot()) => {
    db.prepare('INSERT INTO calendar_snapshots (calendar_id, snapshot_json, version) VALUES (?, ?, 1)').run(id, json);
  };
  const request = (path: string, body?: unknown, authorized = true) => worker.fetch(new Request(`https://calendar.example.test/api/admin/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(authorized ? { authorization: 'Bearer test-only-image-gc-token' } : {}), 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env);
  const gc = (keys: unknown[]) => request('image-gc', { keys, confirm: 'DELETE_ORPHANS' });
  return { db, objects, deleted, addImage, insertCurrent, request, gc,
    onQuery: (callback: typeof beforeQuery) => { beforeQuery = callback; } };
};

test('storage summary and GC protect current and historical images including legacy URLs', async () => {
  const ctx = setup();
  try {
    const current = ctx.addImage('current');
    const historical = ctx.addImage('historical');
    const legacy = ctx.addImage('legacy');
    const orphan = ctx.addImage('orphan');
    const recent = ctx.addImage('recent', new Date());
    ctx.insertCurrent('default', snapshot([{ imageKey: historical }, { imageUrl: `/api/images/${legacy}?token=old` }]));
    ctx.db.prepare('UPDATE calendar_snapshots SET snapshot_json = ?, version = 2 WHERE calendar_id = ?')
      .run(snapshot([{ imageKey: current }]), 'default');

    const summary = await ctx.request('image-storage');
    assert.equal(summary.status, 200);
    const stats = await summary.json() as { referencedCount: number; orphanKeys: string[]; gcEligibleKeys: string[] };
    assert.equal(stats.referencedCount, 3);
    assert.deepEqual(stats.orphanKeys, [orphan, recent]);
    assert.deepEqual(stats.gcEligibleKeys, [orphan]);

    const response = await ctx.gc([current, historical, legacy, orphan, recent, orphan]);
    assert.equal(response.status, 200);
    const result = await response.json() as { deletedKeys: string[]; skippedKeys: string[] };
    assert.deepEqual(result.deletedKeys, [orphan]);
    assert.deepEqual(result.skippedKeys, [current, historical, legacy, recent].sort());
    assert.deepEqual(ctx.deleted, [orphan]);
    assert.equal(ctx.objects.has(historical), true);
  } finally { ctx.db.close(); }
});

test('GC scans every current/history page without skipping versions pruned between pages', async () => {
  const ctx = setup();
  try {
    const protectedKey = ctx.addImage('last-page');
    for (let index = 0; index < 101; index += 1) ctx.insertCurrent(`c${String(index).padStart(3, '0')}`);
    ctx.db.prepare('INSERT INTO calendar_snapshot_history (calendar_id, version, snapshot_json) VALUES (?, ?, ?)')
      .run('z-last', 7, snapshot([{ imageKey: protectedKey }]));
    let pruned = false;
    ctx.onQuery((sql, args) => {
      if (sql.includes('FROM calendar_snapshot_history') && args[0] !== null && !pruned) {
        ctx.db.exec("DELETE FROM calendar_snapshot_history WHERE calendar_id < 'c050'");
        pruned = true;
      }
    });
    const response = await ctx.gc([protectedKey]);
    assert.equal(response.status, 200);
    assert.equal(pruned, true);
    assert.deepEqual(ctx.deleted, []);
  } finally { ctx.db.close(); }
});

test('GC and storage summary fail closed on corrupted current or history snapshots', async () => {
  for (const corruptHistory of [false, true]) {
    for (const invalid of ['invalid-json', snapshot([null]), '{"dailyPhotos":null}']) {
      const ctx = setup();
      try {
        const candidate = ctx.addImage('orphan');
        ctx.insertCurrent('default', corruptHistory ? snapshot() : invalid);
        if (corruptHistory) {
          ctx.db.prepare('INSERT INTO calendar_snapshot_history (calendar_id, version, snapshot_json) VALUES (?, 2, ?)').run('default', invalid);
        }
        assert.equal((await ctx.request('image-storage')).status, 503);
        assert.equal((await ctx.gc([candidate])).status, 503);
        assert.deepEqual(ctx.deleted, []);
      } finally { ctx.db.close(); }
    }
  }
});

test('history pagination continues within a calendar using its version cursor', async () => {
  const ctx = setup();
  try {
    for (let index = 0; index < 75; index += 1) ctx.insertCurrent(`c${index}`);
    const candidate = ctx.addImage('last-version');
    const insertHistory = ctx.db.prepare('INSERT INTO calendar_snapshot_history (calendar_id, version, snapshot_json) VALUES (?, ?, ?)');
    for (let version = 1; version <= 50; version += 1) {
      insertHistory.run('z-last', version, snapshot(version === 50 ? [{ imageKey: candidate }] : []));
    }
    assert.equal((await ctx.gc([candidate])).status, 200);
    assert.deepEqual(ctx.deleted, []);
  } finally { ctx.db.close(); }
});

test('GC refuses deletion if the history table cannot be read', async () => {
  const ctx = setup();
  try {
    const candidate = ctx.addImage('orphan');
    ctx.db.exec('DROP TABLE calendar_snapshot_history');
    const response = await ctx.gc([candidate]);
    assert.equal(response.status, 503);
    assert.deepEqual(ctx.deleted, []);
  } finally { ctx.db.close(); }
});

test('GC validates authorization, explicit confirmation and key types before deletion', async () => {
  const ctx = setup();
  try {
    const candidate = ctx.addImage('orphan');
    assert.equal((await ctx.request('image-storage', undefined, false)).status, 401);
    assert.equal((await ctx.request('image-gc', { keys: [candidate], confirm: 'DELETE_ORPHANS' }, false)).status, 401);
    assert.equal((await ctx.request('image-gc', { keys: [candidate] })).status, 400);
    assert.equal((await ctx.gc([candidate, null])).status, 400);
    assert.equal((await ctx.gc(Array(101).fill(candidate))).status, 400);
    assert.deepEqual(ctx.deleted, []);
  } finally { ctx.db.close(); }
});
