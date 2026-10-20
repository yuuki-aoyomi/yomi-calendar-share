import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adoptCalendarSnapshot,
  getLoadedCalendarVersion,
  restoreCalendarVersion,
  fetchCalendarHistory,
  fetchCalendarHistoryPreview,
} from '../src/api/calendarApi.ts';
import type { CalendarDataSnapshot } from '../src/repositories/calendarRepository.ts';

const snapshot: CalendarDataSnapshot = {
  events: [], moneyRecords: [], loveLogs: [], tags: [], partTimeJobs: [],
  creditCards: [], subscriptions: [], dailyPhotos: [],
};

test('restore uses the tab-loaded optimistic-lock version and sends it to the server', async () => {
  adoptCalendarSnapshot('default', snapshot, 7);
  assert.equal(getLoadedCalendarVersion('default'), 7);
  assert.equal(getLoadedCalendarVersion('another'), undefined);
  const originalFetch = globalThis.fetch;
  let capturedBody: { version?: number; expectedVersion?: number } = {};
  globalThis.fetch = (async (_input, init) => {
    assert.equal(init?.method, 'POST');
    assert.match(String(_input), /\/api\/calendar-history\/default$/);
    capturedBody = JSON.parse(String(init?.body)) as typeof capturedBody;
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer mock-token');
    return new Response(JSON.stringify({ ok: true, version: 8 }), { status: 200 });
  }) as typeof fetch;
  try {
    await restoreCalendarVersion('default', 'mock-token', 3, getLoadedCalendarVersion('default')!);
    assert.deepEqual(capturedBody, { version: 3, expectedVersion: 7 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('concurrent restore 409 is reported as a failure rather than treated as success', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    error: { code: 'version_conflict', message: 'Calendar changed.' },
  }), { status: 409, headers: { 'content-type': 'application/json' } })) as typeof fetch;
  try {
    await assert.rejects(restoreCalendarVersion('default', 'mock-token', 3, 7), /version_conflict/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('history list and preview use authenticated GET requests', async () => {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (async (input, init) => {
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer mock-token');
    assert.equal(init?.cache, 'no-store');
    requested.push(String(input));
    if (String(input).includes('?version=')) {
      return Response.json({ calendarId: 'default', version: 3, snapshot, operation: 'save', createdAt: '' });
    }
    return Response.json({ calendarId: 'default', entries: [{ version: 3, operation: 'save', createdAt: '' }] });
  }) as typeof fetch;
  try {
    const items = await fetchCalendarHistory('default', 'mock-token');
    assert.equal(items[0].version, 3);
    const preview = await fetchCalendarHistoryPreview('default', 'mock-token', 3);
    assert.equal(preview.snapshot.events.length, 0);
    assert.equal(requested.length, 2);
    assert.match(requested[1], /\?version=3$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
