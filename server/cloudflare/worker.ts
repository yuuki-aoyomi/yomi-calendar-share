import type { CalendarDataSnapshot } from '../../src/repositories/calendarRepository';
import { defaultCalendarSnapshot, parseCalendarSnapshot } from '../core/calendarSnapshot';
import { json, jsonError } from '../core/http';

type Env = {
  DB: D1Database;
  IMAGES: R2Bucket;
  ASSETS: Fetcher;
};

type CalendarSnapshotRow = {
  snapshot_json: string;
};

type ImageUploadResponse = {
  key: string;
  publicUrl: string;
  size: number;
  contentType: string;
};

// Cloudflare専用のentrypointです。アプリ本体のHTTP契約はserver/core側へ逃がします。
export default {
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
    const row = await env.DB.prepare(
      'SELECT snapshot_json FROM calendar_snapshots WHERE calendar_id = ?',
    )
      .bind(calendarId)
      .first<CalendarSnapshotRow>();

    if (!row) {
      return json({ calendarId, snapshot: defaultCalendarSnapshot });
    }

    return json({ calendarId, snapshot: parseCalendarSnapshot(row.snapshot_json) });
  }

  if (request.method === 'PUT') {
    const body = await request.json<{ snapshot?: CalendarDataSnapshot }>().catch(() => undefined);

    if (!body?.snapshot) {
      return jsonError('bad_request', 'snapshot is required.', 400);
    }

    await env.DB.prepare(
      `
        INSERT INTO calendar_snapshots (calendar_id, snapshot_json, created_at, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(calendar_id) DO UPDATE SET
          snapshot_json = excluded.snapshot_json,
          updated_at = CURRENT_TIMESTAMP
      `,
    )
      .bind(calendarId, JSON.stringify(body.snapshot))
      .run();

    return json({ ok: true });
  }

  return jsonError('method_not_allowed', 'Unsupported calendar method.', 405);
}

async function handleImageUpload(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();
  const file = formData.get('file');
  const calendarId = String(formData.get('calendarId') ?? 'default').trim();
  const date = String(formData.get('date') ?? 'unknown-date').trim();
  const photoId = String(formData.get('photoId') ?? crypto.randomUUID()).trim();

  if (!(file instanceof File)) {
    return jsonError('bad_request', 'file is required.', 400);
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

  const key = decodeURIComponent(url.pathname.replace('/api/images/', ''));
  const object = await env.IMAGES.get(key);

  if (!object) {
    return jsonError('not_found', 'Image not found.', 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');

  return new Response(object.body, { headers });
}

function getImageExtension(contentType: string, fileName: string): string {
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/gif') return 'gif';
  if (contentType === 'image/jpeg') return 'jpg';

  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension && /^[a-z0-9]+$/.test(extension) ? extension : 'bin';
}
