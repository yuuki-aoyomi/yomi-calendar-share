import { useMemo, useState } from 'react';
import type { CalendarEvent, CalendarTag } from '../types/calendar';
import type { CreditCardPaymentSchedule } from '../utils/creditCard';
import type { SalaryPaymentSchedule } from '../utils/salary';

type EventListProps = {
  selectedDate: string;
  events: CalendarEvent[];
  paymentSchedules: CreditCardPaymentSchedule[];
  salarySchedules: SalaryPaymentSchedule[];
  tags: CalendarTag[];
  onEditEvent: (id: string) => void;
  onAddTodo: (title: string, tagId?: string) => void;
  onReorderEvents: (orderedIds: string[]) => void;
  onToggleTodo: (id: string, done: boolean) => void;
};

const categoryLabels: Record<CalendarEvent['category'], string> = {
  schedule: '予定',
  diary: '日記',
  todo: 'ToDo',
  detail: '詳細',
  photo: '写真',
};

const recurrenceLabels = {
  weekly: '毎週',
  monthly: '毎月',
} as const;

const compareEventStartTime = (a: CalendarEvent, b: CalendarEvent): number => {
  if (a.startTime && !b.startTime) return -1;
  if (!a.startTime && b.startTime) return 1;

  const startTimeDiff = (a.startTime || '').localeCompare(b.startTime || '');
  if (startTimeDiff !== 0) return startTimeDiff;

  return a.createdAt.localeCompare(b.createdAt);
};

// 選択日の予定だけを表示します。ToDo は予定カードより軽いリストとして扱います。
export function EventList({
  selectedDate,
  events,
  paymentSchedules,
  salarySchedules,
  tags,
  onEditEvent,
  onAddTodo,
  onReorderEvents,
  onToggleTodo,
}: EventListProps) {
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const todoEvents = events
    .filter((event) => event.category === 'todo')
    .sort((a, b) => {
      const orderDiff = (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER);
      if (orderDiff !== 0) return orderDiff;
      return a.createdAt.localeCompare(b.createdAt);
    });
  const scheduleEvents = events.filter((event) => event.category !== 'todo').sort(compareEventStartTime);
  const completedTodoCount = todoEvents.filter((event) => event.done).length;
  const todoProgress = todoEvents.length > 0 ? Math.round((completedTodoCount / todoEvents.length) * 100) : 0;

  if (events.length === 0 && paymentSchedules.length === 0 && salarySchedules.length === 0) {
    return (
      <div className="empty-state">
        <h3>{selectedDate}</h3>
        <p>この日の予定はまだありません。</p>
      </div>
    );
  }

  return (
    <div className="list-stack">
      <div className="section-title">
        <h3>{selectedDate} の予定</h3>
        <span>
          {events.length + paymentSchedules.length + salarySchedules.length}件
          {todoEvents.length > 0 && ` / ToDo ${completedTodoCount}/${todoEvents.length}完了`}
        </span>
      </div>
      {(salarySchedules.length > 0 || paymentSchedules.length > 0) && (
        <section className="event-category-section">
          <div className="event-category-heading">
            <h4>自動表示</h4>
            <span>給料日・引き落とし</span>
          </div>
          {salarySchedules.map((schedule) => (
            <article className="item-card salary-event-card" key={schedule.id}>
              <div className="item-main">
                <span className="category-pill salary">給料日</span>
                <h4>{schedule.jobName}</h4>
                <p className="time-text">
                  {schedule.amount > 0 ? `${schedule.amount.toLocaleString()}円` : '金額未設定'}
                </p>
                <p>
                  {Math.floor(schedule.minutes / 60)}時間{schedule.minutes % 60}分 / {schedule.events.length}件
                  {schedule.lateNightMinutes > 0
                    ? ` / 深夜 ${Math.floor(schedule.lateNightMinutes / 60)}時間${schedule.lateNightMinutes % 60}分`
                    : ''}
                  {schedule.breakMinutes > 0 ? ` / 休憩 ${schedule.breakMinutes}分` : ''}
                </p>
              </div>
            </article>
          ))}
          {paymentSchedules.map((schedule) => (
            <article className="item-card payment-event-card" key={schedule.id}>
              <div className="item-main">
                <span className="category-pill payment">クレカ引落</span>
                <h4>{schedule.cardName}</h4>
                <p className="time-text">{schedule.amount.toLocaleString()}円</p>
                <p>{schedule.records.map((record) => record.category).join(' / ')}</p>
              </div>
            </article>
          ))}
        </section>
      )}
      {todoEvents.length > 0 && (
        <section className="event-category-section">
          <div className="event-category-heading">
            <h4>{categoryLabels.todo}</h4>
            <span>{completedTodoCount}/{todoEvents.length}完了 / {todoProgress}%</span>
          </div>
          <div className="todo-progress" aria-label={`ToDo ${completedTodoCount}/${todoEvents.length} 完了`}>
            <div style={{ width: `${todoProgress}%` }} />
          </div>
          <TodoTagGroups
            events={todoEvents}
            tags={tags}
            draggingEventId={draggingEventId}
            onEditEvent={onEditEvent}
            onAddTodo={onAddTodo}
            onDragStart={setDraggingEventId}
            onDragEnd={() => setDraggingEventId(null)}
            onDropEvent={(orderedIds) => {
              onReorderEvents(orderedIds);
              setDraggingEventId(null);
            }}
            onToggleTodo={onToggleTodo}
          />
        </section>
      )}
      {scheduleEvents.map((event) => (
        <EventCard key={event.id} event={event} tags={tags} onEditEvent={onEditEvent} />
      ))}
      {todoEvents.length === 0 && scheduleEvents.length === 0 && (paymentSchedules.length > 0 || salarySchedules.length > 0) && (
        <div className="empty-state">
          <p>手入力の予定はまだありません。</p>
        </div>
      )}
    </div>
  );
}

