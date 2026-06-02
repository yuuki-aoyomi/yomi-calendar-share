import { useMemo, useState } from 'react';
import type {
  CalendarEvent,
  CreditCardSetting,
  MoneyRecord,
  PartTimeJob,
  Subscription,
} from '../types/calendar';
import { buildCreditCardPaymentSchedules } from '../utils/creditCard';
import { createId } from '../utils/id';
import { buildSalaryPaymentSchedules } from '../utils/salary';
import { buildSubscriptionPaymentSchedules } from '../utils/subscription';

type MoneyModeProps = {
  selectedDate: string;
  currentMonthKey: string;
  events: CalendarEvent[];
  partTimeJobs: PartTimeJob[];
  creditCards: CreditCardSetting[];
  subscriptions: Subscription[];
  records: MoneyRecord[];
  onRecordsChange: React.Dispatch<React.SetStateAction<MoneyRecord[]>>;
};

const formatMonthLabel = (monthKey: string): string => {
  const [, month] = monthKey.split('-').map(Number);
  return `${month}月`;
};

const moveMonthKey = (monthKey: string, diff: number): string => {
  const [year, month] = monthKey.split('-').map(Number);
  const movedDate = new Date(year, month - 1 + diff, 1);
  const movedYear = movedDate.getFullYear();
  const movedMonth = String(movedDate.getMonth() + 1).padStart(2, '0');

  return `${movedYear}-${movedMonth}`;
};

const lowBalanceThreshold = 10_000;

const parseMoneyAmount = (value: string): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

