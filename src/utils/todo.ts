import type { CalendarEvent } from '../types/calendar';

export const getHighlightedPendingTodos = (
  events: CalendarEvent[],
  todayKey: string,
): CalendarEvent[] =>
  events
    .filter(
      (event) =>
        event.category === 'todo' &&
        !event.done &&
        event.highlightTodo !== false &&
        event.date <= todayKey,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
