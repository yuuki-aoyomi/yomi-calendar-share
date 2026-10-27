import type { CalendarEvent } from '../types/calendar';

export type TodoPeriod = 'overdue' | 'today' | 'upcoming';

// Every stored task appears once, including tasks with highlighting disabled.
export const getPendingTodos = (events: CalendarEvent[]): CalendarEvent[] =>
  events.filter((event) => event.category === 'todo' && !event.done)
    .sort((a, b) => a.date.localeCompare(b.date)
      || (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
      || a.createdAt.localeCompare(b.createdAt)
      || a.id.localeCompare(b.id));

export const getTodoPeriod = (date: string, today: string): TodoPeriod =>
  date < today ? 'overdue' : date === today ? 'today' : 'upcoming';

export const getTodoDeadlineLabel = (date: string, today: string): string => {
  const asUtc = (key: string) => {
    const [year, month, day] = key.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  const days = Math.round((asUtc(date) - asUtc(today)) / 86_400_000);
  return days < 0 ? `${-days}日超過` : days === 0 ? '今日が期限' : `あと${days}日`;
};

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
