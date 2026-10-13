import type { CalendarEvent } from '../types/calendar';

/** A date is highlighted if any occurring event has the selected tag. */
export const matchesHighlightedTag = (
  events: CalendarEvent[],
  selectedTagId: string | undefined,
): boolean => Boolean(selectedTagId && events.some((event) => (event.tagIds ?? []).includes(selectedTagId)));
