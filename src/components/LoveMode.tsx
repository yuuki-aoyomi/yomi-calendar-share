import { useMemo, useState } from 'react';
import type { LoveLog } from '../types/calendar';
import { createId } from '../utils/id';

type LoveModeProps = {
  selectedDate: string;
  currentMonthKey: string;
  logs: LoveLog[];
  onLogsChange: React.Dispatch<React.SetStateAction<LoveLog[]>>;
};

const monthlyHeartGoal = 100;

export function LoveMode({ selectedDate, currentMonthKey, logs, onLogsChange }: LoveModeProps) {
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [heartCount, setHeartCount] = useState(1);

  const monthLogs = useMemo(
    () => logs.filter((log) => log.date.startsWith(currentMonthKey)),
    [logs, currentMonthKey],
  );
  const selectedLogs = monthLogs.filter((log) => log.date === selectedDate);
  const monthHeartTotal = monthLogs.reduce((sum, log) => sum + log.heartCount, 0);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;

    const now = new Date().toISOString();
    onLogsChange((current) => [
      ...current,
      {
        id: createId(),
        date: selectedDate,
        title: title.trim(),
        memo: memo.trim() || undefined,
        heartCount,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    setTitle('');
    setMemo('');
    setHeartCount(1);
  };

  return (
    <div className="mode-content">
      <article className="heart-meter">
        <div className="heart-bank-icon" aria-hidden="true">
          ♥
        </div>
        <div className="heart-bank-main">
          <span>今月のハート貯金</span>
          <strong>{monthHeartTotal} / {monthlyHeartGoal}</strong>
          <div className="heart-track">
            <div style={{ width: `${Math.min((monthHeartTotal / monthlyHeartGoal) * 100, 100)}%` }} />
          </div>
          <p>ラブログを保存すると、ここにハートが貯まります。</p>
        </div>
      </article>

      <div className="two-column">
        <form className="form-card" onSubmit={handleSubmit}>
          <div className="form-heading">
            <h3>ラブログを追加</h3>
            <span>{selectedDate}</span>
          </div>
          <label>
            タイトル
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例: ありがとうと言ってくれた"
            />
          </label>
          <label>
            メモ
            <textarea value={memo} onChange={(event) => setMemo(event.target.value)} />
          </label>
          <label>
            ハート数
            <input
              type="number"
              min="1"
              max="10"
              value={heartCount}
              onChange={(event) => setHeartCount(Number(event.target.value))}
            />
          </label>
          <button className="primary-button" type="submit">
            保存する
          </button>
        </form>

        <div className="list-stack">
          <div className="section-title">
            <h3>{selectedDate} のラブログ</h3>
            <span>{selectedLogs.length}件</span>
          </div>
          {selectedLogs.length === 0 ? (
            <div className="empty-state">
              <p>この日のラブログはまだありません。</p>
            </div>
          ) : (
            selectedLogs.map((log) => (
              <article className="item-card compact love-item" key={log.id}>
                <div>
                  <span className="heart-count">{'♥'.repeat(log.heartCount)}</span>
                  <h4>{log.title}</h4>
                  {log.memo && <p>{log.memo}</p>}
                </div>
                <button
                  type="button"
                  className="ghost-button danger"
                  onClick={() => onLogsChange((current) => current.filter((item) => item.id !== log.id))}
                >
                  削除
                </button>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
