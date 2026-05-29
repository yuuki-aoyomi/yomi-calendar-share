import { useMemo } from 'react';
import { EventForm } from './EventForm';
import { EventList } from './EventList';
import type { CalendarEvent } from '../types/calendar';

type ScheduleModeProps = {
  selectedDate: string;
  events: CalendarEvent[];
  onEventsChange: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
};

export function ScheduleMode({ selectedDate, events, onEventsChange }: ScheduleModeProps) {
  const selectedEvents = useMemo(
    () =>
      events
        .filter((event) => event.date === selectedDate)
        .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')),
    [events, selectedDate],
  );

  return (
    <div className="mode-content two-column">
      <EventForm selectedDate={selectedDate} onAddEvent={(event) => onEventsChange((current) => [...current, event])} />
      <EventList
        selectedDate={selectedDate}
        events={selectedEvents}
        onDeleteEvent={(id) => onEventsChange((current) => current.filter((event) => event.id !== id))}
      />
    </div>
  );
}
