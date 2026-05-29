import type { CalendarEvent, CreditCardSetting, LoveLog, MoneyRecord } from '../types/calendar';
import { CalendarGrid } from './CalendarGrid';
import { CalendarHeader } from './CalendarHeader';

type CalendarProps = {
  currentMonth: Date;
  selectedDate: string;
  events: CalendarEvent[];
  moneyRecords: MoneyRecord[];
  creditCards: CreditCardSetting[];
  loveLogs: LoveLog[];
  onMonthChange: (date: Date) => void;
  onSelectDate: (date: string) => void;
};

// カレンダー全体をまとめる親コンポーネントです。
export function Calendar(props: CalendarProps) {
  return (
    <section className="calendar-panel">
      <CalendarHeader currentMonth={props.currentMonth} onMonthChange={props.onMonthChange} />
      <CalendarGrid
        currentMonth={props.currentMonth}
        selectedDate={props.selectedDate}
        events={props.events}
        moneyRecords={props.moneyRecords}
        creditCards={props.creditCards}
        loveLogs={props.loveLogs}
        onSelectDate={props.onSelectDate}
      />
    </section>
  );
}
