import { formatMonthLabel, moveMonth } from '../utils/date';

type CalendarHeaderProps = {
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
};

export function CalendarHeader({ currentMonth, onMonthChange }: CalendarHeaderProps) {
  return (
    <header className="calendar-header">
      <button type="button" className="icon-button" onClick={() => onMonthChange(moveMonth(currentMonth, -1))}>
        ‹
      </button>
      <div>
        <p>表示中の月</p>
        <h2>{formatMonthLabel(currentMonth)}</h2>
      </div>
      <button type="button" className="icon-button" onClick={() => onMonthChange(moveMonth(currentMonth, 1))}>
        ›
      </button>
    </header>
  );
}
