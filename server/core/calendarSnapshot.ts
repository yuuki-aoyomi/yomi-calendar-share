import type { CalendarDataSnapshot } from '../../src/repositories/calendarRepository';
import { SnapshotValidationError, validateCalendarSnapshot } from '../../src/utils/validateCalendarSnapshot';

export class StoredSnapshotError extends Error {
  constructor() {
    super('Stored calendar snapshot is invalid.');
  }
}

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
    const parsed: unknown = JSON.parse(snapshotJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new StoredSnapshotError();
    }
    // Keep the previous read compatibility for omitted collections, but never
    // turn an explicitly invalid collection/item into an empty calendar.
    return validateCalendarSnapshot({
      ...defaultCalendarSnapshot,
      ...parsed,
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof SnapshotValidationError) {
      throw new StoredSnapshotError();
    }
    throw error;
  }
};
