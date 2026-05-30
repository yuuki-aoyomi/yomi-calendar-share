import { appConfig } from '../config/appConfig';
import type { CalendarDataSnapshot } from '../repositories/calendarRepository';

type CalendarSnapshotPayload = {
  calendarId: string;
  snapshot: CalendarDataSnapshot;
};

type ImageUploadPayload = {
  key: string;
  publicUrl: string;
  size: number;
  contentType: string;
};

const apiUrl = (path: string) => `${appConfig.apiBaseUrl}${path}`;

export const shouldUseRemoteApi = () => appConfig.runtimeTarget === 'cloudflare' || appConfig.apiBaseUrl.length > 0;

export const loadCalendarSnapshot = async (calendarId: string): Promise<CalendarDataSnapshot> => {
  const response = await fetch(apiUrl(`/api/calendar/${encodeURIComponent(calendarId)}`));

  if (!response.ok) {
    throw new Error('カレンダーデータの読み込みに失敗しました。');
  }

  const payload = (await response.json()) as CalendarSnapshotPayload;
  return payload.snapshot;
};

export const saveCalendarSnapshot = async (
  calendarId: string,
  snapshot: CalendarDataSnapshot,
  writeToken: string,
): Promise<void> => {
  const response = await fetch(apiUrl(`/api/calendar/${encodeURIComponent(calendarId)}`), {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${writeToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ snapshot }),
  });

  if (!response.ok) {
    throw new Error('カレンダーデータの保存に失敗しました。');
  }
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
    throw new Error('画像アップロードに失敗しました。');
  }

  return (await response.json()) as ImageUploadPayload;
};
