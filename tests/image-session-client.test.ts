import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adoptCalendarSnapshot, fetchCalendarSnapshot, getLoadedCalendarVersion,
  loadCalendarSnapshotWithVersion, withReadToken,
} from '../src/api/calendarApi';
import { defaultCalendarSnapshot } from '../server/core/calendarSnapshot';

const calendarId = 'default';
const writeToken = 'client-test-token';

test('loading the calendar establishes scoped image session before returning data', async () => {
  const originalFetch = globalThis.fetch;
  const requests: { url: string; method: string; authorization: string | null; credentials: RequestCredentials | undefined; body?: string }[] = [];
  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      requests.push({
        url, method: init?.method ?? 'GET', authorization: headers.get('authorization'),
        credentials: init?.credentials, body: typeof init?.body === 'string' ? init.body : undefined,
      });
      if (url === '/api/calendar/default') {
        return Response.json({ calendarId, snapshot: defaultCalendarSnapshot, version: 7 });
      }
      if (url === '/api/image-session') {
        return Response.json({ ok: true, expiresAt: 12345 });
      }
      throw new Error('Unexpected request ' + url);
    };
    const snapshot = await fetchCalendarSnapshot(calendarId, writeToken);
    assert.deepEqual(snapshot.snapshot, defaultCalendarSnapshot);
    assert.deepEqual(requests.map((request) => [request.url, request.method]), [
      ['/api/calendar/default', 'GET'],
      ['/api/image-session', 'POST'],
    ]);
    assert.equal(requests[0].authorization, `Bearer ${writeToken}`);
    assert.equal(requests[1].authorization, `Bearer ${writeToken}`);
    assert.equal(requests[1].credentials, 'same-origin');
    assert.deepEqual(JSON.parse(requests[1].body ?? ''), { calendarId });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('failed image session setup rejects calendar loading instead of silently showing missing pictures', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/calendar/default') {
        return Response.json({ calendarId, snapshot: defaultCalendarSnapshot, version: 1 });
      }
      if (url === '/api/image-session') {
        return Response.json({ error: { message: 'No session' } }, { status: 401 });
      }
      throw new Error('Unexpected request ' + url);
    };
    await assert.rejects(() => fetchCalendarSnapshot(calendarId, writeToken), /No session/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('image URL helper removes legacy token parameters without adding new credentials', () => {
  const url = '/api/images/daily-images/optimized/default/2026-10-20/demo.webp';
  assert.equal(withReadToken(url, writeToken), url);
  assert.equal(withReadToken(url + '?token=old-secret', writeToken), url);
  assert.equal(withReadToken(url + '?token=old-secret&x=1', writeToken), url);
});

test('stored-data error rejects loading without replacing the known sync base or creating an image session', async () => {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  adoptCalendarSnapshot(calendarId, defaultCalendarSnapshot, 7);
  try {
    globalThis.fetch = async (input: string | URL | Request) => {
      requested.push(String(input));
      return Response.json({ error: { code: 'invalid_stored_snapshot', message: '保存データを検証できません。' } }, { status: 500 });
    };
    await assert.rejects(() => loadCalendarSnapshotWithVersion(calendarId, writeToken), /保存データを検証できません.*invalid_stored_snapshot/);
    assert.equal(getLoadedCalendarVersion(calendarId), 7);
    assert.deepEqual(requested, ['/api/calendar/default']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
