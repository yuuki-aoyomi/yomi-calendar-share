import type { CalendarEvent } from '../types/calendar';

const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getLastDayOfMonth = (year: number, monthIndex: number): number =>
  new Date(year, monthIndex + 1, 0).getDate();

const getDaysBetween = (from: Date, to: Date): number => {
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.floor((end - start) / 86_400_000);
};

const addDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const getMonthDiff = (from: Date, to: Date): number =>
  (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());

const isDateInEventRange = (event: CalendarEvent, dateKey: string): boolean => {
  const endDate = event.endDate && event.endDate >= event.date ? event.endDate : event.date;
  return event.date <= dateKey && dateKey <= endDate;
};

const isRecurringStartOnDate = (event: CalendarEvent, dateKey: string): boolean => {
  if (!event.recurrence) return event.date === dateKey;
  const startDate = parseDateKey(event.date);
  const targetDate = parseDateKey(dateKey);
  if (targetDate < startDate) return false;
  if (event.recurrence.until && targetDate > parseDateKey(event.recurrence.until)) return false;

  const interval = Math.max(event.recurrence.interval || 1, 1);

  if (event.recurrence.frequency === 'weekly') {
    const diffDays = getDaysBetween(startDate, targetDate);
    return diffDays % (7 * interval) === 0;
  }

  const monthDiff = getMonthDiff(startDate, targetDate);
  const expectedDay = Math.min(
    startDate.getDate(),
    getLastDayOfMonth(targetDate.getFullYear(), targetDate.getMonth()),
  );

  return monthDiff >= 0 && monthDiff % interval === 0 && targetDate.getDate() === expectedDay;
};

export const eventOccursOnDate = (event: CalendarEvent, dateKey: string): boolean => {
  if (!event.recurrence) return isDateInEventRange(event, dateKey);

  const startDate = parseDateKey(event.date);
  const endDate = event.endDate && event.endDate >= event.date ? parseDateKey(event.endDate) : startDate;
  const durationDays = Math.max(getDaysBetween(startDate, endDate), 0);
  const targetDate = parseDateKey(dateKey);

  return Array.from({ length: durationDays + 1 }, (_, offset) => toDateKey(addDays(targetDate, -offset)))
    .some((candidateStartDateKey) => isRecurringStartOnDate(event, candidateStartDateKey));
};

export const getEventsForDate = (events: CalendarEvent[], dateKey: string): CalendarEvent[] =>
  events.filter((event) => eventOccursOnDate(event, dateKey));

export const getEventOccurrencesForMonth = (events: CalendarEvent[], monthKey: string): CalendarEvent[] => {
  const [year, month] = monthKey.split('-').map(Number);
  const monthIndex = month - 1;
  const daysInMonth = getLastDayOfMonth(year, monthIndex);

  return Array.from({ length: daysInMonth }, (_, index) => toDateKey(new Date(year, monthIndex, index + 1)))
    .flatMap((dateKey) => getEventsForDate(events, dateKey));
};
