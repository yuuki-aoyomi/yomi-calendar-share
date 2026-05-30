import { useMemo, useState } from 'react';
import { EventForm } from './EventForm';
import { EventList } from './EventList';
import { DailyPhotoPanel } from './DailyPhotoPanel';
import type { CalendarEvent, CalendarTag, CreditCardSetting, DailyPhoto, MoneyRecord } from '../types/calendar';
import { buildCreditCardPaymentSchedules } from '../utils/creditCard';
import { getEventsForDate } from '../utils/recurrence';

type ScheduleModeProps = {
  calendarId: string;
  writeToken: string;
  selectedDate: string;
  events: CalendarEvent[];
  moneyRecords: MoneyRecord[];
  creditCards: CreditCardSetting[];
  dailyPhotos: DailyPhoto[];
  tags: CalendarTag[];
  onEventsChange: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  onDailyPhotosChange: React.Dispatch<React.SetStateAction<DailyPhoto[]>>;
  onTagsChange: React.Dispatch<React.SetStateAction<CalendarTag[]>>;
};

export function ScheduleMode({
  calendarId,
  writeToken,
  selectedDate,
  events,
  moneyRecords,
  creditCards,
  dailyPhotos,
  tags,
  onEventsChange,
  onDailyPhotosChange,
  onTagsChange,
}: ScheduleModeProps) {
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const editingEvent = events.find((event) => event.id === editingEventId);
  const selectedEvents = useMemo(
    () =>
      getEventsForDate(events, selectedDate)
        .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')),
    [events, selectedDate],
  );
  const selectedPaymentSchedules = useMemo(
    () =>
      buildCreditCardPaymentSchedules(moneyRecords, creditCards).filter(
        (schedule) => schedule.paymentDate === selectedDate,
      ),
    [moneyRecords, creditCards, selectedDate],
  );

  return (
    <div className="mode-content">
      <div className="mode-toolbar">
        <div>
          <h3>予定</h3>
          <p>{selectedDate} の予定を確認できます。</p>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setEditingEventId(null);
            setIsEditorOpen(true);
          }}
        >
          予定を追加
        </button>
      </div>

      <EventList
        selectedDate={selectedDate}
        events={selectedEvents}
        paymentSchedules={selectedPaymentSchedules}
        tags={tags}
        onEditEvent={(id) => {
          setEditingEventId(id);
          setIsEditorOpen(true);
        }}
        onDeleteEvent={(id) => {
          setEditingEventId((current) => (current === id ? null : current));
          onEventsChange((current) => current.filter((event) => event.id !== id));
        }}
      />

      <DailyPhotoPanel
        calendarId={calendarId}
        writeToken={writeToken}
        selectedDate={selectedDate}
        photos={dailyPhotos}
        onPhotosChange={onDailyPhotosChange}
      />

      {isEditorOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            setEditingEventId(null);
            setIsEditorOpen(false);
          }}
        >
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label="予定フォーム"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close-button"
              aria-label="予定フォームを閉じる"
              onClick={() => {
                setEditingEventId(null);
                setIsEditorOpen(false);
              }}
            >
              ×
            </button>
            <EventForm
              selectedDate={selectedDate}
              events={events}
              editingEvent={editingEvent}
              tags={tags}
              onSaveEvent={(event) => {
                onEventsChange((current) => {
                  if (editingEventId) {
                    return current.map((item) => (item.id === event.id ? event : item));
                  }

                  return [...current, event];
                });
                setEditingEventId(null);
                setIsEditorOpen(false);
              }}
              onCancelEdit={() => {
                setEditingEventId(null);
                setIsEditorOpen(false);
              }}
              onTagsChange={onTagsChange}
            />
          </section>
        </div>
      )}
    </div>
  );
}
