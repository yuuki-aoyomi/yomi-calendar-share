import test from 'node:test';
import assert from 'node:assert/strict';

// The probe's network handshake requires Cloudflare remote runtime.
// These local contract tests intentionally avoid importing cloudflare:sockets.
test('IMAP probe has isolated configuration', async () => {
  const { readFileSync } = await import('node:fs');
  const config = readFileSync('tools/docomo-imap-probe/wrangler.toml', 'utf8');
  assert.match(config, /main = ".\/worker.ts"/);
  assert.doesNotMatch(config, /\[triggers\]|\[\[d1_databases\]\]/);
});
