import { appConfig } from '../config/appConfig';
import type { CalendarDataSnapshot } from '../repositories/calendarRepository';
import { mergeCalendarSnapshots } from '../utils/calendarSync';
import type { RemoteSaveResult } from '../utils/remoteSave';

type CalendarSnapshotPayload = {
  calendarId: string;
  snapshot: CalendarDataSnapshot;
  version: number;
};

type CalendarSavePayload = {
  ok: true;
  version: number;
};

type CalendarConflictPayload = {
  error?: {
    code?: string;
    message?: string;
  };
  calendarId: string;
  snapshot: CalendarDataSnapshot;
  version: number;
};

type ImageUploadPayload = {
  key: string;
  publicUrl: string;
  size: number;
  contentType: string;
};

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
};

type RemoteCalendarState = {
  calendarId: string;
  version: number;
  snapshot: CalendarDataSnapshot;
};

export type RemoteCalendarUpdate = {
  changed: boolean;
  calendarId: string;
  version: number;
  snapshot: CalendarDataSnapshot;
};

let remoteCalendarState: RemoteCalendarState | undefined;
let reloadRequired = false;

const apiUrl = (path: string) => `${appConfig.apiBaseUrl}${path}`;

const getResponseErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = (await response.json().catch(() => undefined)) as ApiErrorPayload | undefined;
    const message = payload?.error?.message ?? payload?.message;
    const code = payload?.error?.code;

    if (message) {
      return code ? `${message} (${code}, HTTP ${response.status})` : `${message} (HTTP ${response.status})`;
    }
  }

  const text = await response.text().catch(() => '');
  const detail = text.trim().slice(0, 160);

  return detail ? `${fallback} ${detail} (HTTP ${response.status})` : `${fallback} (HTTP ${response.status})`;
};

export const shouldUseRemoteApi = () => {
  if (appConfig.runtimeTarget === 'cloudflare' || appConfig.apiBaseUrl.length > 0) return true;
  if (appConfig.runtimeTarget === 'local') return false;
  if (typeof window === 'undefined') return false;

  const { hostname, protocol } = window.location;
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

  return protocol === 'https:' && !isLocalHost;
};

const fetchCalendarSnapshot = async (
  calendarId: string,
  writeToken: string,
): Promise<CalendarSnapshotPayload> => {
  const response = await fetch(apiUrl(`/api/calendar/${encodeURIComponent(calendarId)}`), {
    headers: {
      authorization: `Bearer ${writeToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('カレンダーデータの読み込みに失敗しました。');
  }

  return (await response.json()) as CalendarSnapshotPayload;
};

export const adoptCalendarSnapshot = (
  calendarId: string,
  snapshot: CalendarDataSnapshot,
  version: number,
) => {
  remoteCalendarState = { calendarId, snapshot, version };
  reloadRequired = false;
};

export const loadCalendarSnapshot = async (calendarId: string, writeToken: string): Promise<CalendarDataSnapshot> => {
  const payload = await fetchCalendarSnapshot(calendarId, writeToken);
  adoptCalendarSnapshot(calendarId, payload.snapshot, payload.version);
  return payload.snapshot;
};

export const checkCalendarSnapshotUpdate = async (
  calendarId: string,
  writeToken: string,
): Promise<RemoteCalendarUpdate> => {
  const payload = await fetchCalendarSnapshot(calendarId, writeToken);
  const currentVersion = remoteCalendarState?.calendarId === calendarId
    ? remoteCalendarState.version
    : undefined;

  return {
    changed: currentVersion === undefined || payload.version > currentVersion,
    calendarId: payload.calendarId,
    version: payload.version,
    snapshot: payload.snapshot,
  };
};

const putCalendarSnapshot = async (
  calendarId: string,
  snapshot: CalendarDataSnapshot,
  writeToken: string,
  expectedVersion: number,
): Promise<Response> => fetch(apiUrl(`/api/calendar/${encodeURIComponent(calendarId)}`), {
  method: 'PUT',
  headers: {
    authorization: `Bearer ${writeToken}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ snapshot, expectedVersion }),
});

const showReloadAlert = (message: string) => {
  if (typeof window !== 'undefined') {
    window.alert(message);
  }
};

export const saveCalendarSnapshot = async (
  calendarId: string,
  snapshot: CalendarDataSnapshot,
  writeToken: string,
): Promise<RemoteSaveResult> => {
  if (reloadRequired) return 'reload-required';

  const baseState = remoteCalendarState?.calendarId === calendarId ? remoteCalendarState : undefined;
  const expectedVersion = baseState?.version ?? 0;
  const response = await putCalendarSnapshot(calendarId, snapshot, writeToken, expectedVersion);

  if (response.ok) {
    const payload = (await response.json()) as CalendarSavePayload;
    remoteCalendarState = { calendarId, version: payload.version, snapshot };
    return 'saved';
  }

  if (response.status !== 409 || !baseState) {
    throw new Error('カレンダーデータの保存に失敗しました。');
  }

  const conflict = (await response.json()) as CalendarConflictPayload;
  const merged = mergeCalendarSnapshots(baseState.snapshot, snapshot, conflict.snapshot);

  if (merged.conflicts.length > 0) {
    reloadRequired = true;
    const hasDeleteConflict = merged.conflicts.some((item) => item.kind === 'delete_vs_edit');
    showReloadAlert(
      hasDeleteConflict
        ? '他の端末との更新競合を検知しました。削除と編集が衝突しているため自動解決できません。データを保護するため、このタブからの保存を停止しました。画面を再読み込みして最新状態を確認してください。'
        : '他の端末との更新競合を検知しました。同じデータが両方で編集されているため自動解決できません。データを保護するため、このタブからの保存を停止しました。画面を再読み込みして最新状態を確認してください。',
    );
    return 'reload-required';
  }

  const retryResponse = await putCalendarSnapshot(
    calendarId,
    merged.snapshot,
    writeToken,
    conflict.version,
  );

  if (!retryResponse.ok) {
    reloadRequired = true;
    showReloadAlert('同期中にさらに別の更新が行われました。データを保護するため、このタブからの保存を停止しました。画面を再読み込みしてください。');
    return 'reload-required';
  }

  const retryPayload = (await retryResponse.json()) as CalendarSavePayload;
  remoteCalendarState = {
    calendarId,
    version: retryPayload.version,
    snapshot: merged.snapshot,
  };
  reloadRequired = true;
  showReloadAlert('他の端末の更新を自動的に差分マージしました。最新の内容を画面へ反映するため、このタブからの保存を停止しています。再読み込みしてください。');
  return 'reload-required';
};

export const uploadDailyPhoto = async ({
  calendarId,
  date,
  photoId,
  file,
  writeToken,
}: {
  calendarId: string;
  date: string;
  photoId: string;
  file: File | Blob;
  writeToken: string;
}): Promise<ImageUploadPayload> => {
  const formData = new FormData();

  formData.set('calendarId', calendarId);
  formData.set('date', date);
  formData.set('photoId', photoId);
  formData.set('file', file);

  const response = await fetch(apiUrl('/api/images'), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${writeToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await getResponseErrorMessage(response, '画像アップロードに失敗しました。'));
  }

  return (await response.json()) as ImageUploadPayload;
};

export const withReadToken = (url: string, writeToken: string) => {
  if (!shouldUseRemoteApi() || !url.startsWith('/api/images/') || !writeToken.trim()) return url;

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(writeToken)}`;
};
