import { useEffect, useMemo, useRef, useState } from 'react';
import { loadCalendarSnapshot, saveCalendarSnapshot, shouldUseRemoteApi } from './api/calendarApi';
import { appConfig } from './config/appConfig';
import { Calendar } from './components/Calendar';
import { ModeTabs } from './components/ModeTabs';
import { ScheduleMode } from './components/ScheduleMode';
import { MoneyMode } from './components/MoneyMode';
import { LoveMode } from './components/LoveMode';
import { SettingsMode } from './components/SettingsMode';
import { HelpModal } from './components/HelpModal';
import { CalendarInsights } from './components/CalendarInsights';
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
const localDataEnabled = !remoteApiEnabled;

function App() {
  const [activeMode, setActiveMode] = useState<CalendarMode>('schedule');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [calendarEditRequest, setCalendarEditRequest] = useState<{ eventId: string; requestedAt: number } | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useLocalStorageState<CalendarEvent[]>(
    'yomi-calendar-share:events',
    [],
    { enabled: localDataEnabled },
  );
  const [moneyRecords, setMoneyRecords] = useLocalStorageState<MoneyRecord[]>(
    'yomi-calendar-share:money-records',
    [],
    { enabled: localDataEnabled },
  );
  const [loveLogs, setLoveLogs] = useLocalStorageState<LoveLog[]>(
    'yomi-calendar-share:love-logs',
    [],
    { enabled: localDataEnabled },
  );
  const [tags, setTags] = useLocalStorageState<CalendarTag[]>(
    'yomi-calendar-share:tags',
    [],
    { enabled: localDataEnabled },
  );
  const [partTimeJobs, setPartTimeJobs] = useLocalStorageState<PartTimeJob[]>(
    'yomi-calendar-share:part-time-jobs',
    [],
    { enabled: localDataEnabled },
  );
  const [creditCards, setCreditCards] = useLocalStorageState<CreditCardSetting[]>(
    'yomi-calendar-share:credit-cards',
    [],
    { enabled: localDataEnabled },
  );
  const [dailyPhotos, setDailyPhotos] = useLocalStorageState<DailyPhoto[]>(
    'yomi-calendar-share:daily-photos',
    [],
    { enabled: localDataEnabled },
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
  const [remoteLoadError, setRemoteLoadError] = useState('');
  const lastSavedRemoteSnapshot = useRef('');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!remoteApiEnabled) return;
    setIsRemoteLoaded(false);
    setRemoteLoadError('');

    if (!writeToken.trim()) {
      lastSavedRemoteSnapshot.current = '';
      return;
    }

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
        setRemoteLoadError('');
        setIsRemoteLoaded(true);
      })
      .catch(() => {
        if (!isCancelled) {
          lastSavedRemoteSnapshot.current = '';
          setRemoteLoadError('トークンが違うか、データの読み込みに失敗しました。');
          setIsRemoteLoaded(false);
        }
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

  if (remoteApiEnabled && (!writeToken.trim() || !isRemoteLoaded)) {
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
          {writeToken.trim() && !remoteLoadError && <p className="helper-text">カレンダーを読み込んでいます...</p>}
          {remoteLoadError && <p className="error-text">{remoteLoadError}</p>}
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
          <div className="hero-actions">
            <button
              type="button"
              className="settings-icon-button"
              aria-label="設定を開く"
              onClick={() => setIsSettingsOpen(true)}
            >
              ⚙
            </button>
            <button
              type="button"
              className="settings-icon-button help-icon-button"
              aria-label="ヘルプを開く"
              onClick={() => setIsHelpOpen(true)}
            >
              ?
            </button>
          </div>
          <div className="ai-card">
            <span>AIアドバイス</span>
            <p>今週も無理しすぎず、自分のペースで頑張ってください。</p>
          </div>
        </div>
      </section>

      <div className="layout">
        <Calendar
          currentMonth={currentMonth}
          activeMode={activeMode}
          selectedDate={selectedDate}
          events={events}
          moneyRecords={moneyRecords}
          partTimeJobs={partTimeJobs}
          creditCards={creditCards}
          dailyPhotos={dailyPhotos}
          loveLogs={loveLogs}
          tags={tags}
          onMonthChange={setCurrentMonth}
          onSelectDate={setSelectedDate}
          onEditEvent={(eventId) => {
            setActiveMode('schedule');
            setCalendarEditRequest({ eventId, requestedAt: Date.now() });
          }}
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
              partTimeJobs={partTimeJobs}
              creditCards={creditCards}
              dailyPhotos={dailyPhotos}
              tags={tags}
              onEventsChange={setEvents}
              onDailyPhotosChange={setDailyPhotos}
              onTagsChange={setTags}
              editRequest={calendarEditRequest}
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
                  onEventsChange={setEvents}
                  onPartTimeJobsChange={setPartTimeJobs}
                  onCreditCardsChange={setCreditCards}
                />
              </section>
            </div>
          )}
          {isHelpOpen && <HelpModal onClose={() => setIsHelpOpen(false)} />}

        </section>
        <section className="calendar-panel insights-panel">
          <CalendarInsights
            currentMonth={currentMonth}
            selectedDate={selectedDate}
            events={events}
            moneyRecords={moneyRecords}
            partTimeJobs={partTimeJobs}
            creditCards={creditCards}
            dailyPhotos={dailyPhotos}
            loveLogs={loveLogs}
          />
        </section>
      </div>
    </main>
  );
}

export default App;
