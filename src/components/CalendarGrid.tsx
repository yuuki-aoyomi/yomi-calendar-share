import { useMemo } from 'react';
import type { CalendarEvent, LoveLog, MoneyRecord } from '../types/calendar';
import { buildCalendarDays, getMonthKey } from '../utils/date';

type CalendarGridProps = {
  currentMonth: Date;
  selectedDate: string;
  events: CalendarEvent[];
  moneyRecords: MoneyRecord[];
  loveLogs: LoveLog[];
  onSelectDate: (date: string) => void;
};

const weekLabels = ['日', '月', '火', '水', '木', '金', '土'];

// 日付セルに予定・お金・ハートの有無を小さく表示します。
export function CalendarGrid({
  currentMonth,
  selectedDate,
  events,
  moneyRecords,
  loveLogs,
  onSelectDate,
}: CalendarGridProps) {
  const days = useMemo(() => buildCalendarDays(currentMonth), [currentMonth]);
  const currentMonthKey = getMonthKey(currentMonth);

  return (
    <div className="calendar-grid-wrap">
      <div className="week-row">
        {weekLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {days.map((day) => {
          const dayEvents = events.filter((event) => event.date === day.date);
          const dayMoneyRecords = moneyRecords.filter((record) => record.date === day.date);
          const dayLoveLogs = loveLogs.filter((log) => log.date === day.date);
          const isSelected = day.date === selectedDate;

          return (
            <button
              key={day.date}
              type="button"
              className={[
                'day-cell',
                day.isCurrentMonth ? '' : 'muted',
                day.isToday ? 'today' : '',
                isSelected ? 'selected' : '',
                day.date.startsWith(currentMonthKey) ? '' : 'outside-month',
              ].join(' ')}
              onClick={() => onSelectDate(day.date)}
            >
              <span className="day-number">{day.dayNumber}</span>
              <span className="day-dots">
                {dayEvents.length > 0 && <i className="dot schedule-dot" />}
                {dayMoneyRecords.length > 0 && <i className="dot money-dot" />}
                {dayLoveLogs.length > 0 && <i className="dot love-dot" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
