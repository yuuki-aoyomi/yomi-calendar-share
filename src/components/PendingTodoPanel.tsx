import { useEffect, useMemo, useState } from 'react';
import type { CalendarEvent, CalendarTag } from '../types/calendar';
import { toDateKey } from '../utils/date';
import { getPendingTodos, getTodoDeadlineLabel, getTodoPeriod, type TodoPeriod } from '../utils/todo';

const periods: { key: TodoPeriod; label: string }[] = [
  { key: 'overdue', label: '期限切れ' },
  { key: 'today', label: '今日' },
  { key: 'upcoming', label: '今後' },
];

type Props = {
  events: CalendarEvent[];
  tags: CalendarTag[];
  onComplete: (id: string) => void;
  onEdit: (event: CalendarEvent) => void;
};

export function PendingTodoPanel({ events, tags, onComplete, onEdit }: Props) {
  const [today, setToday] = useState(() => toDateKey(new Date()));
  const [filter, setFilter] = useState<'all' | TodoPeriod>('all');
  const todos = useMemo(() => getPendingTodos(events), [events]);
  // Refresh after midnight and immediately when returning to a suspended tab.
  useEffect(() => {
    const refresh = () => setToday(toDateKey(new Date()));
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return (
    <section className="pending-todos" aria-labelledby="pending-todos-heading">
      <div className="pending-todos-heading">
        <h3 id="pending-todos-heading">未完了ToDo <span>{todos.length}件</span></h3>
        <p>全期間のToDoを期限順に表示しています。</p>
      </div>
      <div className="pending-todos-filters" role="group" aria-label="ToDoの期限で絞り込み">
        {[{ key: 'all' as const, label: 'すべて' }, ...periods].map(({ key, label }) => (
          <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label} {key === 'all' ? todos.length : todos.filter((todo) => getTodoPeriod(todo.date, today) === key).length}
          </button>
        ))}
      </div>
      <div className="pending-todos-list" tabIndex={0} role="region" aria-label="未完了ToDo一覧">
        {periods.filter(({ key }) => filter === 'all' || filter === key).map(({ key, label }) => {
          const items = todos.filter((todo) => getTodoPeriod(todo.date, today) === key);
          if (!items.length) return null;
          return (
            <div key={key} className="pending-todos-group">
              <h4>{label} <span>{items.length}件</span></h4>
              <ul>
                {items.map((todo) => (
                  <li key={todo.id} className={todo.highlightTodo !== false && key !== 'upcoming' ? `pending-todo-${key}` : undefined}>
                    <input type="checkbox" checked={false} onChange={() => onComplete(todo.id)}
                      aria-label={`${todo.title}${todo.recurrence ? '（繰り返し全体）' : ''}を完了にする`} />
                    <button type="button" className="pending-todo-detail" onClick={() => onEdit(todo)}
                      aria-label={`${todo.title}を編集`}>
                      <strong>{todo.title}</strong>
                      <span className="pending-todo-deadline"><time dateTime={todo.date}>{todo.date}</time> · {getTodoDeadlineLabel(todo.date, today)}</span>
                      {(todo.tags.length > 0 || todo.tagIds.length > 0) && (
                        <span className="pending-todo-tags">{[...new Set([
                          ...todo.tagIds.map((id) => tags.find((tag) => tag.id === id)?.name).filter(Boolean),
                          ...todo.tags,
                        ])].join(' / ')}</span>
                      )}
                      {todo.recurrence && <span className="pending-todo-tags">繰り返し · 登録日を表示（完了は全体に適用）</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {!todos.some((todo) => filter === 'all' || getTodoPeriod(todo.date, today) === filter) && (
          <p className="pending-todos-empty">{todos.length === 0 ? '未完了のToDoはありません。' : 'この期間の未完了ToDoはありません。'}</p>
        )}
      </div>
    </section>
  );
}
