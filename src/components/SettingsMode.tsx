import { useState } from 'react';
import type {
  AppBackupData,
  CalendarEvent,
  CalendarTag,
  CalendarTagType,
  CreditCardSetting,
  PartTimeJob,
  Subscription,
} from '../types/calendar';
import { createBackupData, downloadBackupFile, readBackupFile } from '../utils/backup';
import { createId } from '../utils/id';
import { formatPayrollRule } from '../utils/salary';
import { sortCalendarTags } from '../utils/tags';
import type { VisualWeather } from '../App';

type SettingsModeProps = {
  theme: 'light' | 'dark';
  writeToken: string;
  backupData: AppBackupData['data'];
  onImportBackup: (data: AppBackupData['data']) => void;
  onThemeChange: (theme: 'light' | 'dark') => void;
  onWriteTokenChange: (writeToken: string) => void;
  visualBackgroundEnabled: boolean;
  visualWeather: VisualWeather;
  onVisualBackgroundEnabledChange: (enabled: boolean) => void;
  onVisualWeatherChange: (weather: VisualWeather) => void;
  onTagsChange: React.Dispatch<React.SetStateAction<CalendarTag[]>>;
  onEventsChange: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  onPartTimeJobsChange: React.Dispatch<React.SetStateAction<PartTimeJob[]>>;
  onCreditCardsChange: React.Dispatch<React.SetStateAction<CreditCardSetting[]>>;
  onSubscriptionsChange: React.Dispatch<React.SetStateAction<Subscription[]>>;
};

type SettingsTab = 'general' | 'jobs' | 'cards' | 'subscriptions' | 'tags' | 'data';

const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: 'general', label: '基本' },
  { id: 'jobs', label: 'バイト' },
  { id: 'cards', label: 'クレカ' },
  { id: 'subscriptions', label: 'サブスク' },
  { id: 'tags', label: 'タグ' },
  { id: 'data', label: 'データ' },
];

const tagTypeOptions: Array<{ value: CalendarTagType; label: string }> = [
  { value: 'person', label: 'User / 人' },
  { value: 'work', label: 'バイト' },
  { value: 'credit-card', label: 'クレカ' },
  { value: 'custom', label: 'その他' },
];

const tagColors: Record<CalendarTagType, string> = {
  person: '#4f8cff',
  work: '#1fbf83',
  'credit-card': '#f5b400',
  custom: '#7c6ee6',
};

