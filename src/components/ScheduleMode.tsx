import { useMemo, useState } from 'react';
import { EventForm } from './EventForm';
import { EventList } from './EventList';
import type { CalendarEvent, CalendarTag, CreditCardSetting, MoneyRecord } from '../types/calendar';
import { buildCreditCardPaymentSchedules } from '../utils/creditCard';
import { getEventsForDate } from '../utils/recurrence';

type ScheduleModeProps = {
  selectedDate: string;
  events: CalendarEvent[];
  moneyRecords: MoneyRecord[];
  creditCards: CreditCardSetting[];
  tags: CalendarTag[];
  onEventsChange: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  onTagsChange: React.Dispatch<React.SetStateAction<CalendarTag[]>>;
};

export function ScheduleMode({
  selectedDate,
  events,
  moneyRecords,
  creditCards,
  tags,
  onEventsChange,
  onTagsChange,
}: ScheduleModeProps) {
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
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
    <div className="mode-content two-column">
      <EventForm
        selectedDate={selectedDate}
        events={events}
        editingEvent={editingEvent}
        tags={tags}
        onSaveEvent={(event) =>
          onEventsChange((current) => {
            if (editingEventId) {
              return current.map((item) => (item.id === event.id ? event : item));
            }

            return [...current, event];
          })
        }
        onCancelEdit={() => setEditingEventId(null)}
        onTagsChange={onTagsChange}
      />
      <EventList
        selectedDate={selectedDate}
        events={selectedEvents}
        paymentSchedules={selectedPaymentSchedules}
        tags={tags}
        onEditEvent={setEditingEventId}
        onDeleteEvent={(id) => {
          setEditingEventId((current) => (current === id ? null : current));
          onEventsChange((current) => current.filter((event) => event.id !== id));
        }}
      />
    </div>
  );
}
