import { connect } from 'cloudflare:sockets';

type Env = { PROBE_TOKEN: string };
const HOST = 'imap.spmode.ne.jp';
const PORT = 993;
const MAX_GREETING_BYTES = 4096;
const TIMEOUT_MS = 8000;

/** Connectivity-only probe. Never sends credentials or accesses a mailbox. */
export async function probeImapGreeting(): Promise<{ ok: boolean; stage: string; code?: string }> {
  const socket = connect({ hostname: HOST, port: PORT }, { secureTransport: 'on' });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      socket.opened,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
      }),
    ]);
    if (timer) clearTimeout(timer);
    reader = socket.readable.getReader();
    const decoder = new TextDecoder();
    let greeting = '';
    let total = 0;
    while (!greeting.includes('\n') && total < MAX_GREETING_BYTES) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
        }),
      ]);
      if (timer) clearTimeout(timer);
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_GREETING_BYTES) return { ok: false, stage: 'greeting', code: 'too_large' };
      greeting += decoder.decode(chunk.value, { stream: true });
    }
    // IMAP server greeting must start with "* OK", "* PREAUTH" or "* BYE".
    // Do not return raw server text: it could contain identifying metadata.
    if (/^\* (OK|PREAUTH)\b/i.test(greeting)) return { ok: true, stage: 'imap_greeting' };
    return { ok: false, stage: 'greeting', code: /^\* BYE\b/i.test(greeting) ? 'server_rejected' : 'invalid_greeting' };
  } catch (error) {
    return { ok: false, stage: 'connect_or_read', code: error instanceof Error && error.message === 'timeout' ? 'timeout' : 'connection_failed' };
  } finally {
    if (timer) clearTimeout(timer);
    try { await socket.close(); } catch { /* ignore shutdown failure */ }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== '/probe' || request.method !== 'POST')
      return new Response('Not found', { status: 404 });
    const token = request.headers.get('authorization');
    if (!env.PROBE_TOKEN || token !== `Bearer ${env.PROBE_TOKEN}`)
      return new Response('Unauthorized', { status: 401 });
    const result = await probeImapGreeting();
    return Response.json(result, { status: result.ok ? 200 : 502, headers: { 'cache-control': 'no-store' } });
  },
};
