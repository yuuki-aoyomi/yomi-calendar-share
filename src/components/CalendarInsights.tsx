import type { CalendarEvent, CreditCardSetting, DailyPhoto, LoveLog, MoneyRecord, PartTimeJob } from '../types/calendar';
import { buildCreditCardPaymentSchedules } from '../utils/creditCard';
import { getMonthKey, moveMonth } from '../utils/date';
import { getEventOccurrencesForMonth, getEventsForDate } from '../utils/recurrence';
import { buildSalaryPaymentSchedules } from '../utils/salary';

type CalendarInsightsProps = {
  currentMonth: Date;
  selectedDate: string;
  events: CalendarEvent[];
  moneyRecords: MoneyRecord[];
  partTimeJobs: PartTimeJob[];
  creditCards: CreditCardSetting[];
  dailyPhotos: DailyPhoto[];
  loveLogs: LoveLog[];
};

type SummaryStats = {
  todoDone: number;
  todoTotal: number;
  todoRate: number;
  eventCount: number;
  income: number;
  expense: number;
  balance: number;
  heartCount: number;
  photoCount: number;
};

// カレンダー下に置く、選択日と表示月の自動振り返りです。
export function CalendarInsights({
  currentMonth,
  selectedDate,
  events,
  moneyRecords,
  partTimeJobs,
  creditCards,
  dailyPhotos,
  loveLogs,
}: CalendarInsightsProps) {
  const currentMonthKey = getMonthKey(currentMonth);
  const previousMonthKey = getMonthKey(moveMonth(currentMonth, -1));
  const selectedDayStats = buildDayStats({
    dateKey: selectedDate,
    events,
    moneyRecords,
    partTimeJobs,
    creditCards,
    dailyPhotos,
    loveLogs,
  });
  const monthStats = buildMonthStats({
    monthKey: currentMonthKey,
    events,
    moneyRecords,
    partTimeJobs,
    creditCards,
    dailyPhotos,
    loveLogs,
  });
  const previousMonthStats = buildMonthStats({
    monthKey: previousMonthKey,
    events,
    moneyRecords,
    partTimeJobs,
    creditCards,
    dailyPhotos,
    loveLogs,
  });

  return (
    <section className="calendar-insights">
      <div className="insight-section">
        <div className="section-title">
          <h3>{selectedDate} のまとめ</h3>
          <span>日次</span>
        </div>
        <div className="insight-card-grid">
          <InsightCard
            label="ToDo"
            value={`${selectedDayStats.todoDone}/${selectedDayStats.todoTotal}`}
            helper={`${selectedDayStats.todoRate}% 完了`}
          />
          <InsightCard label="予定" value={`${selectedDayStats.eventCount}件`} helper="ToDo以外" />
          <InsightCard
            label="収支"
            value={`${formatSignedYen(selectedDayStats.balance)}`}
            helper={`収入 ${formatYen(selectedDayStats.income)} / 支出 ${formatYen(selectedDayStats.expense)}`}
          />
          <InsightCard
            label="ラブ・写真"
            value={`♥ ${selectedDayStats.heartCount}`}
            helper={`写真 ${selectedDayStats.photoCount}枚`}
          />
        </div>
      </div>

      <div className="insight-section">
        <div className="section-title">
          <h3>{formatMonthLabel(currentMonthKey)} の振り返り</h3>
          <span>先月比較</span>
        </div>
        <div className="insight-card-grid month">
          <InsightCard
            label="ToDo完了率"
            value={`${monthStats.todoRate}%`}
            helper={`先月比 ${formatSignedPercent(monthStats.todoRate - previousMonthStats.todoRate)}`}
          />
          <InsightCard
            label="月間収支"
            value={formatSignedYen(monthStats.balance)}
            helper={`先月比 ${formatSignedYen(monthStats.balance - previousMonthStats.balance)}`}
          />
          <InsightCard
            label="予定数"
            value={`${monthStats.eventCount}件`}
            helper={`先月比 ${formatSignedCount(monthStats.eventCount - previousMonthStats.eventCount)}`}
          />
          <InsightCard
            label="ラブ・写真"
            value={`♥ ${monthStats.heartCount}`}
            helper={`写真 ${monthStats.photoCount}枚 / 先月♥ ${previousMonthStats.heartCount}`}
          />
        </div>
      </div>
    </section>
  );
}

function InsightCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <article className="insight-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{helper}</p>
    </article>
  );
}

