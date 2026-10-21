import type { CalendarDataSnapshot } from '../repositories/calendarRepository';

type Check = (value: unknown) => boolean;
type Schema = Record<string, Check>;

export class SnapshotValidationError extends Error {}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text: Check = (value) => typeof value === 'string';
const id: Check = (value) => typeof value === 'string' && value.trim().length > 0;
const bool: Check = (value) => typeof value === 'boolean';
const finite: Check = (value) => typeof value === 'number' && Number.isFinite(value);
const nonNegative: Check = (value) => finite(value) && (value as number) >= 0;
const integer = (min: number, max = Number.MAX_SAFE_INTEGER): Check =>
  (value) => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
const optional = (check: Check): Check => (value) => value === undefined || check(value);
const oneOf = (...values: string[]): Check => (value) => typeof value === 'string' && values.includes(value);
const arrayOf = (check: Check): Check => (value) => Array.isArray(value) && value.every(check);
const date: Check = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const time: Check = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const matches = (schema: Schema): Check => (value) =>
  record(value) && Object.entries(schema).every(([field, check]) => check(value[field]));
const common: Schema = { id, createdAt: text, updatedAt: text };
const named: Schema = { ...common, name: text };
const recurrence = matches({
  frequency: oneOf('daily', 'weekly', 'monthly'), interval: integer(1),
  until: optional(date), weekdays: optional(arrayOf(integer(0, 6))),
});
const imageMeta = matches({
  fileName: text, originalSize: nonNegative, compressedSize: nonNegative,
  width: nonNegative, height: nonNegative, mimeType: text,
  resized: optional(bool), compressed: optional(bool),
});
const timelineItem = matches({ id, time, title: text });
const schemas: Record<keyof CalendarDataSnapshot, Schema> = {
  events: {
    ...common, date, title: text, category: oneOf('schedule', 'diary', 'todo', 'detail', 'photo'),
    endDate: optional(date), startTime: optional(time), endTime: optional(time),
    breakMinutes: optional(integer(0)), sortOrder: optional(finite), memo: optional(text),
    tagIds: optional(arrayOf(id)), tags: optional(arrayOf(text)), timelineItems: optional(arrayOf(timelineItem)),
    recurrence: optional(recurrence), done: optional(bool), highlightTodo: optional(bool),
  },
  moneyRecords: {
    ...common, date, type: oneOf('income', 'expense'), amount: nonNegative, category: text,
    incomeSource: optional(oneOf('part-time', 'other')), partTimeJobId: optional(text),
    memo: optional(text), isCreditCard: optional(bool), creditCardId: optional(text),
  },
  loveLogs: { ...common, date, title: text, memo: optional(text), heartCount: integer(0, 10) },
  tags: { ...named, type: oneOf('person', 'work', 'credit-card', 'custom'), color: text, birthday: optional(date) },
  partTimeJobs: {
    ...named, tagId: id, hourlyWage: optional(nonNegative), lateNightHourlyWage: optional(nonNegative),
    closingDay: optional(integer(1, 31)), paymentDay: optional(integer(1, 31)),
  },
  creditCards: { ...named, tagId: id, closingDay: integer(1, 31), paymentDay: integer(1, 31) },
  subscriptions: {
    ...named, amount: nonNegative, billingCycle: optional(oneOf('monthly', 'yearly')),
    billingMonth: optional(integer(1, 12)), billingDay: integer(1, 31), creditCardId: optional(text),
    category: text, memo: optional(text), isActive: bool,
  },
  dailyPhotos: { ...common, date, imageUrl: text, imageKey: optional(text), memo: optional(text), imageMeta: optional(imageMeta) },
};

const validateItem = (value: unknown, schema: Schema, path: string): Record<string, unknown> => {
  if (!record(value)) throw new SnapshotValidationError(`${path}: オブジェクトが必要です。`);
  for (const [field, check] of Object.entries(schema)) {
    if (!check(value[field])) throw new SnapshotValidationError(`${path}.${field}: 値の形式が正しくありません。`);
  }
  return value;
};

/** Validate input before replacing any live data; only known legacy omissions are normalized. */
export const validateCalendarSnapshot = (value: unknown): CalendarDataSnapshot => {
  if (!record(value)) throw new SnapshotValidationError('snapshot: オブジェクトが必要です。');
  const collections: Record<string, Record<string, unknown>[]> = {};
  for (const [name, schema] of Object.entries(schemas)) {
    const incoming = value[name] === undefined && (name === 'subscriptions' || name === 'dailyPhotos') ? [] : value[name];
    if (!Array.isArray(incoming)) throw new SnapshotValidationError(`${name}: 配列が必要です。`);
    const ids = new Set<string>();
    collections[name] = incoming.map((item, index) => {
      const checked = validateItem(item, schema, `${name}[${index}]`);
      const itemId = checked.id as string; // Checked by common.id above.
      if (ids.has(itemId)) throw new SnapshotValidationError(`${name}[${index}].id: IDが重複しています。`);
      ids.add(itemId);
      if (name === 'events' && Array.isArray(checked.timelineItems)) {
        const timelineIds = checked.timelineItems.map((entry: { id: string }) => entry.id);
        if (new Set(timelineIds).size !== timelineIds.length) {
          throw new SnapshotValidationError(`${name}[${index}].timelineItems: IDが重複しています。`);
        }
      }
      return name === 'events'
        ? { ...checked, tagIds: checked.tagIds ?? [], tags: checked.tags ?? [], timelineItems: checked.timelineItems ?? [] }
        : { ...checked };
    });
  }
  // All eight collections and their fields have been checked. Preserve unknown
  // fields for forward compatibility instead of silently discarding them.
  return { ...value, ...collections } as CalendarDataSnapshot;
};
