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

const weekdayForDate = (dateKey: string): number => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

const timeBucket = (time?: string): number | undefined => {
  if (!time) return undefined;
  const hour = Number(time.split(':')[0]);
  if (!Number.isFinite(hour)) return undefined;
  if (hour < 6) return 0;
  if (hour < 12) return 1;
  if (hour < 17) return 2;
  if (hour < 22) return 3;
  return 4;
};

const normalizeTitle = (title: string): string => title.trim().toLocaleLowerCase('ja-JP');

export type EventSuggestionContext = {
  title?: string;
  startTime?: string;
  tagIds?: string[];
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

export const scoreEventSuggestion = (
  event: CalendarEvent,
  targetDate: string,
  context: EventSuggestionContext,
  usageCount: number,
): number => {
  let score = 0;
  const query = normalizeTitle(context.title ?? '');
  const eventTitle = normalizeTitle(event.title);

  if (query) {
    if (eventTitle === query) score += 1000;
    else if (eventTitle.startsWith(query)) score += 700;
    else if (eventTitle.includes(query)) score += 500;
    else return Number.NEGATIVE_INFINITY;
  }

  if (weekdayForDate(event.date) === weekdayForDate(targetDate)) score += 100;

  const desiredBucket = timeBucket(context.startTime);
  const eventBucket = timeBucket(event.startTime);
  if (desiredBucket !== undefined && eventBucket === desiredBucket) score += 60;

  const selectedTags = new Set(context.tagIds ?? []);
  const matchingTags = (event.tagIds ?? []).filter((id) => selectedTags.has(id)).length;
  score += matchingTags * 40;

  score += Math.min(Math.max(usageCount - 1, 0), 5) * 20;
  return score;
};

export const rankEventTemplateCandidates = (
  events: CalendarEvent[],
  targetDate: string,
  tags: CalendarTag[],
  context: EventSuggestionContext = {},
): CalendarEvent[] => {
  const usageCounts = new Map<string, number>();
  events.forEach((event) => {
    const key = normalizeTitle(event.title);
    usageCounts.set(key, (usageCounts.get(key) ?? 0) + 1);
  });

  const ranked = events
    .map((event) => ({
      event,
      titleKey: normalizeTitle(event.title),
      score: scoreEventSuggestion(event, targetDate, context, usageCounts.get(normalizeTitle(event.title)) ?? 1),
      recency: event.updatedAt || event.createdAt,
    }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score || b.recency.localeCompare(a.recency));

  const seenTitles = new Set<string>();
  const candidates: CalendarEvent[] = [];
  for (const item of ranked) {
    if (seenTitles.has(item.titleKey)) continue;
    seenTitles.add(item.titleKey);
    candidates.push(buildEventTemplate(item.event, targetDate, tags));
  }

  return candidates;
};

export const buildEventTemplateCandidates = (
  events: CalendarEvent[],
  targetDate: string,
  tags: CalendarTag[],
): CalendarEvent[] => rankEventTemplateCandidates(events, targetDate, tags);
