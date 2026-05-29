import type { CalendarEvent, CreditCardSetting, DailyPhoto, LoveLog, MoneyRecord } from '../types/calendar';
import { toDateKey } from '../utils/date';
import { CalendarGrid } from './CalendarGrid';
import { CalendarHeader } from './CalendarHeader';

type CalendarProps = {
  currentMonth: Date;
  selectedDate: string;
  events: CalendarEvent[];
  moneyRecords: MoneyRecord[];
  creditCards: CreditCardSetting[];
  dailyPhotos: DailyPhoto[];
  loveLogs: LoveLog[];
  onMonthChange: (date: Date) => void;
  onSelectDate: (date: string) => void;
};

// カレンダー全体をまとめる親コンポーネントです。
export function Calendar(props: CalendarProps) {
  const handleGoToday = () => {
    const today = new Date();
    props.onMonthChange(today);
    props.onSelectDate(toDateKey(today));
  };

  return (
    <section className="calendar-panel">
      <CalendarHeader
        currentMonth={props.currentMonth}
        onMonthChange={props.onMonthChange}
        onGoToday={handleGoToday}
      />
      <CalendarGrid
        currentMonth={props.currentMonth}
        selectedDate={props.selectedDate}
        events={props.events}
        moneyRecords={props.moneyRecords}
        creditCards={props.creditCards}
        dailyPhotos={props.dailyPhotos}
        loveLogs={props.loveLogs}
        onSelectDate={props.onSelectDate}
      />
    </section>
  );
}
