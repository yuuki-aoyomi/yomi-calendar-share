import { useMemo, useState } from 'react';
import type { CalendarEvent, CalendarTag, CreditCardSetting, MoneyRecord } from '../types/calendar';
import { searchCalendarData } from '../utils/search';

type Props = {
  events: CalendarEvent[];
  moneyRecords: MoneyRecord[];
  tags: CalendarTag[];
  creditCards: CreditCardSetting[];
  onOpenResult: (kind: 'event' | 'money', date: string, id: string) => void;
};

const labels: Record<CalendarEvent['category'], string> = {
  schedule: '予定', diary: '日記', todo: 'ToDo', detail: '詳細', photo: '写真',
};

export function SearchPanel({ events, moneyRecords, tags, creditCards, onOpenResult }: Props) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'event' | 'money'>('all');
  const [category, setCategory] = useState('');
  const [tagId, setTagId] = useState('');
  const [todoDone, setTodoDone] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [moneyType, setMoneyType] = useState('');
  const [cardId, setCardId] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [limit, setLimit] = useState(50);

  const invalidRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const invalidAmount = [minAmount, maxAmount].some((value) => value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0))
    || Boolean(minAmount && maxAmount && Number(minAmount) > Number(maxAmount));

  const results = useMemo(() => {
    if (invalidRange || invalidAmount) return [];
    const eventFiltersEnabled = kind !== 'money';
    const moneyFiltersEnabled = kind !== 'event';
    return searchCalendarData(
      eventFiltersEnabled ? events : [],
      moneyFiltersEnabled ? moneyRecords : [],
      {
        query,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        tagIds: eventFiltersEnabled && tagId ? [tagId] : undefined,
        categories: eventFiltersEnabled && category ? [category as CalendarEvent['category']] : undefined,
        todoDone: eventFiltersEnabled && todoDone ? todoDone === 'done' : undefined,
        moneyType: moneyFiltersEnabled && moneyType ? moneyType as MoneyRecord['type'] : undefined,
        creditCardId: moneyFiltersEnabled ? cardId || undefined : undefined,
        minAmount: moneyFiltersEnabled && minAmount !== '' ? Number(minAmount) : undefined,
        maxAmount: moneyFiltersEnabled && maxAmount !== '' ? Number(maxAmount) : undefined,
      },
    );
  }, [events, moneyRecords, kind, query, dateFrom, dateTo, tagId, category, todoDone, moneyType, cardId, minAmount, maxAmount, invalidRange, invalidAmount]);

  return (
    <section className="mode-content" aria-label="横断検索">
      <div className="mode-toolbar"><div><h3>横断検索</h3><p>予定・ToDo・家計を日付をまたいで検索します。</p></div></div>
      <div className="search-panel-form" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <label style={{ gridColumn: '1 / -1' }}>キーワード
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="タイトル・メモ・カテゴリなど" />
        </label>
        <label>検索対象
          <select value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setLimit(50); }}>
            <option value="all">すべて</option><option value="event">予定・ToDo</option><option value="money">家計</option>
          </select>
        </label>
        <label>開始日<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
        <label>終了日<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
        {kind !== 'money' && <>
          <label>予定カテゴリ<select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">すべて</option>{Object.entries(labels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select></label>
          <label>タグ<select value={tagId} onChange={(e) => setTagId(e.target.value)}>
            <option value="">すべて</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
          </select></label>
          <label>ToDo状態<select value={todoDone} onChange={(e) => setTodoDone(e.target.value)}>
            <option value="">すべて</option><option value="pending">未完了</option><option value="done">完了</option>
          </select></label>
        </>}
        {kind !== 'event' && <>
          <label>収支<select value={moneyType} onChange={(e) => setMoneyType(e.target.value)}>
            <option value="">すべて</option><option value="income">収入</option><option value="expense">支出</option>
          </select></label>
          <label>カード<select value={cardId} onChange={(e) => setCardId(e.target.value)}>
            <option value="">すべて</option>{creditCards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
          </select></label>
          <label>最小金額<input type="number" min="0" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} /></label>
          <label>最大金額<input type="number" min="0" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} /></label>
        </>}
      </div>
      {(invalidRange || invalidAmount) && <p role="alert" className="error-text">{invalidRange ? '日付範囲が正しくありません。' : '金額範囲が正しくありません。'}</p>}
      <p role="status" aria-live="polite">検索結果: {results.length}件</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {results.slice(0, limit).map((result) => (
          <button type="button" key={result.kind + ':' + result.id} onClick={() => onOpenResult(result.kind, result.date, result.id)}
            style={{ textAlign: 'left', padding: 12, borderRadius: 8 }}>
            <strong>{result.title}</strong>
            <span style={{ display: 'block' }}>{result.date} · {result.kind === 'event' ? labels[result.event.category] : (result.record.type === 'income' ? '収入' : '支出') + ' · ' + result.record.amount.toLocaleString('ja-JP') + '円'}</span>
            <small>この日を開く →</small>
          </button>
        ))}
        {!invalidRange && !invalidAmount && results.length === 0 && <p>該当する記録はありません。</p>}
        {limit < results.length && <button type="button" onClick={() => setLimit((current) => current + 50)}>さらに50件表示</button>}
      </div>
    </section>
  );
}
