import { useEffect, useMemo, useRef, useState } from 'react';
import { loadCalendarSnapshot, saveCalendarSnapshot, shouldUseRemoteApi } from './api/calendarApi';
import { appConfig } from './config/appConfig';
import { Calendar } from './components/Calendar';
import { ModeTabs } from './components/ModeTabs';
import { ScheduleMode } from './components/ScheduleMode';
import { MoneyMode } from './components/MoneyMode';
import { LoveMode } from './components/LoveMode';
import { SettingsMode } from './components/SettingsMode';
import { useLocalStorageState } from './hooks/useLocalStorageState';
import type {
  CalendarEvent,
  CalendarMode,
  CalendarTag,
  CreditCardSetting,
  DailyPhoto,
  LoveLog,
  MoneyRecord,
  PartTimeJob,
} from './types/calendar';
import { getMonthKey, toDateKey } from './utils/date';

const todayKey = toDateKey(new Date());
const calendarId = appConfig.calendarId;
const remoteApiEnabled = shouldUseRemoteApi();

function App() {
  const [activeMode, setActiveMode] = useState<CalendarMode>('schedule');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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
  const [dailyPhotos, setDailyPhotos] = useLocalStorageState<DailyPhoto[]>(
    'yomi-calendar-share:daily-photos',
    [],
  );
  const [theme, setTheme] = useLocalStorageState<'light' | 'dark'>(
    'yomi-calendar-share:theme',
    'light',
  );
  const [writeToken, setWriteToken] = useLocalStorageState<string>(
    'yomi-calendar-share:write-token',
    '',
  );

  const currentMonthKey = useMemo(() => getMonthKey(currentMonth), [currentMonth]);
  const [isRemoteLoaded, setIsRemoteLoaded] = useState(!remoteApiEnabled);
  const lastSavedRemoteSnapshot = useRef('');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!remoteApiEnabled) return;
    if (!writeToken.trim()) return;

    let isCancelled = false;

    loadCalendarSnapshot(calendarId, writeToken)
      .then((snapshot) => {
        if (isCancelled) return;

        setEvents(snapshot.events);
        setMoneyRecords(snapshot.moneyRecords);
        setLoveLogs(snapshot.loveLogs);
        setTags(snapshot.tags);
        setPartTimeJobs(snapshot.partTimeJobs);
        setCreditCards(snapshot.creditCards);
        setDailyPhotos(snapshot.dailyPhotos);
        lastSavedRemoteSnapshot.current = JSON.stringify(snapshot);
        setIsRemoteLoaded(true);
      })
      .catch(() => {
        if (!isCancelled) setIsRemoteLoaded(true);
      });

    return () => {
      isCancelled = true;
    };
  }, [
    setCreditCards,
    setDailyPhotos,
    setEvents,
    setLoveLogs,
    setMoneyRecords,
    setPartTimeJobs,
    setTags,
    writeToken,
  ]);

  useEffect(() => {
    if (!remoteApiEnabled || !isRemoteLoaded) return;
    if (!writeToken.trim()) return;

    const timeoutId = window.setTimeout(() => {
      const snapshot = {
        events,
        moneyRecords,
        loveLogs,
        tags,
        partTimeJobs,
        creditCards,
        dailyPhotos,
      };
      const snapshotJson = JSON.stringify(snapshot);

      if (snapshotJson === lastSavedRemoteSnapshot.current) return;

      lastSavedRemoteSnapshot.current = snapshotJson;
      void saveCalendarSnapshot(calendarId, snapshot, writeToken);
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [creditCards, dailyPhotos, events, isRemoteLoaded, loveLogs, moneyRecords, partTimeJobs, tags, writeToken]);

  if (remoteApiEnabled && !writeToken.trim()) {
    return (
      <main className="app-shell">
        <section className="unlock-panel">
          <div>
            <p className="eyebrow">Yomi Calendar Share</p>
            <h1>カレンダーを開く</h1>
            <p className="hero-copy">
              このカレンダーの予定データを読み込むには、書き込みトークンが必要です。
            </p>
          </div>
          <label>
            書き込みトークン
            <input
              type="password"
              value={writeToken}
              onChange={(event) => setWriteToken(event.target.value)}
              placeholder="Cloudflare secret と同じ値"
              autoFocus
            />
          </label>
          <p className="helper-text">トークンはこのブラウザ内にだけ保存されます。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="app-hero">
        <div>
          <p className="eyebrow">Shared calendar foundation</p>
          <h1>Yomi Calendar Share</h1>
          <p className="hero-copy">予定・お金・ラブログを同じ日付軸で整理する共有カレンダー</p>
        </div>
        <div className="hero-side">
          <button
            type="button"
            className="settings-icon-button"
            aria-label="設定を開く"
            onClick={() => setIsSettingsOpen(true)}
          >
            ⚙
          </button>
          <div className="ai-card">
            <span>AIアドバイス</span>
            <p>今週も無理しすぎず、自分のペースで頑張ってください。</p>
          </div>
        </div>
      </section>

      <div className="layout">
        <Calendar
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          events={events}
          moneyRecords={moneyRecords}
          creditCards={creditCards}
          dailyPhotos={dailyPhotos}
          loveLogs={loveLogs}
          onMonthChange={setCurrentMonth}
          onSelectDate={setSelectedDate}
        />

        <section className="workspace-panel">
          <ModeTabs activeMode={activeMode} onChange={setActiveMode} />

          {activeMode === 'schedule' && (
            <ScheduleMode
              calendarId={calendarId}
              writeToken={writeToken}
              selectedDate={selectedDate}
              events={events}
              moneyRecords={moneyRecords}
              creditCards={creditCards}
              dailyPhotos={dailyPhotos}
              tags={tags}
              onEventsChange={setEvents}
              onDailyPhotosChange={setDailyPhotos}
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
          {isSettingsOpen && (
            <div className="modal-backdrop" role="presentation" onClick={() => setIsSettingsOpen(false)}>
              <section
                className="settings-modal-panel"
                role="dialog"
                aria-modal="true"
                aria-label="設定"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="settings-modal-header">
                  <h2>設定</h2>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="設定を閉じる"
                    onClick={() => setIsSettingsOpen(false)}
                  >
                    ×
                  </button>
                </div>
                <SettingsMode
                  theme={theme}
                  writeToken={writeToken}
                  backupData={{
                    events,
                    moneyRecords,
                    loveLogs,
                    tags,
                    partTimeJobs,
                    creditCards,
                    dailyPhotos,
                  }}
                  onImportBackup={(data) => {
                    setEvents(data.events);
                    setMoneyRecords(data.moneyRecords);
                    setLoveLogs(data.loveLogs);
                    setTags(data.tags);
                    setPartTimeJobs(data.partTimeJobs);
                    setCreditCards(data.creditCards);
                    setDailyPhotos(data.dailyPhotos);
                  }}
                  onThemeChange={setTheme}
                  onWriteTokenChange={setWriteToken}
                  onTagsChange={setTags}
                  onPartTimeJobsChange={setPartTimeJobs}
                  onCreditCardsChange={setCreditCards}
                />
              </section>
            </div>
          )}

        </section>
      </div>
    </main>
  );
}

export default App;
