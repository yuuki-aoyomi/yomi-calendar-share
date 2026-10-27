import { useEffect, useMemo, useState } from 'react';
import type { CalendarEvent, CalendarTag } from '../types/calendar';
import { toDateKey } from '../utils/date';
import { getTodosForView, getTodoDeadlineLabel, getTodoPeriod, type TodoPeriod, type TodoView } from '../utils/todo';

const periods: { key: TodoPeriod; label: string }[] = [
  { key: 'overdue', label: '過去' },
  { key: 'today', label: '今日' },
  { key: 'upcoming', label: '今後' },
];
const views: { key: TodoView; label: string }[] = [
  { key: 'highlighted', label: '未完了・強調表示あり' },
  { key: 'pending', label: '未完了すべて' },
  { key: 'completed', label: '完了済み' },
  { key: 'all', label: 'すべてのToDo' },
];

type Props = {
  events: CalendarEvent[];
  tags: CalendarTag[];
  onToggleTodo: (id: string, done: boolean) => void;
  onHighlightChange: (id: string, highlightTodo: boolean) => void;
  onEdit: (event: CalendarEvent) => void;
};

export function PendingTodoPanel({ events, tags, onToggleTodo, onHighlightChange, onEdit }: Props) {
  const [today, setToday] = useState(() => toDateKey(new Date()));
  const [view, setView] = useState<TodoView>('highlighted');
  const [filter, setFilter] = useState<'all' | TodoPeriod>('all');
  const todosByView = useMemo(() => Object.fromEntries(
    views.map(({ key }) => [key, getTodosForView(events, key)]),
  ) as Record<TodoView, CalendarEvent[]>, [events]);
  const todos = todosByView[view];
  const visibleTodos = todos.filter((todo) => filter === 'all' || getTodoPeriod(todo.date, today) === filter);
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
        <h3 id="pending-todos-heading">ToDo管理 <span>{visibleTodos.length}件</span></h3>
        <p>通常は未完了・強調表示ありのみ表示します。強調を外したToDoも削除せず、表示対象を切り替えて確認できます。</p>
      </div>
      <label className="todo-view-selector">
        表示対象
        <select value={view} onChange={(event) => {
          setView(event.target.value as TodoView);
          setFilter('all');
        }}>
          {views.map(({ key, label }) => <option key={key} value={key}>{label}（{todosByView[key].length}件）</option>)}
        </select>
      </label>
      <div className="pending-todos-filters" role="group" aria-label="ToDoの期限日で絞り込み">
        {[{ key: 'all' as const, label: '全期間' }, ...periods].map(({ key, label }) => (
          <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label} {key === 'all' ? todos.length : todos.filter((todo) => getTodoPeriod(todo.date, today) === key).length}
          </button>
        ))}
      </div>
      <div className="pending-todos-list" tabIndex={0} role="region" aria-label="ToDo管理一覧">
        {periods.filter(({ key }) => filter === 'all' || filter === key).map(({ key, label }) => {
          const items = todos.filter((todo) => getTodoPeriod(todo.date, today) === key);
          if (!items.length) return null;
          return (
            <div key={key} className="pending-todos-group">
              <h4>期限日：{label} <span>{items.length}件</span></h4>
              <ul>
                {items.map((todo) => (
                  <li key={todo.id} className={todo.done ? 'pending-todo-done'
                    : todo.highlightTodo !== false && key !== 'upcoming' ? `pending-todo-${key}` : undefined}>
                    <input type="checkbox" checked={Boolean(todo.done)} onChange={(event) => onToggleTodo(todo.id, event.target.checked)}
                      aria-label={`${todo.title}${todo.recurrence ? '（繰り返し全体）' : ''}を${todo.done ? '未完了に戻す' : '完了にする'}`} />
                    <div className="pending-todo-content">
                      <button type="button" className="pending-todo-detail" onClick={() => onEdit(todo)}
                        aria-label={`${todo.title}を編集`}>
                        <strong>{todo.title}</strong>
                        <span className="pending-todo-deadline"><time dateTime={todo.date}>{todo.date}</time> · {todo.done ? '完了済み' : getTodoDeadlineLabel(todo.date, today)}</span>
                        {(todo.tags.length > 0 || todo.tagIds.length > 0) && (
                          <span className="pending-todo-tags">{[...new Set([
                            ...todo.tagIds.map((id) => tags.find((tag) => tag.id === id)?.name).filter(Boolean),
                            ...todo.tags,
                          ])].join(' / ')}</span>
                        )}
                        {todo.recurrence && <span className="pending-todo-tags">繰り返し · 登録日を表示（完了は全体に適用）</span>}
                      </button>
                      <label className="todo-highlight-toggle">
                        <input type="checkbox" checked={todo.highlightTodo !== false}
                          onChange={(event) => onHighlightChange(todo.id, event.target.checked)}
                          aria-label={`${todo.title}の強調表示`} />
                        強調表示
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {visibleTodos.length === 0 && (
          <p className="pending-todos-empty">{view === 'highlighted'
            ? '条件に合うToDoはありません。強調なしのToDoは「未完了すべて」で確認できます。'
            : '条件に合うToDoはありません。表示対象や期間を切り替えて確認できます。'}</p>
        )}
      </div>
    </section>
  );
}
