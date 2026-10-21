import type { AppBackupData } from '../types/calendar';
import { assertReferenceIntegrity } from './referenceIntegrity';
import { validateCalendarSnapshot } from './validateCalendarSnapshot';

export const createBackupData = (data: AppBackupData['data']): AppBackupData => ({
  app: 'yomi-calendar-share',
  version: 1,
  exportedAt: new Date().toISOString(),
  data,
});

export const downloadBackupFile = (backup: AppBackupData) => {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = `yomi-calendar-share-backup-${backup.exportedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const readBackupFile = async (file: File): Promise<AppBackupData> => {
  const text = await file.text();
  const parsed = JSON.parse(text) as AppBackupData | null;

  if (!parsed || parsed.app !== 'yomi-calendar-share' || parsed.version !== 1 || typeof parsed.exportedAt !== 'string') {
    throw new Error('対応していないバックアップファイルです。');
  }

  const data = validateCalendarSnapshot(parsed.data);

  assertReferenceIntegrity(data);

  return {
    app: parsed.app,
    version: parsed.version,
    exportedAt: parsed.exportedAt,
    data,
  };
};
