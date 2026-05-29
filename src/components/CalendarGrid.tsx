import { useMemo } from 'react';
import type { CalendarEvent, CreditCardSetting, LoveLog, MoneyRecord } from '../types/calendar';
import { buildCreditCardPaymentSchedules } from '../utils/creditCard';
import { buildCalendarDays, getMonthKey } from '../utils/date';
import { eventOccursOnDate } from '../utils/recurrence';

type CalendarGridProps = {
  currentMonth: Date;
  selectedDate: string;
  events: CalendarEvent[];
  moneyRecords: MoneyRecord[];
  creditCards: CreditCardSetting[];
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
  creditCards,
  loveLogs,
  onSelectDate,
}: CalendarGridProps) {
  const days = useMemo(() => buildCalendarDays(currentMonth), [currentMonth]);
  const currentMonthKey = getMonthKey(currentMonth);
  const paymentSchedules = useMemo(
    () => buildCreditCardPaymentSchedules(moneyRecords, creditCards),
    [moneyRecords, creditCards],
  );

  return (
    <div className="calendar-grid-wrap">
      <div className="week-row">
        {weekLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {days.map((day) => {
          const dayEvents = events.filter((event) => eventOccursOnDate(event, day.date));
          const dayMoneyRecords = moneyRecords.filter((record) => record.date === day.date);
          const dayPayments = paymentSchedules.filter((schedule) => schedule.paymentDate === day.date);
          const dayLoveLogs = loveLogs.filter((log) => log.date === day.date);
          const paymentTotal = dayPayments.reduce((sum, schedule) => sum + schedule.amount, 0);
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
                {dayPayments.length > 0 && <i className="dot payment-dot" />}
                {dayLoveLogs.length > 0 && <i className="dot love-dot" />}
              </span>
              {paymentTotal > 0 && (
                <span className="payment-badge">引落 {paymentTotal.toLocaleString()}円</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
