import type { CalendarEvent, CalendarTag } from '../types/calendar';
import type { CreditCardPaymentSchedule } from '../utils/creditCard';

type EventListProps = {
  selectedDate: string;
  events: CalendarEvent[];
  paymentSchedules: CreditCardPaymentSchedule[];
  tags: CalendarTag[];
  onEditEvent: (id: string) => void;
  onDeleteEvent: (id: string) => void;
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

// 選択日の予定だけを表示します。削除操作もここに閉じ込めます。
export function EventList({
  selectedDate,
  events,
  paymentSchedules,
  tags,
  onEditEvent,
  onDeleteEvent,
}: EventListProps) {
  if (events.length === 0 && paymentSchedules.length === 0) {
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
        <span>{events.length + paymentSchedules.length}件</span>
      </div>
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
      {events.map((event) => (
        <article className="item-card" key={event.id}>
          <div className="item-main">
            <span className={`category-pill ${event.category}`}>{categoryLabels[event.category]}</span>
            {event.recurrence && (
              <span className="category-pill recurrence">{recurrenceLabels[event.recurrence.frequency]}</span>
            )}
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
            {event.imageUrl && <p className="subtle-text">写真メモ: {event.imageUrl}</p>}
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
      ))}
    </div>
  );
}
