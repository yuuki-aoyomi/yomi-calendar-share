import { useEffect, useState } from 'react';
import {
  fetchCalendarHistory, fetchCalendarHistoryPreview, getLoadedCalendarVersion, restoreCalendarVersion,
  type CalendarHistoryEntry, type CalendarHistoryPreview,
} from '../api/calendarApi';

type Props = {
  calendarId: string;
  writeToken: string;
  canRestore: boolean;
  onClose: () => void;
  onRestored: () => void;
};

const displayDate = (value: string): string => {
  const parsed = new Date(value.replace(' ', 'T') + (value.includes('Z') || value.includes('+') ? '' : 'Z'));
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('ja-JP');
};

export function CalendarHistoryModal({ calendarId, writeToken, canRestore, onClose, onRestored }: Props) {
  const [entries, setEntries] = useState<CalendarHistoryEntry[]>([]);
  const [preview, setPreview] = useState<CalendarHistoryPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchCalendarHistory(calendarId, writeToken)
      .then((history) => { if (!cancelled) setEntries(history); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : '履歴を取得できませんでした。'); });
    return () => { cancelled = true; };
  }, [calendarId, writeToken]);

  const selectVersion = async (version: number) => {
    setSelectedVersion(version);
    setPreview(null);
    setError('');
    setBusy(true);
    try {
      const result = await fetchCalendarHistoryPreview(calendarId, writeToken, version);
      setPreview((existing) => existing?.version === version ? existing : result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'プレビューの取得に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!canRestore || !preview || busy) return;
    if (!window.confirm(`Version ${preview.version} の状態へカレンダー全体を復元します。現在の変更は新しい履歴に残ります。続行しますか？`)) return;
    setBusy(true);
    setError('');
    try {
      // Use this tab's loaded version, never the latest fetched version.
      // This prevents silently overwriting changes made by another device.
      const expectedVersion = getLoadedCalendarVersion(calendarId);
      if (expectedVersion === undefined) throw new Error('読み込み済みVersionが不明です。再読み込みしてください。');
      await restoreCalendarVersion(calendarId, writeToken, preview.version, expectedVersion);
      onRestored();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '復元に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-label="カレンダー変更履歴"
        onClick={(event) => event.stopPropagation()} style={{ maxWidth: 760, maxHeight: '85vh', overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <h2>変更履歴・復元</h2>
          <button type="button" onClick={onClose} aria-label="履歴を閉じる">閉じる</button>
        </div>
        <p className="helper-text">直近50世代を表示します。復元すると過去の状態を新しいVersionとして保存します。</p>
        {!canRestore && <p role="status">未保存の変更・同期エラー・オフライン状態があるため復元を停止しています。</p>}
        {error && <p role="alert" style={{ color: '#d45a5a' }}>{error}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) minmax(180px, 1fr)', gap: 20 }}>
          <div>
            <h3>履歴一覧</h3>
            {entries.length === 0 && !error && <p>履歴がありません。</p>}
            {entries.map((entry) => (
              <button key={entry.version} type="button" disabled={busy}
                aria-pressed={selectedVersion === entry.version}
                onClick={() => { void selectVersion(entry.version); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 8, padding: 10 }}>
                Version {entry.version} ・ {entry.operation === 'restore' ? '復元' : '保存'}
                <small style={{ display: 'block' }}>{displayDate(entry.createdAt)}</small>
              </button>
            ))}
          </div>
          <div>
            <h3>プレビュー</h3>
            {busy && <p role="status">処理中です…</p>}
            {preview && !busy && (
              <div>
                <p>Version {preview.version} ({displayDate(preview.createdAt)})</p>
                <p>予定: {preview.snapshot.events.length}件</p>
                <p>家計: {preview.snapshot.moneyRecords.length}件</p>
                <p>ラブログ: {preview.snapshot.loveLogs.length}件</p>
                <p>写真: {preview.snapshot.dailyPhotos.length}件</p>
                <p>タグ: {preview.snapshot.tags.length}件</p>
                <p className="helper-text">復元対象は予定だけでなく、カレンダーの全データです。</p>
                <button type="button" disabled={!canRestore || busy}
                  onClick={() => { void restore(); }}>このVersionへ復元</button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
