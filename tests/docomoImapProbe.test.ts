import test from 'node:test';
import assert from 'node:assert/strict';
import { runImapProbe, type ProbeConnection } from '../tools/docomo-imap-probe/probe';

// The Cloudflare socket adapter is replaced by local streams; no network calls.
test('IMAP probe has isolated configuration', async () => {
  const { readFileSync } = await import('node:fs');
  const config = readFileSync('tools/docomo-imap-probe/wrangler.toml', 'utf8');
  assert.match(config, /main = ".\/worker.ts"/);
  assert.doesNotMatch(config, /\[triggers\]|\[\[d1_databases\]\]/);
});

const encoder = new TextEncoder();
function connection(chunks: string[], opened: Promise<unknown> = Promise.resolve()) {
  let closes = 0;
  const socket: ProbeConnection = {
    opened, closed: Promise.resolve(),
    readable: new ReadableStream({ start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    } }),
    async close() { closes++; },
  };
  return { socket, closes: () => closes };
}

test('probe accepts complete CRLF greetings across chunks and closes the socket', async () => {
  for (const chunks of [['* OK synthetic ready\r\n'], ['* PRE', 'AUTH synthetic\r', '\n'],
    ['* OK ' + 'a'.repeat(4089) + '\r\n']]) {
    const fixture = connection(chunks);
    assert.deepEqual(await runImapProbe(() => fixture.socket), { ok: true, stage: 'imap_greeting' });
    assert.equal(fixture.closes(), 1);
  }
});

test('probe rejects incomplete, oversized, malformed and BYE greetings', async () => {
  for (const [chunks, code] of [
    [['* OK'], 'incomplete_greeting'],
    [['* OK synthetic\r'], 'incomplete_greeting'],
    [['* OK ' + 'a'.repeat(4091)], 'too_large'],
    [['* OK ' + 'a'.repeat(4092)], 'too_large'],
    [['* OK synthetic\n'], 'invalid_greeting'],
    [['* OK\r\n'], 'invalid_greeting'],
    [['not IMAP\r\n'], 'invalid_greeting'],
    [['* BYE synthetic\r\n'], 'server_rejected'],
  ] as const) {
    const fixture = connection([...chunks]);
    assert.deepEqual(await runImapProbe(() => fixture.socket), { ok: false, stage: 'greeting', code });
    assert.equal(fixture.closes(), 1);
  }
});

// Drain the promise/stream continuations after advancing a virtual timer or sending a chunk.
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('probe uses one 8-second deadline even if chunks arrive every 7 seconds', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closes = 0;
  const socket: ProbeConnection = {
    opened: Promise.resolve(), closed: Promise.resolve(),
    readable: new ReadableStream({ start(value) { controller = value; } }),
    async close() { closes++; },
  };
  const result = runImapProbe(() => socket);
  await settle();
  t.mock.timers.tick(7000);
  controller.enqueue(encoder.encode('* O'));
  await settle();
  t.mock.timers.tick(1000);
  assert.deepEqual(await result, { ok: false, stage: 'connect_or_read', code: 'timeout' });
  assert.equal(closes, 1);
});

test('connect time consumes the same deadline; a hanging shutdown cannot delay timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let open!: () => void;
  const opened = new Promise<void>((resolve) => { open = resolve; });
  const socket = connection([], opened).socket;
  socket.readable = new ReadableStream();
  socket.close = () => new Promise(() => {});
  const result = runImapProbe(() => socket);
  t.mock.timers.tick(6000);
  open();
  await settle();
  t.mock.timers.tick(2000);
  assert.deepEqual(await result, { ok: false, stage: 'connect_or_read', code: 'timeout' });
});

test('probe reports connection failures without leaking raw error data', async () => {
  assert.deepEqual(await runImapProbe(() => { throw new Error('private socket metadata'); }),
    { ok: false, stage: 'connect_or_read', code: 'connection_failed' });
  const fixture = connection([], Promise.reject(new Error('private TLS metadata')));
  fixture.socket.closed = Promise.reject(new Error('private close metadata'));
  assert.deepEqual(await runImapProbe(() => fixture.socket),
    { ok: false, stage: 'connect_or_read', code: 'connection_failed' });
  assert.equal(fixture.closes(), 1);
});
