import type { CalendarDataSnapshot } from '../../src/repositories/calendarRepository';
import { defaultCalendarSnapshot, parseCalendarSnapshot } from '../core/calendarSnapshot';
import { json, jsonError } from '../core/http';
import { createCalendarBackup, type BackupRow } from '../core/calendarBackup';

type Env = {
  DB: D1Database;
  IMAGES: R2Bucket;
  BACKUPS: R2Bucket;
  ASSETS: Fetcher;
  WRITE_TOKEN: string;
};

type CalendarSnapshotRow = {
  snapshot_json: string;
  version: number;
};

type ImageUploadResponse = {
  key: string;
  publicUrl: string;
  size: number;
  contentType: string;
};

type CloudflareCacheStorage = CacheStorage & {
  default: Cache;
};

const maxSnapshotBytes = 1_000_000;
const maxImageBytes = 2 * 1024 * 1024;

// Cloudflare専用のentrypointです。アプリ本体のHTTP契約はserver/core側へ逃がします。
export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(backupCalendarSnapshots(env));
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/calendar/')) {
      return handleCalendarRequest(request, env, url);
    }

    if (url.pathname === '/api/images' && request.method === 'POST') {
      return handleImageUpload(request, env);
    }

    if (url.pathname.startsWith('/api/images/')) {
      return handleImageRead(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleCalendarRequest(request: Request, env: Env, url: URL): Promise<Response> {
  const calendarId = decodeURIComponent(url.pathname.replace('/api/calendar/', '')).trim();

  if (!calendarId) {
    return jsonError('bad_request', 'calendarId is required.', 400);
  }

  if (request.method === 'GET') {
    const unauthorizedResponse = requireWriteToken(request, env);

    if (unauthorizedResponse) return unauthorizedResponse;

    const row = await env.DB.prepare(
      'SELECT snapshot_json, version FROM calendar_snapshots WHERE calendar_id = ?',
    )
      .bind(calendarId)
      .first<CalendarSnapshotRow>();

    if (!row) {
      return json({ calendarId, snapshot: defaultCalendarSnapshot, version: 0 });
    }

    return json({
      calendarId,
      snapshot: parseCalendarSnapshot(row.snapshot_json),
      version: row.version,
    });
  }

  if (request.method === 'PUT') {
    const unauthorizedResponse = requireWriteToken(request, env);

    if (unauthorizedResponse) return unauthorizedResponse;

    const body = await request.json<{
      snapshot?: CalendarDataSnapshot;
      expectedVersion?: number;
    }>().catch(() => undefined);

    if (!body?.snapshot) {
      return jsonError('bad_request', 'snapshot is required.', 400);
    }

    if (!Number.isInteger(body.expectedVersion) || (body.expectedVersion ?? -1) < 0) {
      return jsonError('bad_request', 'expectedVersion must be a non-negative integer.', 400);
    }

    const expectedVersion = body.expectedVersion as number;
    const snapshotJson = JSON.stringify(body.snapshot);

    if (new TextEncoder().encode(snapshotJson).length > maxSnapshotBytes) {
      return jsonError('payload_too_large', 'snapshot is too large.', 413);
    }

    if (expectedVersion === 0) {
      const result = await env.DB.prepare(
        `
          INSERT OR IGNORE INTO calendar_snapshots
            (calendar_id, snapshot_json, version, created_at, updated_at)
          VALUES (?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
      )
        .bind(calendarId, snapshotJson)
        .run();

      if ((result.meta.changes ?? 0) > 0) {
        return json({ ok: true as const, version: 1 });
      }
    } else {
      const result = await env.DB.prepare(
        `
          UPDATE calendar_snapshots
          SET snapshot_json = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
          WHERE calendar_id = ? AND version = ?
        `,
      )
        .bind(snapshotJson, calendarId, expectedVersion)
        .run();

      if ((result.meta.changes ?? 0) > 0) {
        return json({ ok: true as const, version: expectedVersion + 1 });
      }
    }

    const current = await env.DB.prepare(
      'SELECT snapshot_json, version FROM calendar_snapshots WHERE calendar_id = ?',
    )
      .bind(calendarId)
      .first<CalendarSnapshotRow>();

    return json({
      ok: false as const,
      error: {
        code: 'version_conflict',
        message: 'Calendar data was updated by another client.',
      },
      calendarId,
      snapshot: current ? parseCalendarSnapshot(current.snapshot_json) : defaultCalendarSnapshot,
      version: current?.version ?? 0,
    }, 409);
  }

  return jsonError('method_not_allowed', 'Unsupported calendar method.', 405);
}

async function handleImageUpload(request: Request, env: Env): Promise<Response> {
  const unauthorizedResponse = requireWriteToken(request, env);

  if (unauthorizedResponse) return unauthorizedResponse;

  const formData = await request.formData();
  const file = formData.get('file');
  const calendarId = String(formData.get('calendarId') ?? 'default').trim();
  const date = String(formData.get('date') ?? 'unknown-date').trim();
  const photoId = String(formData.get('photoId') ?? crypto.randomUUID()).trim();

  if (!(file instanceof File)) {
    return jsonError('bad_request', 'file is required.', 400);
  }

  if (file.size > maxImageBytes) {
    return jsonError('payload_too_large', 'image is larger than 2MB after compression.', 413);
  }

  const extension = getImageExtension(file.type, file.name);
  const key = `daily-images/optimized/${calendarId}/${date}/${photoId}.${extension}`;

  await env.IMAGES.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
    },
  });

  return json<ImageUploadResponse>({
    key,
    publicUrl: `/api/images/${key}`,
    size: file.size,
    contentType: file.type || 'application/octet-stream',
  });
}

async function handleImageRead(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonError('method_not_allowed', 'Unsupported image method.', 405);
  }

  const cache = (caches as CloudflareCacheStorage).default;
  const unauthorizedResponse = requireWriteToken(request, env);

  if (unauthorizedResponse) return unauthorizedResponse;

  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const key = decodeURIComponent(url.pathname.replace('/api/images/', ''));
  const object = await env.IMAGES.get(key);

  if (!object) {
    return jsonError('not_found', 'Image not found.', 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');

  const response = new Response(object.body, { headers });

  await cache.put(request, response.clone());

  return response;
}

function getImageExtension(contentType: string, fileName: string): string {
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/gif') return 'gif';
  if (contentType === 'image/jpeg') return 'jpg';

  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension && /^[a-z0-9]+$/.test(extension) ? extension : 'bin';
}

function requireWriteToken(request: Request, env: Env): Response | undefined {
  if (!env.WRITE_TOKEN) {
    return jsonError('server_misconfigured', 'WRITE_TOKEN is not configured.', 500);
  }

  const authorization = request.headers.get('authorization') ?? '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
  const headerToken = request.headers.get('x-write-token')?.trim() ?? '';
  const queryToken = new URL(request.url).searchParams.get('token')?.trim() ?? '';

  if (bearerToken === env.WRITE_TOKEN || headerToken === env.WRITE_TOKEN || queryToken === env.WRITE_TOKEN) {
    return undefined;
  }

  return jsonError('unauthorized', 'Write token is invalid.', 401);
}

async function backupCalendarSnapshots(env: Env): Promise<void> {
  const rows: BackupRow[] = [];
  let offset = 0;
  const pageSize = 100;
  for (;;) {
    const result = await env.DB.prepare(
      'SELECT calendar_id, snapshot_json, created_at, updated_at FROM calendar_snapshots ORDER BY calendar_id LIMIT ? OFFSET ?',
    ).bind(pageSize, offset).all<BackupRow>();
    const page = result.results ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += page.length;
  }
  const createdAt = new Date().toISOString();
  const backup = createCalendarBackup(rows, createdAt);
  const dateKey = createdAt.slice(0, 10);
  const objectKey = `d1-calendar-snapshots/${dateKey}/${createdAt.replace(/[:.]/g, '-')}.json`;
  await env.BACKUPS.put(objectKey, JSON.stringify(backup), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { version: '1', rowCount: String(rows.length) },
  });
  console.log(`D1 backup saved: ${objectKey} (${rows.length} rows)`);
}
