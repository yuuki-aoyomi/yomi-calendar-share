import type {
  AppBackupData,
  CalendarEvent,
  CalendarTag,
  CreditCardSetting,
  DailyPhoto,
  LoveLog,
  MoneyRecord,
  PartTimeJob,
} from '../types/calendar';

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
  const parsed = JSON.parse(text) as AppBackupData;

  if (parsed.app !== 'yomi-calendar-share' || parsed.version !== 1) {
    throw new Error('対応していないバックアップファイルです。');
  }

  return {
    app: parsed.app,
    version: parsed.version,
    exportedAt: parsed.exportedAt,
    data: {
      events: normalizeArray<CalendarEvent>(parsed.data.events),
      moneyRecords: normalizeArray<MoneyRecord>(parsed.data.moneyRecords),
      loveLogs: normalizeArray<LoveLog>(parsed.data.loveLogs),
      tags: normalizeArray<CalendarTag>(parsed.data.tags),
      partTimeJobs: normalizeArray<PartTimeJob>(parsed.data.partTimeJobs),
      creditCards: normalizeArray<CreditCardSetting>(parsed.data.creditCards),
      dailyPhotos: normalizeArray<DailyPhoto>(parsed.data.dailyPhotos),
    },
  };
};

const normalizeArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
