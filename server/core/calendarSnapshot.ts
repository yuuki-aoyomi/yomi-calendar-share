import type { CalendarDataSnapshot } from '../../src/repositories/calendarRepository';

export const defaultCalendarSnapshot: CalendarDataSnapshot = {
  events: [],
  moneyRecords: [],
  loveLogs: [],
  tags: [],
  partTimeJobs: [],
  creditCards: [],
  subscriptions: [],
  dailyPhotos: [],
};

export const parseCalendarSnapshot = (snapshotJson: string): CalendarDataSnapshot => {
  try {
    return {
      ...defaultCalendarSnapshot,
      ...(JSON.parse(snapshotJson) as CalendarDataSnapshot),
    };
  } catch {
    return defaultCalendarSnapshot;
  }
};
