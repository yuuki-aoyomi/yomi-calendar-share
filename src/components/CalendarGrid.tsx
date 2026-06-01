import { useMemo } from 'react';
import type {
  CalendarEvent,
  CalendarMode,
  CalendarTag,
  CreditCardSetting,
  DailyPhoto,
  LoveLog,
  MoneyRecord,
  PartTimeJob,
} from '../types/calendar';
import { buildCreditCardPaymentSchedules } from '../utils/creditCard';
import { buildCalendarDays, getMonthKey } from '../utils/date';
import { eventOccursOnDate } from '../utils/recurrence';
import { buildSalaryPaymentSchedules } from '../utils/salary';

type CalendarGridProps = {
  currentMonth: Date;
  activeMode: CalendarMode;
  selectedDate: string;
  events: CalendarEvent[];
  moneyRecords: MoneyRecord[];
  partTimeJobs: PartTimeJob[];
  creditCards: CreditCardSetting[];
  dailyPhotos: DailyPhoto[];
  loveLogs: LoveLog[];
  tags: CalendarTag[];
  onSelectDate: (date: string) => void;
  onEditEvent: (eventId: string) => void;
};

const weekLabels = ['日', '月', '火', '水', '木', '金', '土'];

type CalendarPreviewItem = {
  id: string;
  className: string;
  label: string;
  color?: string;
  editable?: boolean;
};

const keepIncompleteTodoVisible = (
  eventItems: CalendarPreviewItem[],
  incompleteTodoItems: CalendarPreviewItem[],
): CalendarPreviewItem[] => {
  const visibleItems = eventItems.slice(0, 3);
  const hiddenTodo = incompleteTodoItems.find(
    (todoItem) => !visibleItems.some((visibleItem) => visibleItem.id === todoItem.id),
  );

  if (!hiddenTodo || visibleItems.length < 3) return visibleItems;

  return [...visibleItems.slice(0, 2), hiddenTodo];
};

// 日付セルに主要な予定を表示し、押さなくても日ごとの内容を把握できるようにします。
export function CalendarGrid({
  currentMonth,
  activeMode,
  selectedDate,
  events,
  moneyRecords,
  partTimeJobs,
  creditCards,
  dailyPhotos,
  loveLogs,
  tags,
  onSelectDate,
  onEditEvent,
}: CalendarGridProps) {
  const days = useMemo(() => buildCalendarDays(currentMonth), [currentMonth]);
  const currentMonthKey = getMonthKey(currentMonth);
  const tagsById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const paymentSchedules = useMemo(
    () => buildCreditCardPaymentSchedules(moneyRecords, creditCards),
    [moneyRecords, creditCards],
  );
  const salarySchedules = useMemo(
    () => buildSalaryPaymentSchedules(events, partTimeJobs, currentMonthKey),
    [events, partTimeJobs, currentMonthKey],
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
          const daySalaries = salarySchedules.filter((schedule) => schedule.paymentDate === day.date);
          const dayLoveLogs = loveLogs.filter((log) => log.date === day.date);
          const hasSchedule = dayEvents.some((event) => event.category !== 'diary' && event.category !== 'todo');
          const hasIncompleteTodo = dayEvents.some((event) => event.category === 'todo' && !event.done);
          const hasDiary = dayEvents.some((event) => event.category === 'diary') || dailyPhotos.some((photo) => photo.date === day.date);
          const hasMoney = dayMoneyRecords.length > 0 || dayPayments.length > 0 || daySalaries.length > 0;
          const isSelected = day.date === selectedDate;
          const sortedDayEvents = [...dayEvents].sort((a, b) => {
            if (!a.startTime && b.startTime) return -1;
            if (a.startTime && !b.startTime) return 1;
            return (a.startTime || '').localeCompare(b.startTime || '');
          });
          const visibleScheduleEvents = sortedDayEvents.filter((event) => event.category !== 'todo' || !event.done);
          const eventItems: CalendarPreviewItem[] = visibleScheduleEvents.map((event) => ({
              id: event.id,
              className:
                event.category === 'todo'
                  ? 'todo-preview'
                  : event.category === 'diary'
                    ? 'diary-preview'
                    : 'schedule-preview',
              label: `${event.startTime ? `${event.startTime} ` : ''}${event.title}`,
              editable: true,
              color: event.tagIds
                .map((tagId) => tagsById.get(tagId)?.color)
                .find((color): color is string => Boolean(color)),
            }));
          const incompleteTodoItems = eventItems.filter((item) => item.className === 'todo-preview');
          const moneyItems: CalendarPreviewItem[] = [
            ...dayMoneyRecords.map((record) => ({
              id: record.id,
              className: 'money-preview',
              label: `${record.type === 'income' ? '+' : '-'}${record.amount.toLocaleString()}円`,
            })),
            ...dayPayments.map((schedule) => ({
              id: schedule.id,
              className: 'money-preview',
              label: `-${schedule.amount.toLocaleString()}円`,
            })),
            ...daySalaries.map((schedule) => ({
              id: schedule.id,
              className: 'salary-preview',
              label: schedule.amount > 0 ? `+${schedule.amount.toLocaleString()}円` : schedule.jobName,
            })),
          ];
          const loveItems: CalendarPreviewItem[] = dayLoveLogs.map((log) => ({
              id: log.id,
              className: 'love-preview',
              label: `♥ ${log.title}`,
            }));
          const visibleItems =
            activeMode === 'money'
              ? moneyItems.slice(0, 3)
              : activeMode === 'love'
                ? loveItems.slice(0, 3)
                : keepIncompleteTodoVisible(eventItems, incompleteTodoItems);

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
                  {hasIncompleteTodo && <i className="dot todo-dot" />}
                  {hasDiary && <i className="dot diary-dot" />}
                  {hasMoney && <i className="dot money-dot" />}
                  {dayLoveLogs.length > 0 && <i className="dot love-dot" />}
                </span>
              </span>
              {visibleItems.length > 0 && (
                <span className="day-preview-list">
                  {visibleItems.map((item) => (
                    <span
                      key={item.id}
                      className={`day-preview-item ${item.className}${item.editable ? ' editable' : ''}`}
                      style={item.color ? { borderLeftColor: item.color } : undefined}
                      role={item.editable ? 'button' : undefined}
                      tabIndex={item.editable ? 0 : undefined}
                      onClick={(event) => {
                        if (!item.editable) return;
                        event.stopPropagation();
                        onSelectDate(day.date);
                        onEditEvent(item.id);
                      }}
                      onKeyDown={(event) => {
                        if (!item.editable || event.key !== 'Enter') return;
                        event.preventDefault();
                        event.stopPropagation();
                        onSelectDate(day.date);
                        onEditEvent(item.id);
                      }}
                    >
                      {item.label}
                    </span>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
