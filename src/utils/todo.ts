import type { CalendarEvent } from '../types/calendar';

export type TodoPeriod = 'overdue' | 'today' | 'upcoming';
export type TodoView = 'highlighted' | 'pending' | 'completed' | 'all';

export const getTodosForView = (events: CalendarEvent[], view: TodoView = 'highlighted'): CalendarEvent[] =>
  events.filter((event) => {
    if (event.category !== 'todo') return false;
    if (view === 'all') return true;
    if (view === 'completed') return Boolean(event.done);
    return !event.done && (view === 'pending' || event.highlightTodo !== false);
  }).sort((a, b) => a.date.localeCompare(b.date)
    || (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
    || a.createdAt.localeCompare(b.createdAt)
    || a.id.localeCompare(b.id));

// Every stored task appears once, including tasks with highlighting disabled.
export const getPendingTodos = (events: CalendarEvent[]): CalendarEvent[] =>
  getTodosForView(events, 'pending');

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
