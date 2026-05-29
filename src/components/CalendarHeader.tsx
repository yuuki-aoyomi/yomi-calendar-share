import { formatMonthLabel, moveMonth } from '../utils/date';

type CalendarHeaderProps = {
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  onGoToday: () => void;
};

export function CalendarHeader({ currentMonth, onMonthChange, onGoToday }: CalendarHeaderProps) {
  return (
    <header className="calendar-header">
      <button type="button" className="month-nav-button" aria-label="先月へ" onClick={() => onMonthChange(moveMonth(currentMonth, -1))}>
        ‹
      </button>
      <div>
        <p>表示中の月</p>
        <h2>{formatMonthLabel(currentMonth)}</h2>
      </div>
      <div className="calendar-header-actions">
        <button type="button" className="today-button" onClick={onGoToday}>
          今日
        </button>
        <button type="button" className="month-nav-button" aria-label="来月へ" onClick={() => onMonthChange(moveMonth(currentMonth, 1))}>
          ›
        </button>
      </div>
    </header>
  );
}