function buildDayStats({
  dateKey,
  events,
  moneyRecords,
  partTimeJobs,
  creditCards,
  dailyPhotos,
  loveLogs,
}: {
  dateKey: string;
  events: CalendarEvent[];
  moneyRecords: MoneyRecord[];
  partTimeJobs: PartTimeJob[];
  creditCards: CreditCardSetting[];
  dailyPhotos: DailyPhoto[];
  loveLogs: LoveLog[];
}): SummaryStats {
  const dayEvents = getEventsForDate(events, dateKey);
  const dayRecords = moneyRecords.filter((record) => record.date === dateKey);
  const paymentSchedules = buildCreditCardPaymentSchedules(moneyRecords, creditCards).filter(
    (schedule) => schedule.paymentDate === dateKey,
  );
  const salarySchedules = buildSalaryPaymentSchedules(events, partTimeJobs, dateKey.slice(0, 7)).filter(
    (schedule) => schedule.paymentDate === dateKey,
  );
  const todoEvents = dayEvents.filter((event) => event.category === 'todo');
  const income =
    dayRecords.filter((record) => record.type === 'income').reduce((sum, record) => sum + record.amount, 0) +
    salarySchedules.reduce((sum, schedule) => sum + schedule.amount, 0);
  const expense =
    dayRecords
      .filter((record) => record.type === 'expense' && (!record.isCreditCard || !record.creditCardId))
      .reduce((sum, record) => sum + record.amount, 0) +
    paymentSchedules.reduce((sum, schedule) => sum + schedule.amount, 0);

  return createStats({
    todoEvents,
    eventCount: dayEvents.filter((event) => event.category !== 'todo').length,
    income,
    expense,
    heartCount: loveLogs
      .filter((log) => log.date === dateKey)
      .reduce((sum, log) => sum + log.heartCount, 0),
    photoCount: dailyPhotos.filter((photo) => photo.date === dateKey).length,
  });
}

function buildMonthStats({
  monthKey,
  events,
  moneyRecords,
  partTimeJobs,
  creditCards,
  dailyPhotos,
  loveLogs,
}: {
  monthKey: string;
  events: CalendarEvent[];
  moneyRecords: MoneyRecord[];
  partTimeJobs: PartTimeJob[];
  creditCards: CreditCardSetting[];
  dailyPhotos: DailyPhoto[];
  loveLogs: LoveLog[];
}): SummaryStats {
  const monthEvents = getEventOccurrencesForMonth(events, monthKey);
  const monthRecords = moneyRecords.filter((record) => record.date.startsWith(monthKey));
  const paymentSchedules = buildCreditCardPaymentSchedules(moneyRecords, creditCards).filter((schedule) =>
    schedule.paymentDate.startsWith(monthKey),
  );
  const salarySchedules = buildSalaryPaymentSchedules(events, partTimeJobs, monthKey);
  const todoEvents = monthEvents.filter((event) => event.category === 'todo');
  const income =
    monthRecords.filter((record) => record.type === 'income').reduce((sum, record) => sum + record.amount, 0) +
    salarySchedules.reduce((sum, schedule) => sum + schedule.amount, 0);
  const expense =
    monthRecords
      .filter((record) => record.type === 'expense' && (!record.isCreditCard || !record.creditCardId))
      .reduce((sum, record) => sum + record.amount, 0) +
    paymentSchedules.reduce((sum, schedule) => sum + schedule.amount, 0);

  return createStats({
    todoEvents,
    eventCount: monthEvents.filter((event) => event.category !== 'todo').length,
    income,
    expense,
    heartCount: loveLogs
      .filter((log) => log.date.startsWith(monthKey))
      .reduce((sum, log) => sum + log.heartCount, 0),
    photoCount: dailyPhotos.filter((photo) => photo.date.startsWith(monthKey)).length,
  });
}

function createStats({
  todoEvents,
  eventCount,
  income,
  expense,
  heartCount,
  photoCount,
}: {
  todoEvents: CalendarEvent[];
  eventCount: number;
  income: number;
  expense: number;
  heartCount: number;
  photoCount: number;
}): SummaryStats {
  const todoDone = todoEvents.filter((event) => event.done).length;
  const todoTotal = todoEvents.length;

  return {
    todoDone,
    todoTotal,
    todoRate: todoTotal > 0 ? Math.round((todoDone / todoTotal) * 100) : 0,
    eventCount,
    income,
    expense,
    balance: income - expense,
    heartCount,
    photoCount,
  };
}

function formatMonthLabel(monthKey: string): string {
  const [, month] = monthKey.split('-').map(Number);
  return `${month}月`;
}

function formatYen(value: number): string {
  return `${value.toLocaleString()}円`;
}

function formatSignedYen(value: number): string {
  return `${value >= 0 ? '+' : '-'}${Math.abs(value).toLocaleString()}円`;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? '+' : '-'}${Math.abs(value)}%`;
}

function formatSignedCount(value: number): string {
  return `${value >= 0 ? '+' : '-'}${Math.abs(value)}件`;
}
