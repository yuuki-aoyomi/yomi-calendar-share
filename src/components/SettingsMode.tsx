import { useState } from 'react';
import type { AppBackupData, CalendarEvent, CalendarTag, CreditCardSetting, PartTimeJob } from '../types/calendar';
import { createBackupData, downloadBackupFile, readBackupFile } from '../utils/backup';
import { createId } from '../utils/id';
import { formatPayrollRule } from '../utils/salary';

type SettingsModeProps = {
  theme: 'light' | 'dark';
  writeToken: string;
  backupData: AppBackupData['data'];
  onImportBackup: (data: AppBackupData['data']) => void;
  onThemeChange: (theme: 'light' | 'dark') => void;
  onWriteTokenChange: (writeToken: string) => void;
  onTagsChange: React.Dispatch<React.SetStateAction<CalendarTag[]>>;
  onEventsChange: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  onPartTimeJobsChange: React.Dispatch<React.SetStateAction<PartTimeJob[]>>;
  onCreditCardsChange: React.Dispatch<React.SetStateAction<CreditCardSetting[]>>;
};

export function SettingsMode({
  theme,
  writeToken,
  backupData,
  onImportBackup,
  onThemeChange,
  onWriteTokenChange,
  onTagsChange,
  onEventsChange,
  onPartTimeJobsChange,
  onCreditCardsChange,
}: SettingsModeProps) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [jobName, setJobName] = useState('');
  const [jobTagColor, setJobTagColor] = useState('#1fbf83');
  const [hourlyWage, setHourlyWage] = useState('');
  const [lateNightHourlyWage, setLateNightHourlyWage] = useState('');
  const [jobClosingDay, setJobClosingDay] = useState('末');
  const [jobPaymentDay, setJobPaymentDay] = useState('25');
  const [cardName, setCardName] = useState('');
  const [cardTagColor, setCardTagColor] = useState('#f5b400');
  const [closingDay, setClosingDay] = useState('末');
  const [paymentDay, setPaymentDay] = useState('27');

  const parseDayInput = (value: string): number | undefined => {
    const normalized = value.trim();
    if (normalized === '末') return 31;

    const parsed = Number(normalized);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 31 ? parsed : undefined;
  };

  const handleExport = () => {
    const backup = createBackupData(backupData);
    downloadBackupFile(backup);
    setMessage('バックアップJSONを書き出しました。');
    setError('');
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const backup = await readBackupFile(file);
      onImportBackup(backup.data);
      setMessage(`${backup.exportedAt.slice(0, 10)} のバックアップを読み込みました。`);
      setError('');
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'バックアップの読み込みに失敗しました。');
      setMessage('');
    } finally {
      event.target.value = '';
    }
  };

  const handleAddPartTimeJob = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = jobName.trim();
    const parsedClosingDay = parseDayInput(jobClosingDay);
    const parsedPaymentDay = parseDayInput(jobPaymentDay);
    if (!name || !parsedClosingDay || !parsedPaymentDay) return;

    const now = new Date().toISOString();
    const tag: CalendarTag = {
      id: createId(),
      name,
      type: 'work',
      color: jobTagColor,
      createdAt: now,
      updatedAt: now,
    };
    const wage = Number(hourlyWage);
    const lateNightWage = Number(lateNightHourlyWage);

    onTagsChange((current) => [...current, tag]);
    onPartTimeJobsChange((current) => [
      ...current,
      {
        id: createId(),
        name,
        tagId: tag.id,
        hourlyWage: Number.isFinite(wage) && wage > 0 ? wage : undefined,
        lateNightHourlyWage:
          Number.isFinite(lateNightWage) && lateNightWage > 0 ? lateNightWage : undefined,
        closingDay: parsedClosingDay,
        paymentDay: parsedPaymentDay,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    setJobName('');
    setJobTagColor('#1fbf83');
    setHourlyWage('');
    setLateNightHourlyWage('');
    setJobClosingDay('末');
    setJobPaymentDay('25');
  };

  const handleAddCreditCard = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = cardName.trim();
    const parsedClosingDay = parseDayInput(closingDay);
    const parsedPaymentDay = parseDayInput(paymentDay);
    if (!name || !parsedClosingDay || !parsedPaymentDay) return;

    const now = new Date().toISOString();
    const tag: CalendarTag = {
      id: createId(),
      name,
      type: 'credit-card',
      color: cardTagColor,
      createdAt: now,
      updatedAt: now,
    };

    onTagsChange((current) => [...current, tag]);
    onCreditCardsChange((current) => [
      ...current,
      {
        id: createId(),
        name,
        tagId: tag.id,
        closingDay: parsedClosingDay,
        paymentDay: parsedPaymentDay,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    setCardName('');
    setCardTagColor('#f5b400');
    setClosingDay('末');
    setPaymentDay('27');
  };

  const handleDeleteTag = (tagId: string) => {
    const tag = backupData.tags.find((item) => item.id === tagId);

    onTagsChange((current) => current.filter((item) => item.id !== tagId));
    onEventsChange((current) =>
      current.map((event) => {
        if (!(event.tagIds ?? []).includes(tagId)) return event;

        return {
          ...event,
          tagIds: (event.tagIds ?? []).filter((id) => id !== tagId),
          tags: tag ? (event.tags ?? []).filter((name) => name !== tag.name) : event.tags,
          updatedAt: new Date().toISOString(),
        };
      }),
    );
    onPartTimeJobsChange((current) => current.filter((job) => job.tagId !== tagId));
    onCreditCardsChange((current) => current.filter((card) => card.tagId !== tagId));
  };

  const handleDeletePartTimeJob = (jobId: string) => {
    const job = backupData.partTimeJobs.find((item) => item.id === jobId);

    if (!job) return;

    handleDeleteTag(job.tagId);
    onPartTimeJobsChange((current) => current.filter((item) => item.id !== jobId));
  };

  const handleDeleteCreditCard = (cardId: string) => {
    const card = backupData.creditCards.find((item) => item.id === cardId);

    if (!card) return;

    handleDeleteTag(card.tagId);
    onCreditCardsChange((current) => current.filter((item) => item.id !== cardId));
  };

  return (
    <div className="mode-content">
      <section className="settings-section">
        <div>
          <h3>お金モード設定</h3>
          <p>バイト先とクレカは、普段の記録画面ではなくここで管理します。</p>
        </div>
        <div className="settings-grid">
          <form className="form-card settings-card" onSubmit={handleAddPartTimeJob}>
            <div className="form-heading">
              <h3>バイト先</h3>
              <span>給料計算用</span>
            </div>
            <div className="form-grid">
              <label>
                名前
                <input value={jobName} onChange={(event) => setJobName(event.target.value)} placeholder="バイトA" />
              </label>
              <label>
                色
                <div className="color-input-row">
                  <input type="color" value={jobTagColor} onChange={(event) => setJobTagColor(event.target.value)} />
                  <span className="color-preview-chip">
                    <i style={{ background: jobTagColor }} />
                    {jobTagColor}
                  </span>
                </div>
              </label>
              <label>
                時給
                <input
                  type="number"
                  min="1"
                  value={hourlyWage}
                  onChange={(event) => setHourlyWage(event.target.value)}
                  placeholder="任意"
                />
              </label>
              <label>
                深夜時給
                <input
                  type="number"
                  min="1"
                  value={lateNightHourlyWage}
                  onChange={(event) => setLateNightHourlyWage(event.target.value)}
                  placeholder="未入力なら25%増"
                />
              </label>
              <label>
                締め日
                <input
                  value={jobClosingDay}
                  onChange={(event) => setJobClosingDay(event.target.value)}
                  placeholder="末 / 15"
                />
              </label>
              <label>
                給料日
                <input
                  value={jobPaymentDay}
                  onChange={(event) => setJobPaymentDay(event.target.value)}
                  placeholder="25 / 末"
                />
              </label>
            </div>
            <button className="ghost-button" type="submit">
              バイト先を登録
            </button>
            <SettingList
              items={backupData.partTimeJobs.map((job) => ({
                id: job.id,
                title: job.name,
                detail: `${job.hourlyWage ? `時給 ${job.hourlyWage.toLocaleString()}円` : '時給未設定'} / ${formatPayrollRule(job)}`,
              }))}
              emptyText="バイト先はまだありません。"
              onDelete={handleDeletePartTimeJob}
            />
          </form>

          <form className="form-card settings-card" onSubmit={handleAddCreditCard}>
            <div className="form-heading">
              <h3>クレカ</h3>
              <span>請求計算用</span>
            </div>
            <label>
              カード名
              <input value={cardName} onChange={(event) => setCardName(event.target.value)} placeholder="クレカA" />
            </label>
            <div className="form-grid">
              <label>
                色
                <div className="color-input-row">
                  <input type="color" value={cardTagColor} onChange={(event) => setCardTagColor(event.target.value)} />
                  <span className="color-preview-chip">
                    <i style={{ background: cardTagColor }} />
                    {cardTagColor}
                  </span>
                </div>
              </label>
              <label>
                締め日
                <input value={closingDay} onChange={(event) => setClosingDay(event.target.value)} placeholder="末 / 15" />
              </label>
              <label>
                支払日
                <input value={paymentDay} onChange={(event) => setPaymentDay(event.target.value)} placeholder="27" />
              </label>
            </div>
            <button className="ghost-button" type="submit">
              クレカを登録
            </button>
            <SettingList
              items={backupData.creditCards.map((card) => ({
                id: card.id,
                title: card.name,
                detail: `${card.closingDay === 31 ? '末' : card.closingDay}日締め / ${card.paymentDay}日払い`,
              }))}
              emptyText="クレカはまだありません。"
              onDelete={handleDeleteCreditCard}
            />
          </form>
        </div>
      </section>

      <section className="settings-section">
        <div>
          <h3>タグ管理</h3>
          <p>タグを削除すると、そのタグは予定から外れます。バイト先やクレカに紐づくタグの場合、対応する設定も一緒に削除されます。</p>
        </div>
        <div className="tag-management-list">
          {backupData.tags.length === 0 ? (
            <p className="helper-text">タグはまだありません。</p>
          ) : (
            backupData.tags.map((tag) => (
              <div key={tag.id} className="tag-management-item">
                <span className="tag-management-main">
                  <i style={{ background: tag.color }} />
                  <strong>{tag.name}</strong>
                  <small>{tag.type}</small>
                </span>
                <button type="button" className="ghost-button danger" onClick={() => handleDeleteTag(tag.id)}>
                  削除
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="settings-section">
        <div>
          <h3>書き込みトークン</h3>
          <p>予定の読み込み、保存、画像表示に使います。GitHubには保存されず、このブラウザ内だけに保存されます。</p>
        </div>
        <label>
          トークン
          <input
            type="password"
            value={writeToken}
            onChange={(event) => onWriteTokenChange(event.target.value)}
            placeholder="Cloudflare secret と同じ値"
          />
        </label>
      </section>

      <section className="settings-section">
        <div>
          <h3>表示テーマ</h3>
          <p>画面全体の明るさを切り替えます。</p>
        </div>
        <div className="theme-toggle" role="group" aria-label="表示テーマ">
          <button
            type="button"
            className={theme === 'light' ? 'active' : ''}
            onClick={() => onThemeChange('light')}
          >
            ライト
          </button>
          <button
            type="button"
            className={theme === 'dark' ? 'active' : ''}
            onClick={() => onThemeChange('dark')}
          >
            ダーク
          </button>
        </div>
      </section>

      <section className="settings-section">
        <div>
          <h3>画像保存ポリシー</h3>
          <p>1MB以下の画像は画質圧縮せず、必要な場合だけ比率を保ってリサイズします。1MBを超える画像だけ軽量化します。</p>
        </div>
        <div className="settings-note-grid">
          <NoteItem label="目標サイズ" value="約1MB" />
          <NoteItem label="最大長辺" value="1600px" />
          <NoteItem label="圧縮対象" value="1MB超のみ" />
        </div>
      </section>

      <section className="settings-section">
        <div>
          <h3>バックアップ / 移行</h3>
          <p>予定、お金、ラブログ、タグ、バイト先、クレカ設定をまとめてJSONに保存できます。</p>
        </div>
        <div className="backup-actions">
          <button type="button" className="primary-button" onClick={handleExport}>
            全データを書き出す
          </button>
          <label className="file-import-button">
            バックアップを読み込む
            <input type="file" accept="application/json,.json" onChange={handleImport} />
          </label>
        </div>
        {message && <p className="success-text">{message}</p>}
        {error && <p className="error-text">{error}</p>}
      </section>

      <section className="settings-section">
        <h3>保存対象</h3>
        <div className="backup-summary-grid">
          <SummaryItem label="予定" value={backupData.events.length} />
          <SummaryItem label="お金" value={backupData.moneyRecords.length} />
          <SummaryItem label="ラブログ" value={backupData.loveLogs.length} />
          <SummaryItem label="タグ" value={backupData.tags.length} />
          <SummaryItem label="バイト先" value={backupData.partTimeJobs.length} />
          <SummaryItem label="クレカ" value={backupData.creditCards.length} />
          <SummaryItem label="日別写真" value={backupData.dailyPhotos.length} />
        </div>
      </section>
    </div>
  );
}

function NoteItem({ label, value }: { label: string; value: string }) {
  return (
    <article className="settings-note-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <article className="backup-summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function SettingList({
  items,
  emptyText,
  onDelete,
}: {
  items: Array<{ id: string; title: string; detail: string }>;
  emptyText: string;
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) {
    return <p className="helper-text">{emptyText}</p>;
  }

  return (
    <div className="setting-list">
      {items.map((item) => (
        <div key={item.id}>
          <span className="setting-list-main">
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
          </span>
          <button type="button" className="ghost-button danger" onClick={() => onDelete(item.id)}>
            削除
          </button>
        </div>
      ))}
    </div>
  );
}
