import type { CalendarDataSnapshot } from '../../src/repositories/calendarRepository';
import { defaultCalendarSnapshot, parseCalendarSnapshot } from '../core/calendarSnapshot';
import { json, jsonError } from '../core/http';
import { createCalendarBackup, type BackupRow } from '../core/calendarBackup';
import {
  createImageBackupManifest,
  getImageBackupKey,
  getImageBackupManifestKey,
  getImageBackupPrefix,
  type ImageBackupManifestEntry,
} from '../core/imageBackup';
import {
  collectReferencedImageKeys,
  managedImagePrefix,
  selectConfirmedOrphans,
  summarizeImageStorage,
  type ImageObjectInfo,
} from '../core/imageStorageGc';

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

type CalendarVersionRow = {
  version: number;
};

type CalendarHistoryRow = {
  snapshot_json: string;
  version: number;
  operation: string;
  restored_from_version: number | null;
  created_at: string;
};
type CalendarHistoryMetadataRow = Omit<CalendarHistoryRow, 'snapshot_json'>;

type SnapshotJsonRow = {
  snapshot_json: string;
};

type ImageUploadResponse = {
  key: string;
  publicUrl: string;
  size: number;
  contentType: string;
};

const maxSnapshotBytes = 1_000_000;
const maxImageBytes = 2 * 1024 * 1024;
const maxHistoryEntries = 50;
const maxGcKeysPerRequest = 100;
const imageSourcePrefix = 'daily-images/optimized/';

