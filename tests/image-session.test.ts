import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../server/cloudflare/worker.ts';
import { withReadToken } from '../src/api/calendarApi.ts';

const origin = 'https://calendar.example.test';
const keyA = 'daily-images/optimized/default/2026-10-20/photo.webp';
const keyB = 'daily-images/optimized/other/2026-10-20/photo.webp';
const writeToken = 'test-secret-do-not-use-in-production';

const env = {
  WRITE_TOKEN: writeToken,
  IMAGES: {
    get: async (key: string) => key === keyA || key === keyB ? {
      body: 'private-image',
      httpEtag: '"test-etag"',
      writeHttpMetadata: (headers: Headers) => headers.set('Content-Type', 'image/webp'),
    } : null,
  },
  ASSETS: { fetch: async () => new Response('asset') },
} as unknown as Parameters<typeof worker.fetch>[1];

const imageRequest = (key: string, cookie?: string, extra = '') =>
  new Request(`${origin}/api/images/${key}${extra}`, {
    headers: cookie ? { cookie } : {},
  });

const issueCookie = async (calendarId = 'default'): Promise<string> => {
  const response = await worker.fetch(new Request(`${origin}/api/image-session`, {
    method: 'POST',
    headers: { authorization: `Bearer ${writeToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ calendarId }),
  }), env);
  assert.equal(response.status, 200);
  const setCookie = response.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Path=\/api\/images\//);
  assert.doesNotMatch(setCookie, /test-secret-do-not-use/);
  return setCookie.split(';')[0];
};

test('image URLs never contain the write token', () => {
  assert.equal(withReadToken(`/api/images/${keyA}`, writeToken), `/api/images/${keyA}`);
  assert.equal(withReadToken(`/api/images/${keyA}?token=old-secret`, writeToken), `/api/images/${keyA}`);
});

test('unprivileged requests and the old query-token path cannot read private images', async () => {
  assert.equal((await worker.fetch(imageRequest(keyA), env)).status, 401);
  assert.equal((await worker.fetch(imageRequest(keyA, undefined, `?token=${writeToken}`), env)).status, 401);
});

test('signed read cookie restricts image access and does not grant write access', async () => {
  const cookie = await issueCookie();
  const response = await worker.fetch(imageRequest(keyA, cookie), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(await response.text(), 'private-image');
  assert.equal((await worker.fetch(imageRequest(keyB, cookie), env)).status, 401);
  const unauthorizedWrite = await worker.fetch(new Request(`${origin}/api/calendar/default`, {
    method: 'PUT', headers: { cookie, 'content-type': 'application/json' },
    body: '{}',
  }), env);
  assert.equal(unauthorizedWrite.status, 401);
});

test('tampered signature, missing credentials, and malformed cookie are rejected', async () => {
  const cookie = await issueCookie();
  const last = cookie.at(-1) === '0' ? '1' : '0';
  assert.equal((await worker.fetch(imageRequest(keyA, cookie.slice(0, -1) + last), env)).status, 401);
  assert.equal((await worker.fetch(imageRequest(keyA, 'yomi_image_read=broken'), env)).status, 401);
  const withoutAuthorization = await worker.fetch(new Request(`${origin}/api/image-session`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ calendarId: 'default' }),
  }), env);
  assert.equal(withoutAuthorization.status, 401);
});

test('expired sessions cannot read images and malformed calendar scopes are rejected', async () => {
  const cookie = await issueCookie();
  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + (61 * 60 * 1000);
    assert.equal((await worker.fetch(imageRequest(keyA, cookie), env)).status, 401);
  } finally {
    Date.now = originalNow;
  }
  for (const calendarId of ['../other', 'a/b', '']) {
    const response = await worker.fetch(new Request(`${origin}/api/image-session`, {
      method: 'POST',
      headers: { authorization: `Bearer ${writeToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ calendarId }),
    }), env);
    assert.equal(response.status, 400);
  }
});

test('session cookie cannot be used to call snapshot history restore', async () => {
  const cookie = await issueCookie();
  const result = await worker.fetch(new Request(`${origin}/api/calendar-history/default`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ version: 1, expectedVersion: 1 }),
  }), env);
  assert.equal(result.status, 401);
});
