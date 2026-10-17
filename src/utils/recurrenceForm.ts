import type { CalendarEvent } from '../types/calendar';

export const getRecurrenceInterval = (event?: CalendarEvent): number => {
  const interval = event?.recurrence?.interval;
  return Number.isInteger(interval) && (interval ?? 0) > 0 ? interval as number : 1;
};

export const normalizeRecurrenceInterval = (value: number): number =>
  Number.isInteger(value) && value > 0 ? value : 1;
