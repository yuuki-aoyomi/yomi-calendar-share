import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { handleCardTransactions } from '../server/cloudflare/cardTransactionRoutes';
import { decodeCardTransactionCursor, encodeCardTransactionCursor } from '../server/core/cardTransactions';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of ['0004_card_import.sql', '0005_card_transaction_pagination.sql']) {
    sqlite.exec(readFileSync('migrations/' + file, 'utf8'));
  }
  sqlite.exec(`INSERT INTO card_import_sources (id, calendar_id, credit_card_id, provider, label)
    VALUES ('source', 'default', 'card', 'jcb', 'synthetic')`);
  const insert = sqlite.prepare(`INSERT INTO card_transactions
    (id, calendar_id, source_id, transaction_date, amount_yen, created_at)
    VALUES (?, ?, 'source', ?, 100, ?)`);
  for (let i = 0; i < 205; i++) {
    insert.run('t' + String(i).padStart(3, '0'), 'default',
      i < 105 ? '2026-10-20' : '2026-10-21', i % 2 ? '2026-10-21 01:00:00' : '2026-10-21 02:00:00');
  }
  insert.run('other-only', 'other', '2026-10-22', '2026-10-22 00:00:00');
  const db = { prepare: (sql: string) => ({ bind: (...values: SQLInputValue[]) => ({
    all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
    first: async () => sqlite.prepare(sql).get(...values) ?? null,
    run: async () => ({ meta: { changes: sqlite.prepare(sql).run(...values).changes } }),
  }) }) } as unknown as D1Database;
  const request = (query: string, body?: unknown, id = '') => {
    const url = new URL('https://example.test/api/card-transactions' + id + '?' + query);
    return handleCardTransactions(new Request(url, {
      method: body === undefined ? 'GET' : 'PATCH',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), db, url);
  };
  return { sqlite, request };
}

test('cursor pages visit all 205 transactions once with ties and calendar isolation', async () => {
  const { sqlite, request } = fixture();
  try {
    const expected = sqlite.prepare(`SELECT id FROM card_transactions WHERE calendar_id = 'default'
      ORDER BY transaction_date DESC, created_at DESC, id DESC`).all().map((row) => row.id);
    for (const limit of [1, 50, 100]) {
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const query = new URLSearchParams({ calendarId: 'default', limit: String(limit) });
        if (cursor !== null) query.set('cursor', cursor);
        const response = await request(query.toString());
        assert.equal(response.status, 200);
        const page = await response.json() as { transactions: { id: string }[]; nextCursor: string | null };
        assert.ok(page.transactions.length <= limit);
        ids.push(...page.transactions.map((row) => row.id));
        cursor = page.nextCursor;
        assert.ok(ids.length <= expected.length, 'pagination must terminate');
      } while (cursor !== null);
      assert.deepEqual(ids, expected);
    }
  } finally { sqlite.close(); }
});

test('cursor survives deletion of its anchor and does not repeat a newer insert', async () => {
  const { sqlite, request } = fixture();
  try {
    const first = await (await request('calendarId=default&limit=100')).json();
    const expectedNext = sqlite.prepare(`SELECT id FROM card_transactions WHERE calendar_id = 'default'
      ORDER BY transaction_date DESC, created_at DESC, id DESC LIMIT 100 OFFSET 100`).all().map((row) => row.id);
    sqlite.prepare('DELETE FROM card_transactions WHERE id = ?').run(first.transactions[99].id);
    sqlite.exec(`INSERT INTO card_transactions (id, calendar_id, source_id, transaction_date, amount_yen)
      VALUES ('newest', 'default', 'source', '2026-10-22', 100)`);
    const second = await (await request(new URLSearchParams({ calendarId: 'default', limit: '100', cursor: first.nextCursor }).toString())).json();
    assert.deepEqual(second.transactions.map((row: { id: string }) => row.id), expectedNext);
  } finally { sqlite.close(); }
});

test('invalid status returns 400 without changing SQLite; scoped PATCH still works', async () => {
  const { sqlite, request } = fixture();
  try {
    for (const status of [['confirmed'], { value: 'confirmed' }, null, true, 1]) {
      assert.equal((await request('calendarId=default', { status }, '/t000')).status, 400);
    }
    assert.equal(sqlite.prepare("SELECT status FROM card_transactions WHERE id = 't000'").get()?.status, 'pending');
    assert.equal((await request('calendarId=other', { status: 'confirmed' }, '/t000')).status, 404);
    assert.equal((await request('calendarId=default', { status: 'confirmed' }, '/t000')).status, 200);
  } finally { sqlite.close(); }
});

test('cursor validates shape, size and calendar; supports Unicode identifiers', async () => {
  const row = { transactionDate: '2026-10-21', createdAt: '2026-10-21 12:00:00', id: '取引-1' };
  const cursor = encodeCardTransactionCursor('家計', row);
  assert.deepEqual(decodeCardTransactionCursor(cursor, '家計'), row);
  assert.equal(decodeCardTransactionCursor(cursor, 'other'), null);
  const { sqlite, request } = fixture();
  try {
    for (const invalid of ['', '%', 'a'.repeat(2049), btoa('[]'), cursor]) {
      assert.equal((await request(new URLSearchParams({ calendarId: 'default', cursor: invalid }).toString())).status, 400);
    }
    const empty = await (await request('calendarId=missing')).json();
    assert.deepEqual(empty, { transactions: [], nextCursor: null });
  } finally { sqlite.close(); }
});

test('both first and cursor page queries use the covering sort index without a temporary sort', () => {
  const { sqlite } = fixture();
  try {
    for (const after of ['', " AND (transaction_date, created_at, id) < ('2026-10-21', '2026-10-21 01:00:00', 't150')"]) {
      const plan = sqlite.prepare(`EXPLAIN QUERY PLAN SELECT id FROM card_transactions
        WHERE calendar_id = 'default'${after} ORDER BY transaction_date DESC, created_at DESC, id DESC LIMIT 101`).all();
      const details = plan.map((row) => String(row.detail)).join('\n');
      assert.match(details, /idx_card_transactions_calendar_page/);
      assert.doesNotMatch(details, /TEMP B-TREE/);
    }
  } finally { sqlite.close(); }
});
