import { connect } from 'cloudflare:sockets';
import { runImapProbe } from './probe';

type Env = { PROBE_TOKEN: string };
const HOST = 'imap.spmode.ne.jp';
const PORT = 993;

export function probeImapGreeting() {
  return runImapProbe(() => connect({ hostname: HOST, port: PORT },
    { secureTransport: 'on', allowHalfOpen: false }));
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