function TodoTagGroups({
  events,
  tags,
  draggingEventId,
  onEditEvent,
  onAddTodo,
  onDragStart,
  onDragEnd,
  onDropEvent,
  onToggleTodo,
}: {
  events: CalendarEvent[];
  tags: CalendarTag[];
  draggingEventId: string | null;
  onEditEvent: (id: string) => void;
  onAddTodo: (title: string, tagId?: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropEvent: (orderedIds: string[]) => void;
  onToggleTodo: (id: string, done: boolean) => void;
}) {
  const [openGroupKeys, setOpenGroupKeys] = useState<Set<string>>(() => new Set(tags.length === 0 ? ['untagged'] : []));
  const [addingGroupKey, setAddingGroupKey] = useState<string | null>(null);
  const [todoTitle, setTodoTitle] = useState('');
  const todoGroups = useMemo(() => {
    const groups = new Map<string, { tag?: CalendarTag; events: CalendarEvent[] }>();

    tags.forEach((tag) => {
      groups.set(tag.id, { tag, events: [] });
    });

    events.forEach((event) => {
      const eventTagIds = event.tagIds ?? [];
      const groupTagIds = eventTagIds.length > 0 ? eventTagIds : ['untagged'];

      groupTagIds.forEach((tagId) => {
        const tag = tags.find((item) => item.id === tagId);
        const groupKey = tag?.id ?? 'untagged';
        const group = groups.get(groupKey) ?? { tag, events: [] };
        group.events.push(event);
        groups.set(groupKey, group);
      });
    });

    if (tags.length === 0 || events.some((event) => (event.tagIds ?? []).length === 0)) {
      groups.set('untagged', groups.get('untagged') ?? { events: [] });
    }

    return [...groups.entries()]
      .map(([key, group]) => ({
        key,
        tag: group.tag,
        events: group.events,
        doneCount: group.events.filter((event) => event.done).length,
      }))
      .filter((group) => group.events.length > 0);
  }, [events, tags]);

  const handleSubmitTodo = (event: React.FormEvent<HTMLFormElement>, tagId?: string) => {
    event.preventDefault();
    const title = todoTitle.trim();
    if (!title) return;

    onAddTodo(title, tagId);
    setTodoTitle('');
    setAddingGroupKey(null);
  };

  return (
    <div className="todo-group-list">
      {todoGroups.map((group) => (
        <details
          className="todo-tag-group"
          key={group.key}
          open={todoGroups.length === 1 || openGroupKeys.has(group.key)}
          onToggle={(event) => {
            const isOpen = event.currentTarget.open;
            if (!isOpen && addingGroupKey === group.key) {
              setAddingGroupKey(null);
              setTodoTitle('');
            }
            setOpenGroupKeys((current) => {
              const next = new Set(current);
              if (isOpen) {
                next.add(group.key);
              } else {
                next.delete(group.key);
              }
              return next;
            });
          }}
        >
          <summary>
            <span className="todo-group-title">
              {group.tag && <i style={{ background: group.tag.color }} />}
              {group.tag ? `#${group.tag.name}` : '#未分類'}
            </span>
            <span className="todo-group-actions">
              <span>{group.doneCount}/{group.events.length}</span>
              <button
                type="button"
                className="todo-add-button"
                aria-label={`${group.tag ? group.tag.name : '未分類'} のToDoを追加`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setOpenGroupKeys((current) => new Set(current).add(group.key));
                  setAddingGroupKey((current) => current === group.key ? null : group.key);
                  setTodoTitle('');
                }}
              >
                +
              </button>
            </span>
          </summary>
          <div className="todo-list">
            {addingGroupKey === group.key && (
              <form className="todo-create-row" onSubmit={(event) => handleSubmitTodo(event, group.tag?.id)}>
                <input
                  value={todoTitle}
                  onChange={(event) => setTodoTitle(event.target.value)}
                  placeholder="ToDoを追加"
                  autoFocus
                />
                <button type="submit" className="ghost-button">
                  追加
                </button>
              </form>
            )}
            {group.events.map((event) => (
              <TodoListItem
                key={`${group.key}-${event.id}`}
                event={event}
                events={group.events}
                tags={tags}
                draggingEventId={draggingEventId}
                onEditEvent={onEditEvent}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDropEvent={onDropEvent}
                onToggleTodo={onToggleTodo}
              />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function TodoListItem({
  event,
  events,
  tags,
  draggingEventId,
  onEditEvent,
  onDragStart,
  onDragEnd,
  onDropEvent,
  onToggleTodo,
}: {
  event: CalendarEvent;
  events: CalendarEvent[];
  tags: CalendarTag[];
  draggingEventId: string | null;
  onEditEvent: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropEvent: (orderedIds: string[]) => void;
  onToggleTodo: (id: string, done: boolean) => void;
}) {
  return (
    <div
      className={[
        event.done ? 'todo-list-item done' : 'todo-list-item',
        draggingEventId === event.id ? 'dragging' : '',
      ].join(' ')}
      onDragOver={(dragEvent) => {
        if (!draggingEventId || draggingEventId === event.id) return;
        dragEvent.preventDefault();
      }}
      onDrop={(dragEvent) => {
        dragEvent.preventDefault();
        if (!draggingEventId || draggingEventId === event.id) return;
        onDropEvent(moveEventId(events.map((item) => item.id), draggingEventId, event.id));
      }}
    >
      <span
        className="drag-handle"
        role="button"
        aria-label={`${event.title} を並び替え`}
        draggable
        onDragStart={(dragEvent) => {
          dragEvent.dataTransfer.effectAllowed = 'move';
          onDragStart(event.id);
        }}
        onDragEnd={onDragEnd}
      >
        ⠿
      </span>
      <label>
        <input
          type="checkbox"
          checked={Boolean(event.done)}
          onChange={(changeEvent) => onToggleTodo(event.id, changeEvent.target.checked)}
        />
        <span>{event.title}</span>
      </label>
      {(event.tagIds ?? []).length > 0 && (
        <div className="todo-list-tags">
          {(event.tagIds ?? []).map((tagId) => {
            const tag = tags.find((item) => item.id === tagId);
            return (
              <span key={tagId} style={tag ? { color: tag.color } : undefined}>
                #{tag?.name ?? tagId}
              </span>
            );
          })}
        </div>
      )}
      <button type="button" className="ghost-button" onClick={() => onEditEvent(event.id)}>
        編集
      </button>
    </div>
  );
}

function EventCard({
  event,
  tags,
  onEditEvent,
}: {
  event: CalendarEvent;
  tags: CalendarTag[];
  onEditEvent: (id: string) => void;
}) {
  const mainTagColor = (event.tagIds ?? [])
    .map((tagId) => tags.find((item) => item.id === tagId)?.color)
    .find((color): color is string => Boolean(color));

  return (
    <article
      className="item-card"
      style={mainTagColor ? { borderLeftColor: mainTagColor } : undefined}
    >
      <div className="item-main">
        <div className="event-card-labels">
          <span className={`category-pill ${event.category}`}>{categoryLabels[event.category]}</span>
          {event.recurrence && (
            <span className="category-pill recurrence">{recurrenceLabels[event.recurrence.frequency]}</span>
          )}
        </div>
        <h4>{event.title}</h4>
        {(event.startTime || event.endTime) && (
          <p className="time-text">
            {event.startTime || '--:--'} - {event.endTime || '--:--'}
          </p>
        )}
        {event.memo && <p>{event.memo}</p>}
        {(event.timelineItems ?? []).length > 0 && (
          <div className="event-timeline">
            {(event.timelineItems ?? []).map((item) => (
              <div className="event-timeline-item" key={item.id}>
                <time>{item.time}</time>
                <span />
                <strong>{item.title}</strong>
              </div>
            ))}
          </div>
        )}
        {(event.tagIds ?? []).length > 0 && (
          <div className="tag-row">
            {(event.tagIds ?? []).map((tagId) => {
              const tag = tags.find((item) => item.id === tagId);
              return (
                <span key={tagId} style={tag ? { borderColor: tag.color, color: tag.color } : undefined}>
                  #{tag?.name ?? tagId}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div className="item-actions">
        <button type="button" className="ghost-button" onClick={() => onEditEvent(event.id)}>
          編集
        </button>
      </div>
    </article>
  );
}

function moveEventId(eventIds: string[], sourceId: string, targetId: string): string[] {
  const sourceIndex = eventIds.indexOf(sourceId);
  const targetIndex = eventIds.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return eventIds;

  const next = [...eventIds];
  const [movedId] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, movedId);
  return next;
}
