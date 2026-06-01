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
  onDeleteEvent: (id: string) => void;
  onToggleTodo: (id: string, done: boolean) => void;
};

const categoryLabels: Record<CalendarEvent['category'], string> = {
  schedule: '予定',
  diary: '日記',
  todo: 'ToDo',
  detail: '詳細',
  photo: '写真',
};

const categoryDescriptions: Record<CalendarEvent['category'], string> = {
  schedule: '通常予定',
  diary: '日記',
  todo: '未完了・完了を管理',
  detail: '細かい予定',
  photo: '写真メモ',
};

const categoryOrder: CalendarEvent['category'][] = ['todo', 'schedule', 'detail', 'diary', 'photo'];

const recurrenceLabels = {
  weekly: '毎週',
  monthly: '毎月',
} as const;

// 選択日の予定だけを表示します。削除操作もここに閉じ込めます。
export function EventList({
  selectedDate,
  events,
  paymentSchedules,
  salarySchedules,
  tags,
  onEditEvent,
  onDeleteEvent,
  onToggleTodo,
}: EventListProps) {
  const eventSections = categoryOrder
    .map((category) => ({
      category,
      events: events.filter((event) => event.category === category),
    }))
    .filter((section) => section.events.length > 0);
  const todoEvents = events.filter((event) => event.category === 'todo');
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
      {eventSections.map((section) => (
        <section className="event-category-section" key={section.category}>
          <div className="event-category-heading">
            <h4>{categoryLabels[section.category]}</h4>
            <span>
              {section.category === 'todo'
                ? `${completedTodoCount}/${todoEvents.length}完了 / ${todoProgress}%`
                : `${categoryDescriptions[section.category]} / ${section.events.length}件`}
            </span>
          </div>
          {section.category === 'todo' && (
            <div className="todo-progress" aria-label={`ToDo ${completedTodoCount}/${todoEvents.length} 完了`}>
              <div style={{ width: `${todoProgress}%` }} />
            </div>
          )}
          {section.events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              tags={tags}
              onEditEvent={onEditEvent}
              onDeleteEvent={onDeleteEvent}
              onToggleTodo={onToggleTodo}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function EventCard({
  event,
  tags,
  onEditEvent,
  onDeleteEvent,
  onToggleTodo,
}: {
  event: CalendarEvent;
  tags: CalendarTag[];
  onEditEvent: (id: string) => void;
  onDeleteEvent: (id: string) => void;
  onToggleTodo: (id: string, done: boolean) => void;
}) {
  const mainTagColor = event.tagIds
    .map((tagId) => tags.find((item) => item.id === tagId)?.color)
    .find((color): color is string => Boolean(color));

  return (
    <article
      className={event.done ? 'item-card todo-done' : 'item-card'}
      style={mainTagColor ? { borderLeftColor: mainTagColor } : undefined}
    >
      <div className="item-main">
        <div className="event-card-labels">
          {event.category === 'todo' && (
            <label className="todo-checkbox-label">
              <input
                type="checkbox"
                checked={Boolean(event.done)}
                onChange={(changeEvent) => onToggleTodo(event.id, changeEvent.target.checked)}
              />
              {event.done ? '完了' : '未完了'}
            </label>
          )}
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
        <button type="button" className="ghost-button danger" onClick={() => onDeleteEvent(event.id)}>
          削除
        </button>
      </div>
    </article>
  );
}
