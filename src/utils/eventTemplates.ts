import type { CalendarEvent, CalendarTag } from '../types/calendar';

const shiftDateByDays = (dateKey: string, days: number): string => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

const dateDistance = (from: string, to: string): number => {
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  return Math.max(0, Math.round((toTime - fromTime) / 86_400_000));
};

/**
 * Past events are used as reusable templates, not copied records.
 * Absolute dates are shifted/cleared and references to deleted tags are removed.
 */
export const buildEventTemplate = (
  source: CalendarEvent,
  targetDate: string,
  tags: CalendarTag[],
): CalendarEvent => {
  const availableTags = new Map(tags.map((tag) => [tag.id, tag]));
  const tagIds = (source.tagIds ?? []).filter((id) => availableTags.has(id));
  const endDate = source.endDate
    ? shiftDateByDays(targetDate, dateDistance(source.date, source.endDate))
    : undefined;

  return {
    ...source,
    date: targetDate,
    endDate,
    tagIds,
    tags: tagIds.map((id) => availableTags.get(id)?.name).filter((name): name is string => Boolean(name)),
    recurrence: source.recurrence
      ? {
          frequency: source.recurrence.frequency,
          interval: source.recurrence.interval,
          weekdays: source.recurrence.weekdays ? [...source.recurrence.weekdays] : undefined,
        }
      : undefined,
    timelineItems: (source.timelineItems ?? []).map((item) => ({ ...item })),
    done: source.category === 'todo' ? false : undefined,
    sortOrder: undefined,
  };
};

export const buildEventTemplateCandidates = (
  events: CalendarEvent[],
  targetDate: string,
  tags: CalendarTag[],
): CalendarEvent[] =>
  [...events]
    .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))
    .map((event) => buildEventTemplate(event, targetDate, tags));
