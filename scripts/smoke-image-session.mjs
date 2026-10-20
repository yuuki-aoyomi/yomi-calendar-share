import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const port = 8791;
const origin = `http://127.0.0.1:${port}`;
const token = 'ci-image-session-local-secret';
const endpoint = (path) => new URL(path, origin);

const worker = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(port), '--var', `WRITE_TOKEN:${token}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, CI: 'true' },
  detached: process.platform !== 'win32',
});

let serverOutput = '';
for (const stream of [worker.stdout, worker.stderr]) {
  stream?.on('data', (data) => {
    serverOutput += data.toString();
    if (serverOutput.length > 16000) serverOutput = serverOutput.slice(-16000);
  });
}
const ready = async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (worker.exitCode !== null) throw new Error('Wrangler exited before startup:\n' + serverOutput);
    try {
      const response = await fetch(endpoint('/api/images/healthcheck.webp'), {
        signal: AbortSignal.timeout(1200),
      });
      if (response.status === 401) return;
    } catch { /* Worker not listening yet. */ }
    await sleep(300);
  }
  throw new Error('Wrangler startup timed out:\n' + serverOutput);
};
const issueSession = async (calendarId = 'default') => {
  const response = await fetch(endpoint('/api/image-session'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ calendarId }),
  });
  assert.equal(response.status, 200, 'image-session response: ' + await response.clone().text());
  const cookieHeader = response.headers.get('set-cookie') ?? '';
  assert.match(cookieHeader, /HttpOnly/);
  assert.match(cookieHeader, /Secure/);
  assert.match(cookieHeader, /SameSite=Strict/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(cookieHeader, new RegExp(token));
  return cookieHeader.split(';')[0];
};

try {
  await ready();
  const payload = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x31, 0x32, 0x33]);
  const form = new FormData();
  form.set('calendarId', 'default');
  form.set('date', '2026-10-20');
  form.set('photoId', 'image-auth-smoke');
  form.set('file', new File([payload], 'smoke.webp', { type: 'image/webp' }));
  const upload = await fetch(endpoint('/api/images'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  assert.equal(upload.status, 200, 'R2 upload response: ' + await upload.clone().text());
  const { publicUrl } = await upload.json();
  assert.ok(publicUrl.startsWith('/api/images/daily-images/optimized/default/'));
  assert.ok(!publicUrl.includes('?token='));

  const withoutCookie = await fetch(endpoint(publicUrl));
  assert.equal(withoutCookie.status, 401);
  assert.equal(withoutCookie.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(endpoint(publicUrl + '?token=' + token))).status, 401);

  const cookie = await issueSession();
  const retrieved = await fetch(endpoint(publicUrl), { headers: { Cookie: cookie } });
  assert.equal(retrieved.status, 200);
  assert.equal(retrieved.headers.get('content-type'), 'image/webp');
  assert.equal(retrieved.headers.get('cache-control'), 'private, no-store');
  assert.equal(retrieved.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(new Uint8Array(await retrieved.arrayBuffer()), payload);

  const otherCookie = await issueSession('other');
  assert.equal((await fetch(endpoint(publicUrl), { headers: { Cookie: otherCookie } })).status, 401);

  const write = await fetch(endpoint('/api/images'), {
    method: 'POST', headers: { Cookie: cookie }, body: new FormData(),
  });
  assert.equal(write.status, 401);
  const malformed = await fetch(endpoint('/api/image-session'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ calendarId: 42 }),
  });
  assert.equal(malformed.status, 400);
  console.log('PASS: Wrangler local HTTP image-upload/session/authorization/GET/security smoke test.');
} catch (error) {
  console.error('FAIL: Wrangler local HTTP smoke test.', error);
  console.error('Wrangler output:', serverOutput);
  process.exitCode = 1;
} finally {
  if (process.platform !== 'win32' && worker.pid) {
    try { process.kill(-worker.pid, 'SIGTERM'); } catch { worker.kill('SIGTERM'); }
  } else {
    worker.kill('SIGTERM');
  }
}
