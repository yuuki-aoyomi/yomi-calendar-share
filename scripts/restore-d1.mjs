#!/usr/bin/env node
// 安全のため、復元先は明示されたローカルD1のみ。--remoteは受け付けません。
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const usage = 'Usage: node scripts/restore-d1.mjs <backup.json> [--apply --database <local-db-name>]';
const args = process.argv.slice(2);
const fail = (message) => { console.error(message); process.exit(1); };
if (args.length < 1 || args.includes('--remote') || args.includes('--help')) {
  if (args.includes('--help')) { console.log(usage); process.exit(0); }
  fail(usage + '\nRemote restore is intentionally unsupported.');
}
const file = args[0];
const apply = args.includes('--apply');
const dbIndex = args.indexOf('--database');
const database = dbIndex >= 0 ? args[dbIndex + 1] : undefined;
if (args.some((a, i) => i !== 0 && a !== '--apply' && a !== '--database' && i !== dbIndex + 1)) fail(usage);
if (dbIndex >= 0 && (!database || database.startsWith('--'))) fail('Database name is missing');
if (apply && !database) fail('--apply requires --database');
if (!apply && database) fail('--database is only valid with --apply');

let backup;
try { backup = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { fail('Cannot read backup JSON: ' + e.message); }
if (!backup || backup.format !== 'yomi-calendar-d1-backup' || backup.version !== 1 ||
  typeof backup.createdAt !== 'string' || !Array.isArray(backup.rows) ||
  !Number.isSafeInteger(backup.rowCount) || backup.rowCount !== backup.rows.length) fail('Invalid backup format/count');

const ids = new Set();
for (const row of backup.rows) {
  if (!row || ['calendar_id', 'snapshot_json', 'created_at', 'updated_at'].some((k) => typeof row[k] !== 'string' || !row[k])) fail('Invalid row fields');
  if (ids.has(row.calendar_id)) fail('Duplicate calendar ID: ' + row.calendar_id);
  ids.add(row.calendar_id);
  let snapshot;
  try { snapshot = JSON.parse(row.snapshot_json); } catch { fail('Invalid snapshot JSON: ' + row.calendar_id); }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) fail('Invalid snapshot object: ' + row.calendar_id);
}
console.log('Validated backup:', backup.createdAt, 'rows:', backup.rowCount);
if (!apply) { console.log('Dry run only. No database was changed.'); process.exit(0); }
if (backup.rowCount === 0) { console.log('Empty backup: nothing to restore.'); process.exit(0); }
if (!/^[a-zA-Z0-9_-]+$/.test(database)) fail('Invalid local database name');
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
const sql = [
  'BEGIN TRANSACTION;',
  ...backup.rows.map((row) => `INSERT INTO calendar_snapshots (calendar_id, snapshot_json, created_at, updated_at) VALUES (${quote(row.calendar_id)}, ${quote(row.snapshot_json)}, ${quote(row.created_at)}, ${quote(row.updated_at)}) ON CONFLICT(calendar_id) DO UPDATE SET snapshot_json = excluded.snapshot_json, created_at = excluded.created_at, updated_at = excluded.updated_at;`),
  'COMMIT;',
].join('\n');
const dir = mkdtempSync(join(tmpdir(), 'yomi-d1-restore-'));
try {
  const sqlFile = join(dir, 'restore.sql');
  writeFileSync(sqlFile, sql, { mode: 0o600 });
  const result = spawnSync('npx', ['--no-install', 'wrangler', 'd1', 'execute', database, '--local', '--file', sqlFile], { stdio: 'inherit' });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail('Local restore failed; check Wrangler output');
  console.log('Local restore completed. Verify rows in the target database.');
} finally { rmSync(dir, { recursive: true, force: true }); }
