# Docomo IMAP connectivity probe (isolated)

This is **not** a mail importer. It checks only whether a Cloudflare Worker can
negotiate implicit TLS to `imap.spmode.ne.jp:993` and receive the server's IMAP
greeting. It does **not** authenticate, access inbox contents, or persist data.

Docomo's official IMAP settings for non-iOS clients: hostname
`imap.spmode.ne.jp`, port `993`, TLS 1.2+.

## Manual test (not run automatically)

1. Create a strong random `PROBE_TOKEN` in a local ignored `.dev.vars`
   file under this directory. Do **not** commit it.
2. Run `npx wrangler dev --config tools/docomo-imap-probe/wrangler.toml --remote`
   from the repository root (verify the prompt does not deploy your production
   `yomi-calendar-share` Worker).
3. POST to `/probe` with `Authorization: Bearer <PROBE_TOKEN>`.
   Only an `ok`, `stage`, and coarse error `code` are returned.
4. Stop the session afterward. No mailbox password is required.

The test must run on Cloudflare infrastructure. Local-only Wrangler simulations
may not reproduce egress restrictions or TLS negotiation.

## Limitations
- A successful greeting does **not** prove credentials, mailbox permissions,
  rate limits, reliability of periodic polling, or billing feasibility.
- Never put a d-account ID, IMAP dedicated password, mailbox content or
  card details in this probe or its logs.
- This folder does not change production worker bindings/routes/triggers.
- Keep `PROBE_TOKEN` outside git; use Workers secrets for any future deployed
  credentialed service.
