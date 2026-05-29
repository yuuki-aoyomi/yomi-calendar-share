import { useMemo, useState } from 'react';
import { Calendar } from './components/Calendar';
import { ModeTabs } from './components/ModeTabs';
import { ScheduleMode } from './components/ScheduleMode';
import { MoneyMode } from './components/MoneyMode';
import { LoveMode } from './components/LoveMode';
import { useLocalStorageState } from './hooks/useLocalStorageState';
import type {
  CalendarEvent,
  CalendarMode,
  CalendarTag,
  CreditCardSetting,
  LoveLog,
  MoneyRecord,
  PartTimeJob,
} from './types/calendar';
import { getMonthKey, toDateKey } from './utils/date';

const todayKey = toDateKey(new Date());

function App() {
  const [activeMode, setActiveMode] = useState<CalendarMode>('schedule');
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useLocalStorageState<CalendarEvent[]>(
    'yomi-calendar-share:events',
    [],
  );
  const [moneyRecords, setMoneyRecords] = useLocalStorageState<MoneyRecord[]>(
    'yomi-calendar-share:money-records',
    [],
  );
  const [loveLogs, setLoveLogs] = useLocalStorageState<LoveLog[]>(
    'yomi-calendar-share:love-logs',
    [],
  );
  const [tags, setTags] = useLocalStorageState<CalendarTag[]>(
    'yomi-calendar-share:tags',
    [],
  );
  const [partTimeJobs, setPartTimeJobs] = useLocalStorageState<PartTimeJob[]>(
    'yomi-calendar-share:part-time-jobs',
    [],
  );
  const [creditCards, setCreditCards] = useLocalStorageState<CreditCardSetting[]>(
    'yomi-calendar-share:credit-cards',
    [],
  );

  const currentMonthKey = useMemo(() => getMonthKey(currentMonth), [currentMonth]);

  return (
    <main className="app-shell">
      <section className="app-hero">
        <div>
          <p className="eyebrow">Shared calendar foundation</p>
          <h1>Yomi Calendar Share</h1>
          <p className="hero-copy">予定・お金・ラブログを同じ日付軸で整理する共有カレンダーの土台です。</p>
        </div>
        <div className="ai-card">
          <span>AIアドバイス</span>
          <p>今週は予定が少し詰まっています。休憩時間も確保しましょう。</p>
        </div>
      </section>

      <div className="layout">
        <Calendar
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          events={events}
          moneyRecords={moneyRecords}
          creditCards={creditCards}
          loveLogs={loveLogs}
          onMonthChange={setCurrentMonth}
          onSelectDate={setSelectedDate}
        />

        <section className="workspace-panel">
          <ModeTabs activeMode={activeMode} onChange={setActiveMode} />

          {activeMode === 'schedule' && (
            <ScheduleMode
              selectedDate={selectedDate}
              events={events}
              moneyRecords={moneyRecords}
              creditCards={creditCards}
              tags={tags}
              onEventsChange={setEvents}
              onTagsChange={setTags}
            />
          )}

          {activeMode === 'money' && (
            <MoneyMode
              selectedDate={selectedDate}
              currentMonthKey={currentMonthKey}
              events={events}
              partTimeJobs={partTimeJobs}
              creditCards={creditCards}
              records={moneyRecords}
              onTagsChange={setTags}
              onPartTimeJobsChange={setPartTimeJobs}
              onCreditCardsChange={setCreditCards}
              onRecordsChange={setMoneyRecords}
            />
          )}

          {activeMode === 'love' && (
            <LoveMode
              selectedDate={selectedDate}
              currentMonthKey={currentMonthKey}
              logs={loveLogs}
              onLogsChange={setLoveLogs}
            />
          )}
        </section>
      </div>
    </main>
  );
}

export default App;
