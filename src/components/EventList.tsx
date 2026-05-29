import type { CalendarEvent } from '../types/calendar';

type EventListProps = {
  selectedDate: string;
  events: CalendarEvent[];
  onDeleteEvent: (id: string) => void;
};

const categoryLabels: Record<CalendarEvent['category'], string> = {
  schedule: '予定',
  diary: '日記',
  todo: 'ToDo',
  detail: '詳細',
  photo: '写真',
};

// 選択日の予定だけを表示します。削除操作もここに閉じ込めます。
export function EventList({ selectedDate, events, onDeleteEvent }: EventListProps) {
  if (events.length === 0) {
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
        <span>{events.length}件</span>
      </div>
      {events.map((event) => (
        <article className="item-card" key={event.id}>
          <div className="item-main">
            <span className={`category-pill ${event.category}`}>{categoryLabels[event.category]}</span>
            <h4>{event.title}</h4>
            {(event.startTime || event.endTime) && (
              <p className="time-text">
                {event.startTime || '--:--'} - {event.endTime || '--:--'}
              </p>
            )}
            {event.memo && <p>{event.memo}</p>}
            {event.imageUrl && <p className="subtle-text">写真メモ: {event.imageUrl}</p>}
            {event.tags.length > 0 && (
              <div className="tag-row">
                {event.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="ghost-button danger" onClick={() => onDeleteEvent(event.id)}>
            削除
          </button>
        </article>
      ))}
    </div>
  );
}