export function SettingsMode({
  theme,
  writeToken,
  backupData,
  onImportBackup,
  onThemeChange,
  onWriteTokenChange,
  visualBackgroundEnabled,
  visualWeather,
  onVisualBackgroundEnabledChange,
  onVisualWeatherChange,
  onTagsChange,
  onEventsChange,
  onPartTimeJobsChange,
  onCreditCardsChange,
  onSubscriptionsChange,
}: SettingsModeProps) {
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('general');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
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
  const [subscriptionName, setSubscriptionName] = useState('');
  const [subscriptionAmount, setSubscriptionAmount] = useState('');
  const [subscriptionBillingCycle, setSubscriptionBillingCycle] = useState<Subscription['billingCycle']>('monthly');
  const [subscriptionBillingMonth, setSubscriptionBillingMonth] = useState('1');
  const [subscriptionBillingDay, setSubscriptionBillingDay] = useState('1');
  const [subscriptionCategory, setSubscriptionCategory] = useState('サブスク');
  const [subscriptionCreditCardId, setSubscriptionCreditCardId] = useState('');
  const [subscriptionMemo, setSubscriptionMemo] = useState('');
  const [tagName, setTagName] = useState('');
  const [tagType, setTagType] = useState<CalendarTagType>('person');
  const [tagColor, setTagColor] = useState(tagColors.person);
  const [tagBirthday, setTagBirthday] = useState('');
  const [tagMessage, setTagMessage] = useState('');
  const [tagError, setTagError] = useState('');

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

  const handleAddSubscription = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = subscriptionName.trim();
    const amount = Number(subscriptionAmount);
    const billingMonth = Number(subscriptionBillingMonth);
    const billingDay = parseDayInput(subscriptionBillingDay);
    const category = subscriptionCategory.trim() || 'サブスク';
    if (
      !name ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !billingDay ||
      (subscriptionBillingCycle === 'yearly' &&
        (!Number.isInteger(billingMonth) || billingMonth < 1 || billingMonth > 12))
    ) return;

    const now = new Date().toISOString();

    onSubscriptionsChange((current) => [
      ...current,
      {
        id: createId(),
        name,
        amount,
        billingCycle: subscriptionBillingCycle,
        billingMonth: subscriptionBillingCycle === 'yearly' ? billingMonth : undefined,
        billingDay,
        creditCardId: subscriptionCreditCardId || undefined,
        category,
        memo: subscriptionMemo.trim() || undefined,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    setSubscriptionName('');
    setSubscriptionAmount('');
    setSubscriptionBillingCycle('monthly');
    setSubscriptionBillingMonth('1');
    setSubscriptionBillingDay('1');
    setSubscriptionCategory('サブスク');
    setSubscriptionCreditCardId('');
    setSubscriptionMemo('');
  };

  const handleAddTag = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = tagName.trim();
    if (!name) return;

    const duplicatedTag = backupData.tags.find((tag) => tag.name === name && tag.type === tagType);
    if (duplicatedTag) {
      setEditingTagId(duplicatedTag.id);
      setTagError('同じ名前と種類のタグが既にあります。既存タグを開きました。');
      setTagMessage('');
      return;
    }

    const now = new Date().toISOString();
    const tag: CalendarTag = {
      id: createId(),
      name,
      type: tagType,
      color: tagColor,
      birthday: tagType === 'person' && tagBirthday ? tagBirthday : undefined,
      createdAt: now,
      updatedAt: now,
    };

    onTagsChange((current) => [...current, tag]);
    setEditingTagId(tag.id);
    setTagName('');
    setTagType('person');
    setTagColor(tagColors.person);
    setTagBirthday('');
    setTagMessage('タグを追加しました。');
    setTagError('');
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

  const handleUpdateTag = (
    tagId: string,
    updates: Partial<Pick<CalendarTag, 'name' | 'type' | 'color' | 'birthday'>>,
  ) => {
    const oldTag = backupData.tags.find((tag) => tag.id === tagId);
    const nextName = updates.name?.trim();

    onTagsChange((current) =>
      current.map((tag) =>
        tag.id === tagId
          ? {
              ...tag,
              ...updates,
              name: nextName || tag.name,
              updatedAt: new Date().toISOString(),
            }
          : tag,
      ),
    );

    if (oldTag && nextName && nextName !== oldTag.name) {
      onEventsChange((current) =>
        current.map((event) =>
          (event.tagIds ?? []).includes(tagId)
            ? {
                ...event,
                tags: (event.tags ?? []).map((name) => (name === oldTag.name ? nextName : name)),
                updatedAt: new Date().toISOString(),
              }
            : event,
        ),
      );
    }
  };

  const handleMoveTag = (tagId: string, direction: -1 | 1) => {
    onTagsChange((current) => {
      const ordered = sortCalendarTags(current);
      const currentOrderedIndex = ordered.findIndex((tag) => tag.id === tagId);
      const nextOrderedTag = ordered[currentOrderedIndex + direction];
      if (!nextOrderedTag || nextOrderedTag.type !== ordered[currentOrderedIndex]?.type) return current;

      const currentIndex = current.findIndex((tag) => tag.id === tagId);
      const nextIndex = current.findIndex((tag) => tag.id === nextOrderedTag.id);
      if (currentIndex < 0 || nextIndex < 0) return current;

      const next = [...current];
      [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
      return next.map((tag) =>
        tag.id === tagId
          ? {
              ...tag,
              updatedAt: new Date().toISOString(),
            }
          : tag,
      );
    });
  };

  const handleUpdatePartTimeJob = (jobId: string, updates: Partial<PartTimeJob>) => {
    const job = backupData.partTimeJobs.find((item) => item.id === jobId);

    onPartTimeJobsChange((current) =>
      current.map((item) =>
        item.id === jobId
          ? {
              ...item,
              ...updates,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );

    if (job && updates.name) {
      handleUpdateTag(job.tagId, { name: updates.name });
    }
  };

  const handleUpdateCreditCard = (cardId: string, updates: Partial<CreditCardSetting>) => {
    const card = backupData.creditCards.find((item) => item.id === cardId);

    onCreditCardsChange((current) =>
      current.map((item) =>
        item.id === cardId
          ? {
              ...item,
              ...updates,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );

    if (card && updates.name) {
      handleUpdateTag(card.tagId, { name: updates.name });
    }
  };

  const handleUpdateSubscription = (subscriptionId: string, updates: Partial<Subscription>) => {
    onSubscriptionsChange((current) =>
      current.map((subscription) =>
        subscription.id === subscriptionId
          ? {
              ...subscription,
              ...updates,
              updatedAt: new Date().toISOString(),
            }
          : subscription,
      ),
    );
  };

  const getTagLinkLabel = (tagId: string): string => {
    const job = backupData.partTimeJobs.find((item) => item.tagId === tagId);
    if (job) return `バイト: ${job.name}`;

    const card = backupData.creditCards.find((item) => item.tagId === tagId);
    if (card) return `クレカ: ${card.name}`;

    return '紐づきなし';
  };

  const orderedTags = sortCalendarTags(backupData.tags);

  return (
    <div className="mode-content">
      <div className="settings-tabs" role="tablist" aria-label="設定カテゴリ">
        {settingsTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeSettingsTab === tab.id}
            className={activeSettingsTab === tab.id ? 'active' : ''}
            onClick={() => setActiveSettingsTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeSettingsTab === 'jobs' && (
      <section className="settings-section">
        <div>
          <h3>バイト設定</h3>
          <p>バイト先、時給、締め日、給料日を管理します。</p>
        </div>
        <div className="settings-grid single">
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
            <PartTimeJobList
              jobs={backupData.partTimeJobs}
              tags={backupData.tags}
              onUpdateJob={handleUpdatePartTimeJob}
              onUpdateTag={handleUpdateTag}
              onDeleteJob={handleDeletePartTimeJob}
            />
          </form>
        </div>
      </section>
      )}

      {activeSettingsTab === 'cards' && (
      <section className="settings-section">
        <div>
          <h3>クレカ設定</h3>
          <p>カードごとの締め日と支払日を管理します。</p>
        </div>
        <div className="settings-grid single">
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
            <CreditCardList
              cards={backupData.creditCards}
              tags={backupData.tags}
              onUpdateCard={handleUpdateCreditCard}
              onUpdateTag={handleUpdateTag}
              onDeleteCard={handleDeleteCreditCard}
            />
          </form>
        </div>
      </section>
      )}

      {activeSettingsTab === 'subscriptions' && (
      <section className="settings-section">
        <div>
          <h3>サブスク設定</h3>
          <p>月額・年額の固定費を登録します。支出、カレンダー、お金モードの警告に自動で反映されます。</p>
        </div>
        <div className="settings-grid single">
          <form className="form-card settings-card" onSubmit={handleAddSubscription}>
            <div className="form-heading">
              <h3>サブスク</h3>
              <span>固定費</span>
            </div>
            <div className="form-grid">
              <label>
                名前
                <input
                  value={subscriptionName}
                  onChange={(event) => setSubscriptionName(event.target.value)}
                  placeholder="Netflix / Spotify など"
                />
              </label>
              <label>
                金額
                <input
                  required
                  type="number"
                  min="1"
                  value={subscriptionAmount}
                  onChange={(event) => setSubscriptionAmount(event.target.value)}
                  placeholder="980"
                />
              </label>
              <label>
                支払い周期
                <select
                  value={subscriptionBillingCycle}
                  onChange={(event) => setSubscriptionBillingCycle(event.target.value as Subscription['billingCycle'])}
                >
                  <option value="monthly">月額</option>
                  <option value="yearly">年額</option>
                </select>
              </label>
              {subscriptionBillingCycle === 'yearly' && (
                <label>
                  請求月
                  <input
                    required
                    type="number"
                    min="1"
                    max="12"
                    value={subscriptionBillingMonth}
                    onChange={(event) => setSubscriptionBillingMonth(event.target.value)}
                    placeholder="8"
                  />
                </label>
              )}
              <label>
                請求日
                <input
                  value={subscriptionBillingDay}
                  onChange={(event) => setSubscriptionBillingDay(event.target.value)}
                  placeholder="1 / 末"
                />
              </label>
              <label>
                支払いカード
                <select
                  value={subscriptionCreditCardId}
                  onChange={(event) => setSubscriptionCreditCardId(event.target.value)}
                >
                  <option value="">カード未選択</option>
                  {backupData.creditCards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                カテゴリ
                <input
                  value={subscriptionCategory}
                  onChange={(event) => setSubscriptionCategory(event.target.value)}
                  placeholder="動画 / 音楽 / アプリ"
                />
              </label>
            </div>
            <label>
              メモ
              <textarea value={subscriptionMemo} onChange={(event) => setSubscriptionMemo(event.target.value)} />
            </label>
            <button className="ghost-button" type="submit">
              サブスクを登録
            </button>
            <SubscriptionList
              subscriptions={backupData.subscriptions}
              creditCards={backupData.creditCards}
              onUpdateSubscription={handleUpdateSubscription}
              onDeleteSubscription={(id) => onSubscriptionsChange((current) => current.filter((item) => item.id !== id))}
            />
          </form>
        </div>
      </section>
      )}

      {activeSettingsTab === 'tags' && (
      <section className="settings-section">
        <div>
          <h3>タグ管理</h3>
          <p>タグを削除すると、そのタグは予定から外れます。バイト先やクレカに紐づくタグの場合、対応する設定も一緒に削除されます。</p>
        </div>
        <form className="form-card settings-card" onSubmit={handleAddTag}>
          <div className="form-heading">
            <h3>タグを追加</h3>
            <span>予定の分類用</span>
          </div>
          <div className="tag-create-row">
            <select
              value={tagType}
              onChange={(event) => {
                const nextType = event.target.value as CalendarTagType;
                setTagType(nextType);
                setTagColor(tagColors[nextType]);
                if (nextType !== 'person') setTagBirthday('');
              }}
            >
              {tagTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="color-input-row">
              <input type="color" value={tagColor} aria-label="タグの色" onChange={(event) => setTagColor(event.target.value)} />
              <span className="color-preview-chip">
                <i style={{ background: tagColor }} />
                {tagColor}
              </span>
            </div>
            <input value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="例: UserA / 勉強 / 通院" />
            {tagType === 'person' && (
              <input type="date" value={tagBirthday} aria-label="誕生日" onChange={(event) => setTagBirthday(event.target.value)} />
            )}
            <button type="submit" className="ghost-button">
              追加
            </button>
          </div>
          <p className="helper-text">バイト先やクレカの計算用設定は、それぞれの設定タブで作ると連携情報も一緒に登録されます。</p>
          {tagMessage && <p className="success-text">{tagMessage}</p>}
          {tagError && <p className="error-text">{tagError}</p>}
        </form>
        <div className="tag-management-list">
          {backupData.tags.length === 0 ? (
            <p className="helper-text">タグはまだありません。</p>
          ) : (
            orderedTags.map((tag, index) => (
              <div key={tag.id} className="editable-setting-item">
                <div className="editable-setting-summary">
                  <span className="setting-list-main">
                    <strong>
                      <i className="inline-color-dot" style={{ background: tag.color }} />
                      {tag.name}
                    </strong>
                    <span>
                      {tag.type} / {getTagLinkLabel(tag.id)}
                      {tag.type === 'person' && tag.birthday ? ` / 誕生日 ${tag.birthday.slice(5)}` : ''}
                    </span>
                  </span>
                  <div className="setting-row-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setEditingTagId(editingTagId === tag.id ? null : tag.id)}
                    >
                      {editingTagId === tag.id ? '閉じる' : '編集'}
                    </button>
                  </div>
                </div>
                {editingTagId === tag.id && (
                  <div className="editable-setting-grid">
                    <label>
                      タグ名
                      <input value={tag.name} onChange={(event) => handleUpdateTag(tag.id, { name: event.target.value })} />
                    </label>
                    <label>
                      種類
                      <select
                        value={tag.type}
                        onChange={(event) => handleUpdateTag(tag.id, { type: event.target.value as CalendarTag['type'] })}
                      >
                        <option value="person">User / 人</option>
                        <option value="work">バイト</option>
                        <option value="credit-card">クレカ</option>
                        <option value="custom">その他</option>
                      </select>
                    </label>
                    <label>
                      色
                      <div className="color-input-row">
                        <input type="color" value={tag.color} onChange={(event) => handleUpdateTag(tag.id, { color: event.target.value })} />
                        <span className="color-preview-chip">
                          <i style={{ background: tag.color }} />
                          {tag.color}
                        </span>
                      </div>
                    </label>
                    {tag.type === 'person' && (
                      <label>
                        誕生日
                        <input
                          type="date"
                          value={tag.birthday ?? ''}
                          onChange={(event) => handleUpdateTag(tag.id, { birthday: event.target.value || undefined })}
                        />
                      </label>
                    )}
                    <div className="setting-order-control">
                      <span>表示順</span>
                      <div className="setting-row-actions">
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={index === 0 || orderedTags[index - 1]?.type !== tag.type}
                          onClick={() => handleMoveTag(tag.id, -1)}
                        >
                          上へ
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={index === orderedTags.length - 1 || orderedTags[index + 1]?.type !== tag.type}
                          onClick={() => handleMoveTag(tag.id, 1)}
                        >
                          下へ
                        </button>
                      </div>
                    </div>
                    <div className="form-delete-zone">
                      <button type="button" className="ghost-button danger" onClick={() => handleDeleteTag(tag.id)}>
                        削除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>
      )}

      {activeSettingsTab === 'general' && (
      <>
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
          <h3>背景演出</h3>
          <p>時間帯と天気に合わせて背景を変えます。天気は今のところ手動で選びます。</p>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={visualBackgroundEnabled}
            onChange={(event) => onVisualBackgroundEnabledChange(event.target.checked)}
          />
          天気背景を使う
        </label>
        <label>
          天気
          <select
            value={visualWeather}
            disabled={!visualBackgroundEnabled}
            onChange={(event) => onVisualWeatherChange(event.target.value as VisualWeather)}
          >
            <option value="sunny">晴れ</option>
            <option value="rain">雨</option>
            <option value="thunder">雷</option>
            <option value="cloudy">曇り</option>
            <option value="snow">雪</option>
            <option value="hail">霰・雹</option>
          </select>
        </label>
      </section>
      </>
      )}

      {activeSettingsTab === 'data' && (
      <>
      <section className="settings-section">
        <div>
          <h3>画像保存ポリシー</h3>
          <p>1MB以下を目標に軽量化し、圧縮後2MB以下なら追加できます。圧縮前のサイズだけでは弾きません。</p>
        </div>
        <div className="settings-note-grid">
          <NoteItem label="目標サイズ" value="約1MB" />
          <NoteItem label="許容上限" value="2MB" />
          <NoteItem label="最大長辺" value="1600px" />
          <NoteItem label="判定対象" value="圧縮後サイズ" />
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
          <SummaryItem label="サブスク" value={backupData.subscriptions.length} />
          <SummaryItem label="日別写真" value={backupData.dailyPhotos.length} />
        </div>
      </section>
      </>
      )}
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

function PartTimeJobList({
  jobs,
  tags,
  onUpdateJob,
  onUpdateTag,
  onDeleteJob,
}: {
  jobs: PartTimeJob[];
  tags: CalendarTag[];
  onUpdateJob: (jobId: string, updates: Partial<PartTimeJob>) => void;
  onUpdateTag: (tagId: string, updates: Partial<Pick<CalendarTag, 'name' | 'type' | 'color' | 'birthday'>>) => void;
  onDeleteJob: (jobId: string) => void;
}) {
  const [editingJobId, setEditingJobId] = useState<string | null>(null);

  if (jobs.length === 0) return <p className="helper-text">バイト先はまだありません。</p>;

  return (
    <div className="editable-setting-list">
      {jobs.map((job) => {
        const tag = tags.find((item) => item.id === job.tagId);
        const isEditing = editingJobId === job.id;

        return (
          <div key={job.id} className="editable-setting-item">
            <div className="editable-setting-summary">
              <span className="setting-list-main">
                <strong>{job.name}</strong>
                <span>タグ: {tag?.name ?? '未登録'} / {formatPayrollRule(job)}</span>
              </span>
              <div className="setting-row-actions">
                <button type="button" className="ghost-button" onClick={() => setEditingJobId(isEditing ? null : job.id)}>
                  {isEditing ? '閉じる' : '編集'}
                </button>
              </div>
            </div>
            {isEditing && (
              <div className="editable-setting-grid">
                <label>
                  名前
                  <input value={job.name} onChange={(event) => onUpdateJob(job.id, { name: event.target.value })} />
                </label>
                <label>
                  色
                  <div className="color-input-row">
                    <input
                      type="color"
                      value={tag?.color ?? '#1fbf83'}
                      onChange={(event) => onUpdateTag(job.tagId, { color: event.target.value })}
                    />
                    <span className="color-preview-chip">
                      <i style={{ background: tag?.color ?? '#1fbf83' }} />
                      {tag?.color ?? '#1fbf83'}
                    </span>
                  </div>
                </label>
                <label>
                  時給
                  <input
                    type="number"
                    min="1"
                    value={job.hourlyWage ?? ''}
                    onChange={(event) => onUpdateJob(job.id, { hourlyWage: parseOptionalNumber(event.target.value) })}
                  />
                </label>
                <label>
                  深夜時給
                  <input
                    type="number"
                    min="1"
                    value={job.lateNightHourlyWage ?? ''}
                    onChange={(event) => onUpdateJob(job.id, { lateNightHourlyWage: parseOptionalNumber(event.target.value) })}
                  />
                </label>
                <label>
                  締め日
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={job.closingDay ?? 31}
                    onChange={(event) => onUpdateJob(job.id, { closingDay: parseRequiredDay(event.target.value) })}
                  />
                </label>
                <label>
                  給料日
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={job.paymentDay ?? 25}
                    onChange={(event) => onUpdateJob(job.id, { paymentDay: parseRequiredDay(event.target.value) })}
                  />
                </label>
                <div className="form-delete-zone">
                  <button type="button" className="ghost-button danger" onClick={() => onDeleteJob(job.id)}>
                    削除
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CreditCardList({
  cards,
  tags,
  onUpdateCard,
  onUpdateTag,
  onDeleteCard,
}: {
  cards: CreditCardSetting[];
  tags: CalendarTag[];
  onUpdateCard: (cardId: string, updates: Partial<CreditCardSetting>) => void;
  onUpdateTag: (tagId: string, updates: Partial<Pick<CalendarTag, 'name' | 'type' | 'color' | 'birthday'>>) => void;
  onDeleteCard: (cardId: string) => void;
}) {
  const [editingCardId, setEditingCardId] = useState<string | null>(null);

  if (cards.length === 0) return <p className="helper-text">クレカはまだありません。</p>;

  return (
    <div className="editable-setting-list">
      {cards.map((card) => {
        const tag = tags.find((item) => item.id === card.tagId);
        const isEditing = editingCardId === card.id;

        return (
          <div key={card.id} className="editable-setting-item">
            <div className="editable-setting-summary">
              <span className="setting-list-main">
                <strong>{card.name}</strong>
                <span>
                  タグ: {tag?.name ?? '未登録'} / {card.closingDay === 31 ? '末' : card.closingDay}日締め / {card.paymentDay}日払い
                </span>
              </span>
              <div className="setting-row-actions">
                <button type="button" className="ghost-button" onClick={() => setEditingCardId(isEditing ? null : card.id)}>
                  {isEditing ? '閉じる' : '編集'}
                </button>
              </div>
            </div>
            {isEditing && (
              <div className="editable-setting-grid">
                <label>
                  カード名
                  <input value={card.name} onChange={(event) => onUpdateCard(card.id, { name: event.target.value })} />
                </label>
                <label>
                  色
                  <div className="color-input-row">
                    <input
                      type="color"
                      value={tag?.color ?? '#f5b400'}
                      onChange={(event) => onUpdateTag(card.tagId, { color: event.target.value })}
                    />
                    <span className="color-preview-chip">
                      <i style={{ background: tag?.color ?? '#f5b400' }} />
                      {tag?.color ?? '#f5b400'}
                    </span>
                  </div>
                </label>
                <label>
                  締め日
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={card.closingDay}
                    onChange={(event) => onUpdateCard(card.id, { closingDay: parseRequiredDay(event.target.value) })}
                  />
                </label>
                <label>
                  支払日
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={card.paymentDay}
                    onChange={(event) => onUpdateCard(card.id, { paymentDay: parseRequiredDay(event.target.value) })}
                  />
                </label>
                <div className="form-delete-zone">
                  <button type="button" className="ghost-button danger" onClick={() => onDeleteCard(card.id)}>
                    削除
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SubscriptionList({
  subscriptions,
  creditCards,
  onUpdateSubscription,
  onDeleteSubscription,
}: {
  subscriptions: Subscription[];
  creditCards: CreditCardSetting[];
  onUpdateSubscription: (subscriptionId: string, updates: Partial<Subscription>) => void;
  onDeleteSubscription: (subscriptionId: string) => void;
}) {
  const [editingSubscriptionId, setEditingSubscriptionId] = useState<string | null>(null);
  const [subscriptionInputs, setSubscriptionInputs] = useState<Record<string, Partial<Record<'amount' | 'billingMonth' | 'billingDay', string>>>>({});

  if (subscriptions.length === 0) return <p className="helper-text">サブスクはまだ登録されていません。</p>;

  return (
    <div className="editable-setting-list">
      {subscriptions.map((subscription) => {
        const isEditing = editingSubscriptionId === subscription.id;
        const creditCard = creditCards.find((card) => card.id === subscription.creditCardId);
        const billingCycle = subscription.billingCycle ?? 'monthly';
        const inputValues = subscriptionInputs[subscription.id] ?? {};
        const billingLabel =
          billingCycle === 'yearly'
            ? `年額 / ${subscription.billingMonth ?? '?'}月${subscription.billingDay === 31 ? '末' : `${subscription.billingDay}日`}請求`
            : `月額 / 請求 ${subscription.billingDay === 31 ? '末' : `${subscription.billingDay}日`}`;

        return (
          <div key={subscription.id} className="editable-setting-item">
            <div className="editable-setting-summary">
              <span className="setting-list-main">
                <strong>{subscription.name}</strong>
                <span>
                  {subscription.category} / {subscription.amount.toLocaleString()}円 / {billingLabel}
                  {creditCard ? ` / ${creditCard.name}` : ' / カード未選択'}
                  {subscription.isActive ? '' : ' / 停止中'}
                </span>
              </span>
              <div className="setting-row-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setEditingSubscriptionId(isEditing ? null : subscription.id)}
                >
                  {isEditing ? '閉じる' : '編集'}
                </button>
              </div>
            </div>
            {isEditing && (
              <div className="editable-setting-grid">
                <label>
                  名前
                  <input
                    value={subscription.name}
                    onChange={(event) => onUpdateSubscription(subscription.id, { name: event.target.value })}
                  />
                </label>
                <label>
                  金額
                  <input
                    type="number"
                    min="1"
                    value={inputValues.amount ?? String(subscription.amount)}
                    onChange={(event) => {
                      const nextAmount = parseOptionalNumber(event.target.value);
                      setSubscriptionInputs((current) => ({
                        ...current,
                        [subscription.id]: { ...current[subscription.id], amount: event.target.value },
                      }));
                      if (!nextAmount) return;
                      onUpdateSubscription(subscription.id, { amount: nextAmount });
                    }}
                    onBlur={() => clearSubscriptionInput(setSubscriptionInputs, subscription.id, 'amount')}
                  />
                </label>
                <label>
                  支払い周期
                  <select
                    value={billingCycle}
                    onChange={(event) => {
                      const nextCycle = event.target.value as Subscription['billingCycle'];
                      onUpdateSubscription(subscription.id, {
                        billingCycle: nextCycle,
                        billingMonth: nextCycle === 'yearly' ? subscription.billingMonth ?? 1 : undefined,
                      });
                    }}
                  >
                    <option value="monthly">月額</option>
                    <option value="yearly">年額</option>
                  </select>
                </label>
                {billingCycle === 'yearly' && (
                  <label>
                    請求月
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={inputValues.billingMonth ?? String(subscription.billingMonth ?? 1)}
                      onChange={(event) => {
                        const nextMonth = parseMonthInput(event.target.value);
                        setSubscriptionInputs((current) => ({
                          ...current,
                          [subscription.id]: { ...current[subscription.id], billingMonth: event.target.value },
                        }));
                        if (!nextMonth) return;
                        onUpdateSubscription(subscription.id, { billingMonth: nextMonth });
                      }}
                      onBlur={() => clearSubscriptionInput(setSubscriptionInputs, subscription.id, 'billingMonth')}
                    />
                  </label>
                )}
                <label>
                  請求日
                  <input
                    value={inputValues.billingDay ?? (subscription.billingDay === 31 ? '末' : String(subscription.billingDay))}
                    onChange={(event) => {
                      const nextDay = parseOptionalDayInput(event.target.value);
                      setSubscriptionInputs((current) => ({
                        ...current,
                        [subscription.id]: { ...current[subscription.id], billingDay: event.target.value },
                      }));
                      if (!nextDay) return;
                      onUpdateSubscription(subscription.id, { billingDay: nextDay });
                    }}
                    onBlur={() => clearSubscriptionInput(setSubscriptionInputs, subscription.id, 'billingDay')}
                  />
                </label>
                <label>
                  支払いカード
                  <select
                    value={subscription.creditCardId ?? ''}
                    onChange={(event) =>
                      onUpdateSubscription(subscription.id, { creditCardId: event.target.value || undefined })
                    }
                  >
                    <option value="">カード未選択</option>
                    {creditCards.map((card) => (
                      <option key={card.id} value={card.id}>
                        {card.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  カテゴリ
                  <input
                    value={subscription.category}
                    onChange={(event) => onUpdateSubscription(subscription.id, { category: event.target.value })}
                  />
                </label>
                <label>
                  メモ
                  <textarea
                    value={subscription.memo ?? ''}
                    onChange={(event) => onUpdateSubscription(subscription.id, { memo: event.target.value || undefined })}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={subscription.isActive}
                    onChange={(event) => onUpdateSubscription(subscription.id, { isActive: event.target.checked })}
                  />
                  有効
                </label>
                <div className="form-delete-zone">
                  <button
                    type="button"
                    className="ghost-button danger"
                    onClick={() => onDeleteSubscription(subscription.id)}
                  >
                    削除
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function parseOptionalNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseRequiredDay(value: string): number {
  if (value.trim() === '末') return 31;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 1;
  return Math.min(Math.max(parsed, 1), 31);
}

function parseOptionalDayInput(value: string): number | undefined {
  if (value.trim() === '末') return 31;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 31 ? parsed : undefined;
}

function parseMonthInput(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : undefined;
}

function clearSubscriptionInput(
  setInputs: React.Dispatch<React.SetStateAction<Record<string, Partial<Record<'amount' | 'billingMonth' | 'billingDay', string>>>>>,
  subscriptionId: string,
  field: 'amount' | 'billingMonth' | 'billingDay',
) {
  setInputs((current) => {
    const next = { ...current };
    const subscriptionInput = { ...(next[subscriptionId] ?? {}) };
    delete subscriptionInput[field];

    if (Object.keys(subscriptionInput).length === 0) {
      delete next[subscriptionId];
    } else {
      next[subscriptionId] = subscriptionInput;
    }

    return next;
  });
}