export function MoneyMode({
  selectedDate,
  currentMonthKey,
  events,
  partTimeJobs,
  creditCards,
  subscriptions,
  records,
  onRecordsChange,
}: MoneyModeProps) {
  const [type, setType] = useState<MoneyRecord['type']>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [memo, setMemo] = useState('');
  const [isCreditCard, setIsCreditCard] = useState(true);
  const [creditCardId, setCreditCardId] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [recordAmountInputs, setRecordAmountInputs] = useState<Record<string, string>>({});
  const monthLabel = formatMonthLabel(currentMonthKey);

  const monthRecords = useMemo(
    () => records.filter((record) => record.date.startsWith(currentMonthKey)),
    [records, currentMonthKey],
  );
  const otherIncomeTotal = monthRecords
    .filter((record) => record.type === 'income')
    .reduce((sum, record) => sum + record.amount, 0);
  const paymentSchedules = useMemo(
    () => buildCreditCardPaymentSchedules(records, creditCards),
    [records, creditCards],
  );
  const salaryPaymentSchedules = useMemo(
    () => buildSalaryPaymentSchedules(events, partTimeJobs, currentMonthKey),
    [events, partTimeJobs, currentMonthKey],
  );
  const subscriptionPaymentSchedules = useMemo(
    () => buildSubscriptionPaymentSchedules(subscriptions, currentMonthKey, creditCards),
    [subscriptions, currentMonthKey, creditCards],
  );
  const monthPaymentSchedules = paymentSchedules.filter((schedule) =>
    schedule.paymentDate.startsWith(currentMonthKey),
  );
  const selectedPaymentSchedules = paymentSchedules.filter(
    (schedule) => schedule.paymentDate === selectedDate,
  );
  const monthPaymentTotal = monthPaymentSchedules.reduce((sum, schedule) => sum + schedule.amount, 0);
  const monthSalaryPaymentTotal = salaryPaymentSchedules.reduce((sum, schedule) => sum + schedule.amount, 0);
  const monthSubscriptionTotal = subscriptionPaymentSchedules.reduce((sum, schedule) => sum + schedule.amount, 0);
  const directExpenseTotal = monthRecords
    .filter((record) => record.type === 'expense' && (!record.isCreditCard || !record.creditCardId))
    .reduce((sum, record) => sum + record.amount, 0);
  const expenseTotal = directExpenseTotal + monthPaymentTotal + monthSubscriptionTotal;
  const workIncomeTotal = monthSalaryPaymentTotal;
  const incomeTotal = workIncomeTotal + otherIncomeTotal;
  const balance = incomeTotal - expenseTotal;
  const workSummaries = partTimeJobs.map((job) => {
    const jobSchedules = salaryPaymentSchedules.filter((schedule) => schedule.jobId === job.id);
    const amount = jobSchedules.reduce((sum, schedule) => sum + schedule.amount, 0);
    const minutes = jobSchedules.reduce((sum, schedule) => sum + schedule.minutes, 0);

    return { job, minutes, estimatedPay: amount, paymentCount: jobSchedules.length };
  });
  const cashFlowWarning = buildMonthlyCashFlowWarning(
    currentMonthKey,
    monthRecords,
    monthPaymentSchedules,
    salaryPaymentSchedules,
    subscriptionPaymentSchedules,
  );
  const creditCardFailureWarning = buildCreditCardFailureWarning(
    currentMonthKey,
    monthRecords,
    monthPaymentSchedules,
    salaryPaymentSchedules,
    subscriptionPaymentSchedules,
    lowBalanceThreshold,
  );
  const futureCreditCardWarning = buildFutureCreditCardWarning({
    currentMonthKey,
    records,
    events,
    partTimeJobs,
    creditCards,
    subscriptions,
    paymentSchedules,
    threshold: lowBalanceThreshold,
  });

  const selectedRecords = monthRecords.filter((record) => record.date === selectedDate);
  const editingRecord = records.find((record) => record.id === editingRecordId);

  const resetCreateForm = () => {
    setAmount('');
    setCategory('');
    setMemo('');
    setIsCreditCard(type === 'expense');
    setCreditCardId('');
  };

  const openCreateForm = () => {
    setType('expense');
    setAmount('');
    setCategory('');
    setMemo('');
    setIsCreditCard(true);
    setCreditCardId('');
    setIsCreateOpen(true);
  };

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

    resetCreateForm();
    setIsCreateOpen(false);
  };

  return (
    <div className="mode-content">
      <div className="mode-toolbar">
        <div>
          <h3>お金</h3>
          <p>{selectedDate} の収支を確認できます。</p>
        </div>
        <button type="button" className="primary-button" onClick={openCreateForm}>
          お金を追加
        </button>
      </div>

      <div className="summary-grid">
        <SummaryCard label="バイト収入" value={workIncomeTotal} tone="income" />
        <SummaryCard label="その他収入" value={otherIncomeTotal} tone="income" />
        <SummaryCard label="支出" value={expenseTotal} tone="expense" />
        <SummaryCard label="差額" value={balance} tone={balance >= 0 ? 'income' : 'expense'} />
      </div>

      <PiggyBankPanel
        monthLabel={monthLabel}
        balance={balance}
        incomeTotal={incomeTotal}
        expenseTotal={expenseTotal}
      />

      {balance < 0 && (
        <section className="money-warning-panel" role="alert">
          <strong>今月の収支がマイナスになりそうです。</strong>
          <p>
            支出が収入を {Math.abs(balance).toLocaleString()}円 上回っています。クレカ引き落とし予定も確認しておきましょう。
          </p>
        </section>
      )}

      {cashFlowWarning && (
        <section className="money-warning-panel" role="alert">
          <strong>{cashFlowWarning.date} 時点で一時的にマイナスになりそうです。</strong>
          <p>
            給料日とクレカ引き落としの順番を反映すると、月中の差額が
            {cashFlowWarning.amount.toLocaleString()}円 まで下がります。
          </p>
        </section>
      )}

      {creditCardFailureWarning && (
        <section className="money-warning-panel" role="alert">
          <strong>{creditCardFailureWarning.date} のクレカ引き落としに注意してください。</strong>
          <p>
            引き落とし後の残りが {creditCardFailureWarning.balance.toLocaleString()}円 になり、
            目安の {lowBalanceThreshold.toLocaleString()}円 を下回りそうです。
          </p>
        </section>
      )}

      {futureCreditCardWarning && (
        <section className="money-warning-panel" role="alert">
          <strong>
            {futureCreditCardWarning.paymentDate} のクレカ引き落としで残りが少なくなりそうです。
          </strong>
          <p>
            {monthLabel}に使ったクレカ分が後の月に引き落とされ、残りが
            {futureCreditCardWarning.balance.toLocaleString()}円 まで下がる見込みです。
            これ以上のクレカ利用は注意しましょう。
          </p>
        </section>
      )}

      <section className="payment-panel salary-panel">
        <div className="section-title">
          <h3>{monthLabel}の給料日</h3>
          <span>{monthSalaryPaymentTotal.toLocaleString()}円</span>
        </div>
        <SalaryScheduleList schedules={salaryPaymentSchedules} emptyText="今月の給料日はまだありません。" />
      </section>

      <section className="payment-panel salary-panel">
        <div className="section-title">
          <h3>バイトごとの入金予定</h3>
          <span>{workSummaries.length}件</span>
        </div>
        {workSummaries.length === 0 ? (
          <p className="helper-text">バイト先はまだ登録されていません。</p>
        ) : (
          <div className="payment-list">
            {workSummaries.map((summary) => (
              <article key={summary.job.id} className="payment-item salary-item">
                <div>
                  <span>{summary.job.name}</span>
                  <h4>
                    {Math.floor(summary.minutes / 60)}時間{summary.minutes % 60}分
                  </h4>
                  <p>{summary.job.hourlyWage ? `時給 ${summary.job.hourlyWage.toLocaleString()}円` : '時給未設定'}</p>
                </div>
                <strong>
                  {summary.paymentCount === 0 ? '今月入金なし' : `${summary.estimatedPay.toLocaleString()}円`}
                </strong>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="payment-panel">
        <div className="section-title">
          <h3>{monthLabel}のクレカ引き落とし</h3>
          <span>{monthPaymentTotal.toLocaleString()}円</span>
        </div>
        <PaymentScheduleList schedules={monthPaymentSchedules} emptyText="今月の引き落とし予定はありません。" />
      </section>

      <section className="payment-panel subscription-panel">
        <div className="section-title">
          <h3>{monthLabel}のサブスク</h3>
          <span>{monthSubscriptionTotal.toLocaleString()}円</span>
        </div>
        <SubscriptionScheduleList schedules={subscriptionPaymentSchedules} emptyText="今月のサブスク支払いはありません。" />
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
            <article className="item-card" key={record.id}>
              <div className="item-main">
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
                <button type="button" className="ghost-button" onClick={() => setEditingRecordId(record.id)}>
                  編集
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {isCreateOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            resetCreateForm();
            setIsCreateOpen(false);
          }}
        >
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label="お金を追加"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close-button"
              aria-label="お金追加を閉じる"
              onClick={() => {
                resetCreateForm();
                setIsCreateOpen(false);
              }}
            >
              ×
            </button>
            <form className="form-card" onSubmit={handleSubmit}>
              <div className="form-heading">
                <h3>お金を記録</h3>
                <span>{selectedDate}</span>
              </div>
              <div className="segmented">
                <button
                  type="button"
                  className={type === 'expense' ? 'active' : ''}
                  onClick={() => {
                    setType('expense');
                    setIsCreditCard(true);
                  }}
                >
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
              <div className="form-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    resetCreateForm();
                    setIsCreateOpen(false);
                  }}
                >
                  キャンセル
                </button>
                <button className="primary-button" type="submit">
                  記録する
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {editingRecord && (
        <div className="modal-backdrop" role="presentation" onClick={() => setEditingRecordId(null)}>
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label="お金の記録を編集"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close-button"
              aria-label="お金の記録編集を閉じる"
              onClick={() => setEditingRecordId(null)}
            >
              ×
            </button>
            <MoneyRecordEditForm
              record={editingRecord}
              creditCards={creditCards}
              amountInput={recordAmountInputs[editingRecord.id] ?? String(editingRecord.amount)}
              onAmountInputChange={(value) =>
                setRecordAmountInputs((current) => ({ ...current, [editingRecord.id]: value }))
              }
              onAmountInputClear={() => {
                setRecordAmountInputs((current) => {
                  const next = { ...current };
                  delete next[editingRecord.id];
                  return next;
                });
              }}
              onRecordsChange={onRecordsChange}
              onDelete={() => {
                onRecordsChange((current) => current.filter((item) => item.id !== editingRecord.id));
                setEditingRecordId(null);
              }}
            />
          </section>
        </div>
      )}
    </div>
  );
}

function MoneyRecordEditForm({
  record,
  creditCards,
  amountInput,
  onAmountInputChange,
  onAmountInputClear,
  onRecordsChange,
  onDelete,
}: {
  record: MoneyRecord;
  creditCards: CreditCardSetting[];
  amountInput: string;
  onAmountInputChange: (value: string) => void;
  onAmountInputClear: () => void;
  onRecordsChange: React.Dispatch<React.SetStateAction<MoneyRecord[]>>;
  onDelete: () => void;
}) {
  const updateRecord = (updater: (record: MoneyRecord) => MoneyRecord) => {
    onRecordsChange((current) => current.map((item) => (item.id === record.id ? updater(item) : item)));
  };

  return (
    <div className="form-card">
      <div className="form-heading">
        <h3>お金の記録を編集</h3>
        <span>{record.date}</span>
      </div>
      <div className="editable-setting-grid">
        <label>
          種類
          <select
            value={record.type}
            onChange={(event) =>
              updateRecord((item) => ({
                ...item,
                type: event.target.value as MoneyRecord['type'],
                isCreditCard: event.target.value === 'expense' ? item.isCreditCard : false,
                creditCardId: event.target.value === 'expense' ? item.creditCardId : undefined,
                updatedAt: new Date().toISOString(),
              }))
            }
          >
            <option value="expense">支出</option>
            <option value="income">収入</option>
          </select>
        </label>
        <label>
          金額
          <input
            type="number"
            min="1"
            value={amountInput}
            onChange={(event) => {
              const nextAmount = parseMoneyAmount(event.target.value);
              onAmountInputChange(event.target.value);
              if (!nextAmount) return;

              updateRecord((item) => ({ ...item, amount: nextAmount, updatedAt: new Date().toISOString() }));
            }}
            onBlur={onAmountInputClear}
          />
        </label>
        <label>
          カテゴリ
          <input
            value={record.category}
            onChange={(event) =>
              updateRecord((item) => ({ ...item, category: event.target.value, updatedAt: new Date().toISOString() }))
            }
          />
        </label>
        <label>
          メモ
          <textarea
            value={record.memo ?? ''}
            onChange={(event) =>
              updateRecord((item) => ({
                ...item,
                memo: event.target.value || undefined,
                updatedAt: new Date().toISOString(),
              }))
            }
          />
        </label>
        {record.type === 'expense' && (
          <>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={Boolean(record.isCreditCard)}
                onChange={(event) =>
                  updateRecord((item) => ({
                    ...item,
                    isCreditCard: event.target.checked,
                    creditCardId: event.target.checked ? item.creditCardId : undefined,
                    updatedAt: new Date().toISOString(),
                  }))
                }
              />
              クレジットカード
            </label>
            {record.isCreditCard && (
              <label>
                使用カード
                <select
                  value={record.creditCardId ?? ''}
                  onChange={(event) =>
                    updateRecord((item) => ({
                      ...item,
                      creditCardId: event.target.value || undefined,
                      updatedAt: new Date().toISOString(),
                    }))
                  }
                >
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
        <div className="form-delete-zone">
          <button type="button" className="ghost-button danger" onClick={onDelete}>
            削除
          </button>
        </div>
      </div>
    </div>
  );
}

function buildMonthlyCashFlowWarning(
  currentMonthKey: string,
  monthRecords: MoneyRecord[],
  monthPaymentSchedules: ReturnType<typeof buildCreditCardPaymentSchedules>,
  salaryPaymentSchedules: ReturnType<typeof buildSalaryPaymentSchedules>,
  subscriptionPaymentSchedules: ReturnType<typeof buildSubscriptionPaymentSchedules>,
): { date: string; amount: number } | undefined {
  const cashFlows = [
    ...monthRecords
      .filter((record) => record.type === 'income')
      .map((record) => ({ date: record.date, amount: record.amount })),
    ...monthRecords
      .filter((record) => record.type === 'expense' && (!record.isCreditCard || !record.creditCardId))
      .map((record) => ({ date: record.date, amount: -record.amount })),
    ...monthPaymentSchedules.map((schedule) => ({
      date: schedule.paymentDate,
      amount: -schedule.amount,
    })),
    ...salaryPaymentSchedules.map((schedule) => ({
      date: schedule.paymentDate,
      amount: schedule.amount,
    })),
    ...subscriptionPaymentSchedules.map((schedule) => ({
      date: schedule.paymentDate,
      amount: -schedule.amount,
    })),
  ]
    .filter((flow) => flow.date.startsWith(currentMonthKey))
    .sort((a, b) => a.date.localeCompare(b.date));

  let runningBalance = 0;
  let lowestBalance = 0;
  let lowestDate = '';

  cashFlows.forEach((flow) => {
    runningBalance += flow.amount;
    if (runningBalance < lowestBalance) {
      lowestBalance = runningBalance;
      lowestDate = flow.date;
    }
  });

  return lowestBalance < 0 ? { date: lowestDate, amount: lowestBalance } : undefined;
}

function buildCreditCardFailureWarning(
  currentMonthKey: string,
  monthRecords: MoneyRecord[],
  monthPaymentSchedules: ReturnType<typeof buildCreditCardPaymentSchedules>,
  salaryPaymentSchedules: ReturnType<typeof buildSalaryPaymentSchedules>,
  subscriptionPaymentSchedules: ReturnType<typeof buildSubscriptionPaymentSchedules>,
  threshold: number,
): { date: string; balance: number } | undefined {
  const cashFlows = [
    ...monthRecords
      .filter((record) => record.type === 'income')
      .map((record) => ({ date: record.date, amount: record.amount, kind: 'income' as const })),
    ...monthRecords
      .filter((record) => record.type === 'expense' && (!record.isCreditCard || !record.creditCardId))
      .map((record) => ({ date: record.date, amount: -record.amount, kind: 'expense' as const })),
    ...salaryPaymentSchedules.map((schedule) => ({
      date: schedule.paymentDate,
      amount: schedule.amount,
      kind: 'salary' as const,
    })),
    ...subscriptionPaymentSchedules.map((schedule) => ({
      date: schedule.paymentDate,
      amount: -schedule.amount,
      kind: 'subscription' as const,
    })),
    ...monthPaymentSchedules.map((schedule) => ({
      date: schedule.paymentDate,
      amount: -schedule.amount,
      kind: 'credit-card' as const,
    })),
  ]
    .filter((flow) => flow.date.startsWith(currentMonthKey))
    .sort((a, b) => {
      const dateOrder = a.date.localeCompare(b.date);
      if (dateOrder !== 0) return dateOrder;
      if (a.kind === 'credit-card' && b.kind !== 'credit-card') return 1;
      if (a.kind !== 'credit-card' && b.kind === 'credit-card') return -1;
      return 0;
    });

  let runningBalance = 0;

  for (const flow of cashFlows) {
    runningBalance += flow.amount;

    if (flow.kind === 'credit-card' && runningBalance < threshold) {
      return { date: flow.date, balance: runningBalance };
    }
  }

  return undefined;
}

function buildFutureCreditCardWarning({
  currentMonthKey,
  records,
  events,
  partTimeJobs,
  creditCards,
  subscriptions,
  paymentSchedules,
  threshold,
}: {
  currentMonthKey: string;
  records: MoneyRecord[];
  events: CalendarEvent[];
  partTimeJobs: PartTimeJob[];
  creditCards: CreditCardSetting[];
  subscriptions: Subscription[];
  paymentSchedules: ReturnType<typeof buildCreditCardPaymentSchedules>;
  threshold: number;
}): { paymentDate: string; balance: number } | undefined {
  const futureMonthKeys = [moveMonthKey(currentMonthKey, 1), moveMonthKey(currentMonthKey, 2)];
  const futureSalarySchedules = futureMonthKeys.flatMap((monthKey) =>
    buildSalaryPaymentSchedules(events, partTimeJobs, monthKey),
  );
  const futureSubscriptionSchedules = futureMonthKeys.flatMap((monthKey) =>
    buildSubscriptionPaymentSchedules(subscriptions, monthKey, creditCards),
  );
  const currentMonthCreditCardRecordIds = new Set(
    records
      .filter(
        (record) =>
          record.date.startsWith(currentMonthKey) &&
          record.type === 'expense' &&
          record.isCreditCard &&
          record.creditCardId,
      )
      .map((record) => record.id),
  );
  const futurePaymentSchedules = paymentSchedules.filter(
    (schedule) =>
      schedule.paymentDate > `${currentMonthKey}-31` &&
      schedule.records.some((record) => currentMonthCreditCardRecordIds.has(record.id)),
  );

  for (const futureMonthKey of futureMonthKeys) {
    const monthRecords = records.filter((record) => record.date.startsWith(futureMonthKey));
    const monthPaymentSchedules = paymentSchedules.filter((schedule) =>
      schedule.paymentDate.startsWith(futureMonthKey),
    );
    const monthSalarySchedules = futureSalarySchedules.filter((schedule) =>
      schedule.paymentDate.startsWith(futureMonthKey),
    );
    const monthSubscriptionSchedules = futureSubscriptionSchedules.filter((schedule) =>
      schedule.paymentDate.startsWith(futureMonthKey),
    );
    const warning = buildCreditCardFailureWarning(
      futureMonthKey,
      monthRecords,
      monthPaymentSchedules,
      monthSalarySchedules,
      monthSubscriptionSchedules,
      threshold,
    );

    if (!warning) continue;
    if (!futurePaymentSchedules.some((schedule) => schedule.paymentDate === warning.date)) continue;

    return { paymentDate: warning.date, balance: warning.balance };
  }

  return undefined;
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
  monthLabel,
  balance,
  incomeTotal,
  expenseTotal,
}: {
  monthLabel: string;
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
        <span>{monthLabel}の貯金箱</span>
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

function SalaryScheduleList({
  schedules,
  emptyText,
}: {
  schedules: ReturnType<typeof buildSalaryPaymentSchedules>;
  emptyText: string;
}) {
  if (schedules.length === 0) {
    return <p className="helper-text">{emptyText}</p>;
  }

  return (
    <div className="payment-list">
      {schedules.map((schedule) => (
        <article key={schedule.id} className="payment-item salary-item">
          <div>
            <span>{schedule.paymentDate}</span>
            <h4>{schedule.jobName}</h4>
            <p>
              {Math.floor(schedule.minutes / 60)}時間{schedule.minutes % 60}分 / {schedule.events.length}件
              {schedule.lateNightMinutes > 0
                ? ` / 深夜 ${Math.floor(schedule.lateNightMinutes / 60)}時間${schedule.lateNightMinutes % 60}分`
                : ''}
              {schedule.breakMinutes > 0 ? ` / 休憩 ${schedule.breakMinutes}分` : ''}
            </p>
          </div>
          <strong>{schedule.amount > 0 ? `${schedule.amount.toLocaleString()}円` : '金額未設定'}</strong>
        </article>
      ))}
    </div>
  );
}

function SubscriptionScheduleList({
  schedules,
  emptyText,
}: {
  schedules: ReturnType<typeof buildSubscriptionPaymentSchedules>;
  emptyText: string;
}) {
  if (schedules.length === 0) {
    return <p className="helper-text">{emptyText}</p>;
  }

  return (
    <div className="payment-list">
      {schedules.map((schedule) => (
        <article key={schedule.id} className="payment-item subscription-item">
          <div>
            <span>{schedule.paymentDate}</span>
            <h4>{schedule.name}</h4>
            <p>{schedule.memo ? `${schedule.category} / ${schedule.memo}` : schedule.category}</p>
            {schedule.creditCardName && <p>カード: {schedule.creditCardName} / 請求日 {schedule.billingDate}</p>}
          </div>
          <strong>{schedule.amount.toLocaleString()}円</strong>
        </article>
      ))}
    </div>
  );
}
