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


test('image upload and GET round-trip using the same scoped browser session', async () => {
  const saved = new Map<string, { body: Uint8Array; type: string }>();
  const testEnv = {
    WRITE_TOKEN: writeToken,
    IMAGES: {
      put: async (key: string, body: ReadableStream<Uint8Array>, options: { httpMetadata: { contentType: string } }) => {
        saved.set(key, { body: new Uint8Array(await new Response(body).arrayBuffer()), type: options.httpMetadata.contentType });
      },
      get: async (key: string) => {
        const file = saved.get(key);
        return file ? {
          body: new Blob([new Uint8Array(file.body)]).stream(),
          httpEtag: '"roundtrip"',
          writeHttpMetadata: (headers: Headers) => headers.set('Content-Type', file.type),
        } : null;
      },
    },
    ASSETS: { fetch: async () => new Response('asset') },
  } as unknown as Parameters<typeof worker.fetch>[1];

  const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x01, 0x02, 0x03]);
  const form = new FormData();
  form.set('calendarId', 'default');
  form.set('date', '2026-10-20');
  form.set('photoId', 'new-photo');
  form.set('file', new File([bytes], 'sample.webp', { type: 'image/webp' }));
  const upload = await worker.fetch(new Request(`${origin}/api/images`, {
    method: 'POST', headers: { authorization: `Bearer ${writeToken}` }, body: form,
  }), testEnv);
  assert.equal(upload.status, 200);
  const savedPhoto = await upload.json() as { publicUrl: string; key: string };
  assert.equal(savedPhoto.publicUrl, `/api/images/${savedPhoto.key}`);
  assert.equal(new URL(savedPhoto.publicUrl, origin).searchParams.has('token'), false);
  assert.equal((await worker.fetch(new Request(new URL(savedPhoto.publicUrl, origin)), testEnv)).status, 401);

  const session = await worker.fetch(new Request(`${origin}/api/image-session`, {
    method: 'POST',
    headers: { authorization: `Bearer ${writeToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ calendarId: 'default' }),
  }), testEnv);
  assert.equal(session.status, 200);
  const cookie = (session.headers.get('set-cookie') ?? '').split(';')[0];
  const image = await worker.fetch(new Request(new URL(savedPhoto.publicUrl, origin), { headers: { cookie } }), testEnv);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/webp');
  assert.equal(image.headers.get('cache-control'), 'private, no-store');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), bytes);
});

test('read session is invalid after WRITE_TOKEN rotation', async () => {
  const cookie = await issueCookie();
  const rotatedEnv = { ...env, WRITE_TOKEN: 'different-server-write-secret' };
  assert.equal((await worker.fetch(imageRequest(keyA, cookie), rotatedEnv)).status, 401);
});

test('session requires an authorized editor and a valid calendar ID', async () => {
  const invalidCredentials = await worker.fetch(new Request(`${origin}/api/image-session`, {
    method: 'POST',
    headers: { authorization: 'Bearer incorrect', 'content-type': 'application/json' },
    body: JSON.stringify({ calendarId: 'default' }),
  }), env);
  assert.equal(invalidCredentials.status, 401);
  assert.equal(invalidCredentials.headers.get('set-cookie'), null);
  for (const invalidBody of ['not-json', 'null', '{}', '{"calendarId":10}', '{"calendarId":"a/b"}']) {
    const response = await worker.fetch(new Request(`${origin}/api/image-session`, {
      method: 'POST',
      headers: { authorization: `Bearer ${writeToken}`, 'content-type': 'application/json' },
      body: invalidBody,
    }), env);
    assert.equal(response.status, 400, invalidBody);
    assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('image session cookie rejects structurally invalid expiry and wrong cookie name', async () => {
  const cookie = await issueCookie();
  const [name, value] = cookie.split('=');
  const parts = value.split('.');
  assert.equal(parts.length, 3);
  for (const tampered of [
    'some-other-cookie=' + value,
    name + '=' + parts[0] + '.NaN.' + parts[2],
    name + '=' + parts[0] + '.99999999999999999.' + parts[2],
    name + '=' + parts[0] + '.' + parts[1] + '.not-hex',
  ]) assert.equal((await worker.fetch(imageRequest(keyA, tampered), env)).status, 401, tampered);
});

test('image GET never accepts authenticated writes or query credentials', async () => {
  const cookie = await issueCookie();
  const unauthorizedUpload = await worker.fetch(new Request(`${origin}/api/images?token=${writeToken}`, {
    method: 'POST',
    body: new FormData(),
  }), env);
  assert.equal(unauthorizedUpload.status, 401);
  const readAttempt = await worker.fetch(new Request(`${origin}/api/images/${keyA}`, {
    method: 'PUT',
    headers: { cookie, authorization: `Bearer ${writeToken}` },
    body: 'change',
  }), env);
  assert.equal(readAttempt.status, 405);
  assert.equal((await worker.fetch(imageRequest(keyA, cookie), env)).status, 200);
});
