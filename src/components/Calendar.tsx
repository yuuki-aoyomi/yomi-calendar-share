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
import { toDateKey } from '../utils/date';
import { CalendarGrid } from './CalendarGrid';
import { CalendarHeader } from './CalendarHeader';
import { CalendarInsights } from './CalendarInsights';

type CalendarProps = {
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
    <div className="calendar-stack">
      <section className="calendar-panel">
        <CalendarHeader
          currentMonth={props.currentMonth}
          onMonthChange={props.onMonthChange}
          onGoToday={handleGoToday}
        />
        <CalendarGrid
          currentMonth={props.currentMonth}
          activeMode={props.activeMode}
          selectedDate={props.selectedDate}
          events={props.events}
          moneyRecords={props.moneyRecords}
          partTimeJobs={props.partTimeJobs}
          creditCards={props.creditCards}
          dailyPhotos={props.dailyPhotos}
          loveLogs={props.loveLogs}
          tags={props.tags}
          onSelectDate={props.onSelectDate}
        />
      </section>

      <section className="calendar-panel insights-panel">
        <CalendarInsights
          currentMonth={props.currentMonth}
          selectedDate={props.selectedDate}
          events={props.events}
          moneyRecords={props.moneyRecords}
          partTimeJobs={props.partTimeJobs}
          creditCards={props.creditCards}
          dailyPhotos={props.dailyPhotos}
          loveLogs={props.loveLogs}
        />
      </section>
    </div>
  );
}
