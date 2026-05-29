import type {
  CalendarEvent,
  CalendarTag,
  CreditCardSetting,
  DailyPhoto,
  LoveLog,
  MoneyRecord,
  PartTimeJob,
} from '../types/calendar';

export type CalendarDataSnapshot = {
  events: CalendarEvent[];
  moneyRecords: MoneyRecord[];
  loveLogs: LoveLog[];
  tags: CalendarTag[];
  partTimeJobs: PartTimeJob[];
  creditCards: CreditCardSetting[];
  dailyPhotos: DailyPhoto[];
};

export type CalendarRepository = {
  loadSnapshot(calendarId: string): Promise<CalendarDataSnapshot>;
  saveSnapshot(calendarId: string, snapshot: CalendarDataSnapshot): Promise<void>;
};
