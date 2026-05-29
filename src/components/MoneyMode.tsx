import { useMemo, useState } from 'react';
import type { CalendarEvent, MoneyRecord } from '../types/calendar';
import { getMinutesBetween } from '../utils/date';

type MoneyModeProps = {
  selectedDate: string;
  currentMonthKey: string;
  events: CalendarEvent[];
  records: MoneyRecord[];
  onRecordsChange: React.Dispatch<React.SetStateAction<MoneyRecord[]>>;
};

export function MoneyMode({ selectedDate, currentMonthKey, events, records, onRecordsChange }: MoneyModeProps) {
  const [type, setType] = useState<MoneyRecord['type']>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [memo, setMemo] = useState('');
  const [isCreditCard, setIsCreditCard] = useState(false);

  const monthRecords = useMemo(
    () => records.filter((record) => record.date.startsWith(currentMonthKey)),
    [records, currentMonthKey],
  );
  const incomeTotal = monthRecords
    .filter((record) => record.type === 'income')
    .reduce((sum, record) => sum + record.amount, 0);
  const expenseTotal = monthRecords
    .filter((record) => record.type === 'expense')
    .reduce((sum, record) => sum + record.amount, 0);
  const balance = incomeTotal - expenseTotal;
  const workMinutes = events
    .filter((event) => event.date.startsWith(currentMonthKey) && event.tags.includes('バイト'))
    .reduce((sum, event) => sum + getMinutesBetween(event.startTime, event.endTime), 0);

  const selectedRecords = monthRecords.filter((record) => record.date === selectedDate);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!category.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return;

    const now = new Date().toISOString();
    onRecordsChange((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        date: selectedDate,
        type,
        amount: parsedAmount,
        category: category.trim(),
        memo: memo.trim() || undefined,
        isCreditCard,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    setAmount('');
    setCategory('');
    setMemo('');
    setIsCreditCard(false);
  };

  return (
    <div className="mode-content">
      <div className="summary-grid">
        <SummaryCard label="収入" value={incomeTotal} tone="income" />
        <SummaryCard label="支出" value={expenseTotal} tone="expense" />
        <SummaryCard label="差額" value={balance} tone={balance >= 0 ? 'income' : 'expense'} />
        <article className="summary-card work">
          <span>バイト勤務</span>
          <strong>{Math.floor(workMinutes / 60)}時間 {workMinutes % 60}分</strong>
        </article>
      </div>

      <div className="two-column">
        <form className="form-card" onSubmit={handleSubmit}>
          <div className="form-heading">
            <h3>お金を記録</h3>
            <span>{selectedDate}</span>
          </div>
          <div className="segmented">
            <button type="button" className={type === 'expense' ? 'active' : ''} onClick={() => setType('expense')}>
              支出
            </button>
            <button type="button" className={type === 'income' ? 'active' : ''} onClick={() => setType('income')}>
              収入
            </button>
          </div>
          <label>
            金額
            <input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <label>
            カテゴリ
            <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="食費、給料など" />
          </label>
          <label>
            メモ
            <textarea value={memo} onChange={(event) => setMemo(event.target.value)} />
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={isCreditCard} onChange={(event) => setIsCreditCard(event.target.checked)} />
            クレジットカード
          </label>
          <button className="primary-button" type="submit">
            記録する
          </button>
        </form>

        <div className="list-stack">
          <div className="section-title">
            <h3>{selectedDate} のお金</h3>
            <span>{selectedRecords.length}件</span>
          </div>
          {selectedRecords.length === 0 ? (
            <div className="empty-state">
              <p>この日の収支はまだありません。</p>
            </div>
          ) : (
            selectedRecords.map((record) => (
              <article className="item-card compact" key={record.id}>
                <div>
                  <span className={`category-pill ${record.type}`}>{record.type === 'income' ? '収入' : '支出'}</span>
                  <h4>{record.category}</h4>
                  <p>{record.memo || 'メモなし'}</p>
                </div>
                <div className="amount-block">
                  <strong>{record.amount.toLocaleString()}円</strong>
                  <button
                    type="button"
                    className="ghost-button danger"
                    onClick={() => onRecordsChange((current) => current.filter((item) => item.id !== record.id))}
                  >
                    削除
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: 'income' | 'expense' }) {
  return (
    <article className={`summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString()}円</strong>
    </article>
  );
}
