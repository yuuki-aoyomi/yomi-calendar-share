import type { CalendarEvent, MoneyRecord } from '../types/calendar';

export type CalendarSearchFilters = {
  query?: string;
  tagIds?: string[];
  categories?: CalendarEvent['category'][];
  todoDone?: boolean;
  dateFrom?: string;
  dateTo?: string;
  moneyType?: MoneyRecord['type'];
  creditCardId?: string;
  minAmount?: number;
  maxAmount?: number;
};

export type CalendarSearchResult =
  | { kind: 'event'; id: string; date: string; title: string; event: CalendarEvent }
  | { kind: 'money'; id: string; date: string; title: string; record: MoneyRecord };

const normalizeText = (value: string): string => value.trim().toLocaleLowerCase('ja-JP');

const includesQuery = (values: Array<string | undefined>, query: string): boolean => {
  if (!query) return true;
  return values.some((value) => normalizeText(value ?? '').includes(query));
};

const inDateRange = (date: string, from?: string, to?: string): boolean => {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
};

export const searchCalendarData = (
  events: CalendarEvent[],
  moneyRecords: MoneyRecord[],
  filters: CalendarSearchFilters,
): CalendarSearchResult[] => {
  const query = normalizeText(filters.query ?? '');
  const selectedTags = new Set(filters.tagIds ?? []);
  const categories = new Set(filters.categories ?? []);

  const eventResults: CalendarSearchResult[] = events
    .filter((event) => inDateRange(event.date, filters.dateFrom, filters.dateTo))
    .filter((event) => includesQuery([event.title, event.memo, ...(event.tags ?? [])], query))
    .filter((event) => selectedTags.size === 0 || (event.tagIds ?? []).some((id) => selectedTags.has(id)))
    .filter((event) => categories.size === 0 || categories.has(event.category))
    .filter((event) => {
      if (filters.todoDone === undefined) return true;
      return event.category === 'todo' && Boolean(event.done) === filters.todoDone;
    })
    .map((event) => ({
      kind: 'event' as const,
      id: event.id,
      date: event.date,
      title: event.title,
      event,
    }));

  const moneyResults: CalendarSearchResult[] = moneyRecords
    .filter((record) => inDateRange(record.date, filters.dateFrom, filters.dateTo))
    .filter((record) => includesQuery([record.category, record.memo], query))
    .filter((record) => !filters.moneyType || record.type === filters.moneyType)
    .filter((record) => !filters.creditCardId || record.creditCardId === filters.creditCardId)
    .filter((record) => filters.minAmount === undefined || record.amount >= filters.minAmount)
    .filter((record) => filters.maxAmount === undefined || record.amount <= filters.maxAmount)
    .map((record) => ({
      kind: 'money' as const,
      id: record.id,
      date: record.date,
      title: record.category,
      record,
    }));

  return [...eventResults, ...moneyResults].sort(
    (a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title, 'ja'),
  );
};
