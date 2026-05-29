import { useMemo, useState } from 'react';
import type {
  CalendarEvent,
  CreditCardSetting,
  MoneyRecord,
  PartTimeJob,
} from '../types/calendar';
import { buildCreditCardPaymentSchedules } from '../utils/creditCard';
import { getMinutesBetween } from '../utils/date';
import { createId } from '../utils/id';
import { getEventOccurrencesForMonth } from '../utils/recurrence';

type MoneyModeProps = {
  selectedDate: string;
  currentMonthKey: string;
  events: CalendarEvent[];
  partTimeJobs: PartTimeJob[];
  creditCards: CreditCardSetting[];
  records: MoneyRecord[];
  onRecordsChange: React.Dispatch<React.SetStateAction<MoneyRecord[]>>;
};

export function MoneyMode({
  selectedDate,
  currentMonthKey,
  events,
  partTimeJobs,
  creditCards,
  records,
  onRecordsChange,
}: MoneyModeProps) {
  const [type, setType] = useState<MoneyRecord['type']>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [memo, setMemo] = useState('');
  const [isCreditCard, setIsCreditCard] = useState(false);
  const [creditCardId, setCreditCardId] = useState('');

  const monthRecords = useMemo(
    () => records.filter((record) => record.date.startsWith(currentMonthKey)),
    [records, currentMonthKey],
  );
  const otherIncomeTotal = monthRecords
    .filter((record) => record.type === 'income')
    .reduce((sum, record) => sum + record.amount, 0);
  const expenseTotal = monthRecords
    .filter((record) => record.type === 'expense')
    .reduce((sum, record) => sum + record.amount, 0);
  const workSummaries = partTimeJobs.map((job) => {
    const minutes = getEventOccurrencesForMonth(events, currentMonthKey)
      .filter((event) => (event.tagIds ?? []).includes(job.tagId))
      .reduce((sum, event) => sum + getMinutesBetween(event.startTime, event.endTime), 0);
    const estimatedPay = job.hourlyWage ? Math.round((minutes / 60) * job.hourlyWage) : undefined;

    return { job, minutes, estimatedPay };
  });
  const workIncomeTotal = workSummaries.reduce((sum, summary) => sum + (summary.estimatedPay ?? 0), 0);
  const incomeTotal = workIncomeTotal + otherIncomeTotal;
  const balance = incomeTotal - expenseTotal;
  const paymentSchedules = useMemo(
    () => buildCreditCardPaymentSchedules(records, creditCards),
    [records, creditCards],
  );
  const monthPaymentSchedules = paymentSchedules.filter((schedule) =>
    schedule.paymentDate.startsWith(currentMonthKey),
  );
  const selectedPaymentSchedules = paymentSchedules.filter(
    (schedule) => schedule.paymentDate === selectedDate,
  );
  const monthPaymentTotal = monthPaymentSchedules.reduce((sum, schedule) => sum + schedule.amount, 0);

  const selectedRecords = monthRecords.filter((record) => record.date === selectedDate);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!category.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return;

    const now = new Date().toISOString();
    onRecordsChange((current) => [
      ...current,
      {
        id: createId(),
        date: selectedDate,
        type,
        amount: parsedAmount,
        category: category.trim(),
        memo: memo.trim() || undefined,
        isCreditCard,
        creditCardId: isCreditCard ? creditCardId || undefined : undefined,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    setAmount('');
    setCategory('');
    setMemo('');
    setIsCreditCard(false);
    setCreditCardId('');
  };

  return (
    <div className="mode-content">
      <div className="summary-grid">
        <SummaryCard label="バイト収入" value={workIncomeTotal} tone="income" />
        <SummaryCard label="その他収入" value={otherIncomeTotal} tone="income" />
        <SummaryCard label="支出" value={expenseTotal} tone="expense" />
        <SummaryCard label="差額" value={balance} tone={balance >= 0 ? 'income' : 'expense'} />
      </div>

      <PiggyBankPanel balance={balance} incomeTotal={incomeTotal} expenseTotal={expenseTotal} />

      <section className="payment-panel">
        <div className="section-title">
          <h3>今月のクレカ引き落とし</h3>
          <span>{monthPaymentTotal.toLocaleString()}円</span>
        </div>
        <PaymentScheduleList schedules={monthPaymentSchedules} emptyText="今月の引き落とし予定はありません。" />
      </section>

      {selectedPaymentSchedules.length > 0 && (
        <section className="payment-panel">
          <div className="section-title">
            <h3>{selectedDate} の引き落とし</h3>
            <span>{selectedPaymentSchedules.length}件</span>
          </div>
          <PaymentScheduleList schedules={selectedPaymentSchedules} emptyText="この日の引き落とし予定はありません。" />
        </section>
      )}

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
            <button
              type="button"
              className={type === 'income' ? 'active' : ''}
              onClick={() => {
                setType('income');
                setIsCreditCard(false);
                setCreditCardId('');
              }}
            >
              収入
            </button>
          </div>
          <label>
            金額
            <input required type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <label>
            カテゴリ
            <input
              required
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder={type === 'income' ? 'おこづかい、臨時収入など' : '食費、交通費など'}
            />
          </label>
          <label>
            メモ
            <textarea value={memo} onChange={(event) => setMemo(event.target.value)} />
          </label>
          {type === 'expense' && (
            <>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={isCreditCard}
                  onChange={(event) => setIsCreditCard(event.target.checked)}
                />
                クレジットカード
              </label>
              {isCreditCard && (
                <label>
                  使用カード
                  <select value={creditCardId} onChange={(event) => setCreditCardId(event.target.value)}>
                    <option value="">未選択</option>
                    {creditCards.map((card) => (
                      <option key={card.id} value={card.id}>
                        {card.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
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
                  <p>
                    {record.memo || 'メモなし'}
                    {record.creditCardId
                      ? ` / ${creditCards.find((card) => card.id === record.creditCardId)?.name ?? 'カード未登録'}`
                      : ''}
                  </p>
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

function PiggyBankPanel({
  balance,
  incomeTotal,
  expenseTotal,
}: {
  balance: number;
  incomeTotal: number;
  expenseTotal: number;
}) {
  const savedAmount = Math.max(balance, 0);
  const progress = incomeTotal > 0 ? Math.min((savedAmount / incomeTotal) * 100, 100) : 0;

  return (
    <article className="piggy-bank-panel">
      <div className="piggy-bank-icon" aria-hidden="true">
        ¥
      </div>
      <div className="piggy-bank-main">
        <span>今月の貯金箱</span>
        <strong>{savedAmount.toLocaleString()}円</strong>
        <div className="piggy-track">
          <div style={{ width: `${progress}%` }} />
        </div>
        <p>
          収入 {incomeTotal.toLocaleString()}円 / 支出 {expenseTotal.toLocaleString()}円
        </p>
      </div>
    </article>
  );
}

function PaymentScheduleList({
  schedules,
  emptyText,
}: {
  schedules: ReturnType<typeof buildCreditCardPaymentSchedules>;
  emptyText: string;
}) {
  if (schedules.length === 0) {
    return <p className="helper-text">{emptyText}</p>;
  }

  return (
    <div className="payment-list">
      {schedules.map((schedule) => (
        <article key={schedule.id} className="payment-item">
          <div>
            <span>{schedule.paymentDate}</span>
            <h4>{schedule.cardName}</h4>
            <p>{schedule.records.map((record) => record.category).join(' / ')}</p>
          </div>
          <strong>{schedule.amount.toLocaleString()}円</strong>
        </article>
      ))}
    </div>
  );
}