// Cloudflare専用のentrypointです。アプリ本体のHTTP契約はserver/core側へ逃がします。
export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(backupCalendarSnapshots(env));
    ctx.waitUntil(backupDailyImages(env));
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/calendar-history/')) {
      return handleCalendarHistoryRequest(request, env, url);
    }

    if (url.pathname.startsWith('/api/calendar/')) {
      return handleCalendarRequest(request, env, url);
    }

    if (url.pathname === '/api/admin/image-backups' && request.method === 'GET') {
      return handleImageBackupList(request, env, url);
    }

    if (url.pathname === '/api/admin/image-restore' && request.method === 'POST') {
      return handleImageRestore(request, env);
    }

    if (url.pathname === '/api/admin/image-storage' && request.method === 'GET') {
      return handleImageStorageSummary(request, env);
    }

    if (url.pathname === '/api/admin/image-gc' && request.method === 'POST') {
      return handleImageGc(request, env);
    }

    if (url.pathname === '/api/image-session' && request.method === 'POST') {
      return handleImageSession(request, env);
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

    if (url.searchParams.get('versionOnly') === '1') {
      const versionRow = await env.DB.prepare(
        'SELECT version FROM calendar_snapshots WHERE calendar_id = ?',
      )
        .bind(calendarId)
        .first<CalendarVersionRow>();

      return json({ calendarId, version: versionRow?.version ?? 0 });
    }

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
          SET snapshot_json = ?, version = version + 1, restored_from_version = NULL, updated_at = CURRENT_TIMESTAMP
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

async function handleCalendarHistoryRequest(request: Request, env: Env, url: URL): Promise<Response> {
  const unauthorizedResponse = requireWriteToken(request, env);
  if (unauthorizedResponse) return unauthorizedResponse;

  const calendarId = decodeURIComponent(url.pathname.replace('/api/calendar-history/', '')).trim();
  if (!calendarId) {
    return jsonError('bad_request', 'calendarId is required.', 400);
  }

  if (request.method === 'GET') {
    const versionParam = url.searchParams.get('version');

    if (versionParam !== null) {
      const version = Number(versionParam);
      if (!Number.isInteger(version) || version < 1) {
        return jsonError('bad_request', 'version must be a positive integer.', 400);
      }

      const row = await env.DB.prepare(
        `
          SELECT snapshot_json, version, operation, restored_from_version, created_at
          FROM calendar_snapshot_history
          WHERE calendar_id = ? AND version = ?
        `,
      )
        .bind(calendarId, version)
        .first<CalendarHistoryRow>();

      if (!row) return jsonError('not_found', 'Calendar history version not found.', 404);

      return json({
        calendarId,
        version: row.version,
        operation: row.operation,
        restoredFromVersion: row.restored_from_version,
        createdAt: row.created_at,
        snapshot: parseCalendarSnapshot(row.snapshot_json),
      });
    }

    const result = await env.DB.prepare(
      `
        SELECT version, operation, restored_from_version, created_at
        FROM calendar_snapshot_history
        WHERE calendar_id = ?
        ORDER BY version DESC
        LIMIT ?
      `,
    )
      .bind(calendarId, maxHistoryEntries)
      .all<CalendarHistoryMetadataRow>();

    return json({
      calendarId,
      entries: (result.results ?? []).map((row) => ({
        version: row.version,
        operation: row.operation,
        restoredFromVersion: row.restored_from_version,
        createdAt: row.created_at,
      })),
    });
  }

  if (request.method === 'POST') {
    const body = await request.json<{ version?: number; expectedVersion?: number }>().catch(() => undefined);
    if (!Number.isInteger(body?.version) || (body?.version ?? 0) < 1) {
      return jsonError('bad_request', 'version must be a positive integer.', 400);
    }
    if (!Number.isInteger(body?.expectedVersion) || (body?.expectedVersion ?? -1) < 1) {
      return jsonError('bad_request', 'expectedVersion must be a positive integer.', 400);
    }

    const restoreVersion = body?.version as number;
    const expectedVersion = body?.expectedVersion as number;
    const source = await env.DB.prepare(
      `
        SELECT snapshot_json, version, operation, restored_from_version, created_at
        FROM calendar_snapshot_history
        WHERE calendar_id = ? AND version = ?
      `,
    )
      .bind(calendarId, restoreVersion)
      .first<CalendarHistoryRow>();

    if (!source) return jsonError('not_found', 'Calendar history version not found.', 404);

    const result = await env.DB.prepare(
      `
        UPDATE calendar_snapshots
        SET snapshot_json = ?, version = version + 1, restored_from_version = ?, updated_at = CURRENT_TIMESTAMP
        WHERE calendar_id = ? AND version = ?
      `,
    )
      .bind(source.snapshot_json, restoreVersion, calendarId, expectedVersion)
      .run();

    if ((result.meta.changes ?? 0) === 0) {
      const current = await env.DB.prepare(
        'SELECT version FROM calendar_snapshots WHERE calendar_id = ?',
      )
        .bind(calendarId)
        .first<CalendarVersionRow>();

      return json({
        ok: false as const,
        error: {
          code: 'version_conflict',
          message: 'Calendar data was updated before the restore completed.',
        },
        calendarId,
        version: current?.version ?? 0,
      }, 409);
    }

    const newVersion = expectedVersion + 1;
    return json({ ok: true as const, calendarId, version: newVersion, restoredFromVersion: restoreVersion });
  }

  return jsonError('method_not_allowed', 'Unsupported calendar history method.', 405);
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

// Image-only session cookies have no write privileges and never enter image URLs.
const imageSessionLifetimeSeconds = 60 * 60;
const imageSessionCookie = 'yomi_image_read';

async function imageSessionSignature(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function handleImageSession(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return jsonError('method_not_allowed', 'Unsupported method.', 405);
  const unauthorized = requireWriteToken(request, env);
  if (unauthorized) return unauthorized;
  const body = await request.json<{ calendarId?: string }>().catch(() => undefined);
  const calendarId = body?.calendarId?.trim();
  if (!calendarId || calendarId.includes('/') || calendarId.length > 128) {
    return jsonError('bad_request', 'Invalid calendarId.', 400);
  }
  const expiry = Math.floor(Date.now() / 1000) + imageSessionLifetimeSeconds;
  const payload = `${encodeURIComponent(calendarId)}.${expiry}`;
  const signature = await imageSessionSignature(payload, env.WRITE_TOKEN);
  const response = json({ ok: true, expiresAt: expiry });
  response.headers.set('Set-Cookie',
    `${imageSessionCookie}=${payload}.${signature}; Path=/api/images/; HttpOnly; Secure; SameSite=Strict; Max-Age=${imageSessionLifetimeSeconds}`);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

async function authorizeImageRead(request: Request, env: Env, key: string): Promise<boolean> {
  if (!env.WRITE_TOKEN) return false;
  const cookieValue = (request.headers.get('cookie') ?? '').split(';')
    .map((part) => part.trim()).find((part) => part.startsWith(`${imageSessionCookie}=`))
    ?.slice(imageSessionCookie.length + 1);
  if (!cookieValue) return false;
  const parts = cookieValue.split('.');
  if (parts.length !== 3 || !/^\d+$/.test(parts[1]) || !/^[0-9a-f]{64}$/.test(parts[2])) return false;
  const expiry = Number(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expiry) || expiry <= now || expiry > now + imageSessionLifetimeSeconds) return false;
  let calendarId: string;
  try { calendarId = decodeURIComponent(parts[0]); }
  catch { return false; }
  if (!key.startsWith(`daily-images/optimized/${calendarId}/`)) return false;
  const expected = await imageSessionSignature(`${parts[0]}.${parts[1]}`, env.WRITE_TOKEN);
  // Compare the full digest without short-circuiting on the first mismatching character.
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ parts[2].charCodeAt(i);
  return diff === 0;
}

async function handleImageRead(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== 'GET') return jsonError('method_not_allowed', 'Unsupported image method.', 405);
  let key: string;
  try { key = decodeURIComponent(url.pathname.replace('/api/images/', '')); }
  catch { return jsonError('bad_request', 'Invalid image key.', 400); }
  if (!await authorizeImageRead(request, env, key)) {
    const response = jsonError('unauthorized', 'Image read session is missing or expired.', 401);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
  const object = await env.IMAGES.get(key);
  if (!object) return jsonError('not_found', 'Image not found.', 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'private, no-store');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(object.body, { headers });
}

async function handleImageBackupList(request: Request, env: Env, url: URL): Promise<Response> {
  const unauthorizedResponse = requireWriteToken(request, env);
  if (unauthorizedResponse) return unauthorizedResponse;

  const imageKey = url.searchParams.get('imageKey')?.trim() ?? '';
  if (!imageKey.startsWith(imageSourcePrefix)) {
    return jsonError('bad_request', 'A valid imageKey is required.', 400);
  }

  const versions = await listAllBackupObjects(env.BACKUPS, getImageBackupPrefix(imageKey));
  versions.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime());

  return json({
    imageKey,
    versions: versions.map((object) => ({
      backupKey: object.key,
      size: object.size,
      uploadedAt: object.uploaded.toISOString(),
    })),
  });
}

async function handleImageRestore(request: Request, env: Env): Promise<Response> {
  const unauthorizedResponse = requireWriteToken(request, env);
  if (unauthorizedResponse) return unauthorizedResponse;

  const body = await request.json<{ imageKey?: string; backupKey?: string }>().catch(() => undefined);
  const imageKey = body?.imageKey?.trim() ?? '';
  if (!imageKey.startsWith(imageSourcePrefix)) {
    return jsonError('bad_request', 'A valid imageKey is required.', 400);
  }

  const backupPrefix = getImageBackupPrefix(imageKey);
  let backupKey = body?.backupKey?.trim() ?? '';

  if (backupKey && !backupKey.startsWith(backupPrefix)) {
    return jsonError('bad_request', 'backupKey does not belong to imageKey.', 400);
  }

  if (!backupKey) {
    const versions = await listAllBackupObjects(env.BACKUPS, backupPrefix);
    versions.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime());
    backupKey = versions[0]?.key ?? '';
  }

  if (!backupKey) {
    return jsonError('not_found', 'No backup exists for this image.', 404);
  }

  const backup = await env.BACKUPS.get(backupKey);
  if (!backup) {
    return jsonError('not_found', 'Backup object not found.', 404);
  }

  await env.IMAGES.put(imageKey, backup.body, {
    httpMetadata: backup.httpMetadata,
    customMetadata: {
      restoredFrom: backupKey,
      restoredAt: new Date().toISOString(),
    },
  });

  return json({ ok: true as const, imageKey, backupKey });
}

async function handleImageStorageSummary(request: Request, env: Env): Promise<Response> {
  const unauthorizedResponse = requireWriteToken(request, env);
  if (unauthorizedResponse) return unauthorizedResponse;

  const snapshots = await loadAllCalendarSnapshots(env);
  const referencedKeys = collectReferencedImageKeys(snapshots);
  const objects = await listAllManagedImages(env.IMAGES);
  const summary = summarizeImageStorage(objects, referencedKeys);
  const existingKeys = new Set(objects.map((object) => object.key));

  return json({
    ...summary,
    missingReferencedKeys: [...referencedKeys].filter((key) => !existingKeys.has(key)).sort(),
  });
}

async function handleImageGc(request: Request, env: Env): Promise<Response> {
  const unauthorizedResponse = requireWriteToken(request, env);
  if (unauthorizedResponse) return unauthorizedResponse;

  const body = await request.json<{ keys?: string[]; confirm?: string }>().catch(() => undefined);
  const requestedKeys = body?.keys ?? [];

  if (body?.confirm !== 'DELETE_ORPHANS') {
    return jsonError('confirmation_required', 'confirm must be DELETE_ORPHANS.', 400);
  }
  if (!Array.isArray(requestedKeys) || requestedKeys.length === 0) {
    return jsonError('bad_request', 'At least one image key is required.', 400);
  }
  if (requestedKeys.length > maxGcKeysPerRequest) {
    return jsonError('bad_request', `A maximum of ${maxGcKeysPerRequest} keys can be deleted at once.`, 400);
  }

  const snapshots = await loadAllCalendarSnapshots(env);
  const referencedKeys = collectReferencedImageKeys(snapshots);
  const objects = await listAllManagedImages(env.IMAGES);
  const deletableKeys = selectConfirmedOrphans(requestedKeys, objects, referencedKeys);

  for (const key of deletableKeys) {
    await env.IMAGES.delete(key);
  }

  const deleted = new Set(deletableKeys);
  return json({
    requestedCount: requestedKeys.length,
    deletedCount: deletableKeys.length,
    deletedKeys: deletableKeys,
    skippedKeys: [...new Set(requestedKeys)].filter((key) => !deleted.has(key)).sort(),
  });
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

  if (bearerToken === env.WRITE_TOKEN || headerToken === env.WRITE_TOKEN) {
    return undefined;
  }

  return jsonError('unauthorized', 'Write token is invalid.', 401);
}

async function loadAllCalendarSnapshots(env: Env): Promise<CalendarDataSnapshot[]> {
  const snapshots: CalendarDataSnapshot[] = [];
  let offset = 0;
  const pageSize = 100;

  for (;;) {
    const result = await env.DB.prepare(
      'SELECT snapshot_json FROM calendar_snapshots ORDER BY calendar_id LIMIT ? OFFSET ?',
    ).bind(pageSize, offset).all<SnapshotJsonRow>();
    const page = result.results ?? [];
    snapshots.push(...page.map((row) => parseCalendarSnapshot(row.snapshot_json)));
    if (page.length < pageSize) break;
    offset += page.length;
  }

  return snapshots;
}

async function listAllManagedImages(bucket: R2Bucket): Promise<ImageObjectInfo[]> {
  const objects: ImageObjectInfo[] = [];
  let cursor: string | undefined;

  do {
    const page = await bucket.list({ prefix: managedImagePrefix, cursor, limit: 1000 });
    objects.push(...page.objects.map((object) => ({ key: object.key, size: object.size })));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return objects;
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

async function backupDailyImages(env: Env): Promise<void> {
  const createdAt = new Date().toISOString();
  const entries: ImageBackupManifestEntry[] = [];
  let cursor: string | undefined;
  let copiedCount = 0;

  do {
    const page = await env.IMAGES.list({ prefix: imageSourcePrefix, cursor, limit: 1000 });

    for (const object of page.objects) {
      const backupKey = getImageBackupKey(object.key, object.etag);
      const existing = await env.BACKUPS.head(backupKey);

      if (!existing) {
        const source = await env.IMAGES.get(object.key);
        if (!source) continue;

        await env.BACKUPS.put(backupKey, source.body, {
          httpMetadata: source.httpMetadata,
          customMetadata: {
            sourceKey: object.key,
            sourceEtag: object.etag,
            sourceUploadedAt: object.uploaded.toISOString(),
            backedUpAt: createdAt,
          },
        });
        copiedCount += 1;
      }

      entries.push({
        sourceKey: object.key,
        sourceEtag: object.etag,
        sourceUploadedAt: object.uploaded.toISOString(),
        backupKey,
        size: object.size,
      });
    }

    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const manifest = createImageBackupManifest(entries, createdAt);
  const manifestKey = getImageBackupManifestKey(createdAt);
  await env.BACKUPS.put(manifestKey, JSON.stringify(manifest), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: {
      version: '1',
      imageCount: String(entries.length),
      copiedCount: String(copiedCount),
    },
  });

  console.log(`R2 image backup saved: ${manifestKey} (${copiedCount} copied / ${entries.length} current)`);
}

async function listAllBackupObjects(bucket: R2Bucket, prefix: string): Promise<R2Object[]> {
  const objects: R2Object[] = [];
  let cursor: string | undefined;

  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return objects;
}
