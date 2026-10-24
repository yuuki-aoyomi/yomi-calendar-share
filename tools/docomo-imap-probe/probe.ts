export type ProbeResult = { ok: boolean; stage: string; code?: string };
export type ProbeConnection = {
  opened: Promise<unknown>;
  closed: Promise<unknown>;
  readable: ReadableStream<Uint8Array>;
  close(): Promise<unknown>;
};

const MAX_GREETING_BYTES = 4096;
const TIMEOUT_MS = 8000;

/** Only checks a complete IMAP greeting. Does not send credentials or commands. */
export async function runImapProbe(connect: () => ProbeConnection): Promise<ProbeResult> {
  let socket: ProbeConnection | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // One deadline covers connection establishment and every read together.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
    });
    socket = connect();
    // Connection failures also reject this promise, even when opened/read already failed.
    void socket.closed.catch(() => {});
    const connection = socket;
    return await Promise.race([deadline, (async (): Promise<ProbeResult> => {
      await connection.opened;
      reader = connection.readable.getReader();
      const decoder = new TextDecoder();
      let greeting = '';
      let total = 0;
      while (total < MAX_GREETING_BYTES) {
        const chunk = await reader.read();
        if (chunk.done) return { ok: false, stage: 'greeting', code: 'incomplete_greeting' };
        total += chunk.value.byteLength;
        if (total > MAX_GREETING_BYTES) return { ok: false, stage: 'greeting', code: 'too_large' };
        greeting += decoder.decode(chunk.value, { stream: true });
        const end = greeting.indexOf('\n');
        if (end < 0) continue;
        if (end === 0 || greeting[end - 1] !== '\r')
          return { ok: false, stage: 'greeting', code: 'invalid_greeting' };
        const line = greeting.slice(0, end - 1);
        // Require a complete response line; raw server text is never returned.
        if (/^\* (OK|PREAUTH) [^\r\n]+$/i.test(line)) return { ok: true, stage: 'imap_greeting' };
        return { ok: false, stage: 'greeting', code: /^\* BYE /i.test(line) ? 'server_rejected' : 'invalid_greeting' };
      }
      return { ok: false, stage: 'greeting', code: 'too_large' };
    })()]);
  } catch (error) {
    return { ok: false, stage: 'connect_or_read', code: error instanceof Error && error.message === 'timeout' ? 'timeout' : 'connection_failed' };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    // Shutdown must not extend the probe deadline if an underlying close hangs.
    if (reader) void reader.cancel().catch(() => {});
    try { if (socket) void socket.close().catch(() => {}); } catch { /* ignore shutdown failure */ }
  }
}
