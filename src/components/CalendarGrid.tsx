import { useMemo } from 'react';
import type { CalendarEvent, CreditCardSetting, DailyPhoto, LoveLog, MoneyRecord } from '../types/calendar';
import { buildCreditCardPaymentSchedules } from '../utils/creditCard';
import { buildCalendarDays, getMonthKey } from '../utils/date';
import { eventOccursOnDate } from '../utils/recurrence';

type CalendarGridProps = {
  currentMonth: Date;
  selectedDate: string;
  events: CalendarEvent[];
  moneyRecords: MoneyRecord[];
  creditCards: CreditCardSetting[];
  dailyPhotos: DailyPhoto[];
  loveLogs: LoveLog[];
  onSelectDate: (date: string) => void;
};

const weekLabels = ['日', '月', '火', '水', '木', '金', '土'];

// 日付セルに主要な予定を表示し、押さなくても日ごとの内容を把握できるようにします。
export function CalendarGrid({
  currentMonth,
  selectedDate,
  events,
  moneyRecords,
  creditCards,
  dailyPhotos,
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
          const hasSchedule = dayEvents.some((event) => event.category !== 'diary');
          const hasDiary = dayEvents.some((event) => event.category === 'diary') || dailyPhotos.some((photo) => photo.date === day.date);
          const hasMoney = dayMoneyRecords.length > 0 || dayPayments.length > 0;
          const isSelected = day.date === selectedDate;
          const visibleItems = [
            ...dayEvents.map((event) => ({
              id: event.id,
              className: event.category === 'diary' ? 'diary-preview' : 'schedule-preview',
              label: `${event.startTime ? `${event.startTime} ` : ''}${event.title}`,
            })),
            ...dayMoneyRecords.map((record) => ({
              id: record.id,
              className: 'money-preview',
              label: `${record.type === 'income' ? '+' : '-'}${record.amount.toLocaleString()}円`,
            })),
            ...dayLoveLogs.map((log) => ({
              id: log.id,
              className: 'love-preview',
              label: `♥ ${log.title}`,
            })),
          ].slice(0, 3);

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
              <span className="day-cell-top">
                <span className="day-number">{day.dayNumber}</span>
                <span className="day-dots" aria-hidden="true">
                  {hasSchedule && <i className="dot schedule-dot" />}
                  {hasDiary && <i className="dot diary-dot" />}
                  {hasMoney && <i className="dot money-dot" />}
                  {dayLoveLogs.length > 0 && <i className="dot love-dot" />}
                </span>
              </span>
              {visibleItems.length > 0 && (
                <span className="day-preview-list">
                  {visibleItems.map((item) => (
                    <span key={item.id} className={`day-preview-item ${item.className}`}>
                      {item.label}
                    </span>
                  ))}
                </span>
              )}
              {paymentTotal > 0 && (
                <span className="payment-badge">¥ {paymentTotal.toLocaleString()}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
