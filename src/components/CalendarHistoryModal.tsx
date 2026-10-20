import { useEffect, useRef, useState } from 'react';
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
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const requestSerial = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void fetchCalendarHistory(calendarId, writeToken)
      .then((history) => { if (!cancelled) setEntries(history); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : '履歴を取得できませんでした。'); });
    return () => { cancelled = true; };
  }, [calendarId, writeToken]);

  const selectVersion = async (version: number) => {
    const serial = ++requestSerial.current;
    setSelectedVersion(version);
    setShowRestoreConfirm(false);
    setPreview(null);
    setError('');
    setBusy(true);
    try {
      const result = await fetchCalendarHistoryPreview(calendarId, writeToken, version);
      if (requestSerial.current === serial) setPreview(result);
    } catch (reason) {
      if (requestSerial.current === serial) setError(reason instanceof Error ? reason.message : 'プレビューの取得に失敗しました。');
    } finally {
      if (requestSerial.current === serial) setBusy(false);
    }
  };

  const restore = async () => {
    if (!canRestore || !preview || busy) return;
    if (!showRestoreConfirm) { setShowRestoreConfirm(true); return; }
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


  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [busy, onClose]);

  const latestVersion = entries[0]?.version;
  const latestWasRestore = entries[0]?.operation === 'restore';
  // The immediately preceding version is the snapshot that existed before
  // the latest restore. Selecting it creates another version (undo restore).
  const beforeLatestRestore = latestWasRestore ? entries.find((entry) => entry.version === (latestVersion ?? 0) - 1) : undefined;

  return (
    <div className="modal-backdrop history-backdrop" role="presentation" onClick={() => { if (!busy) onClose(); }}>
      <section className="history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-dialog-title"
        onClick={(event) => event.stopPropagation()}>
        <header className="history-dialog-header">
          <div>
            <span className="history-eyebrow">VERSION HISTORY</span>
            <h2 id="history-dialog-title">変更履歴・復元</h2>
            <p>復元しても今の状態は履歴に保存されます。過去の状態への再復元も可能です。</p>
          </div>
          <button type="button" className="history-close-button" onClick={onClose} disabled={busy} aria-label="履歴を閉じる">×</button>
        </header>
        {error && <p role="alert" className="history-error">{error}</p>}
        <div className="history-dialog-grid">
          <div className="history-list-pane">
            <h3>履歴一覧 <span className="history-count">{entries.length}件</span></h3>
            {beforeLatestRestore && (
              <button type="button" className="history-undo-shortcut" disabled={busy}
                onClick={() => { void selectVersion(beforeLatestRestore.version); }}>
                ↶ 直前の復元を取り消す（Version {beforeLatestRestore.version}）
              </button>
            )}
            {entries.length === 0 && !error && <p className="history-empty">まだ履歴がありません。</p>}
            <div className="history-entries">
              {entries.map((entry) => (
                <button key={entry.version} type="button" className="history-entry"
                  aria-pressed={selectedVersion === entry.version} disabled={busy}
                  onClick={() => { void selectVersion(entry.version); }}>
                  <span className="history-entry-main">
                    <strong>Version {entry.version}</strong>
                    <span className={entry.operation === 'restore' ? 'history-operation is-restore' : 'history-operation'}>
                      {entry.operation === 'restore' ? '復元' : '保存'}
                    </span>
                  </span>
                  <time className="history-entry-date">{displayDate(entry.createdAt)}</time>
                  {entry.operation === 'restore' && entry.restoredFromVersion !== null && (
                    <span className="history-source">Version {entry.restoredFromVersion} から復元</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="history-preview-pane">
            <h3>プレビュー</h3>
            {busy && <p className="history-empty" role="status">処理中です…</p>}
            {!busy && !preview && <p className="history-empty">左側からVersionを選ぶと、保存された状態を確認できます。</p>}
            {preview && !busy && (
              <div className="history-preview">
                <div className="history-preview-title">
                  <strong>Version {preview.version}</strong>
                  <span>{displayDate(preview.createdAt)}</span>
                </div>
                {preview.operation === 'restore' && <p className="history-note">
                  Version {preview.restoredFromVersion} から復元された履歴です。
                </p>}
                <div className="history-stats">
                  <span>予定 <strong>{preview.snapshot.events.length}件</strong></span>
                  <span>家計 <strong>{preview.snapshot.moneyRecords.length}件</strong></span>
                  <span>ラブログ <strong>{preview.snapshot.loveLogs.length}件</strong></span>
                  <span>写真 <strong>{preview.snapshot.dailyPhotos.length}件</strong></span>
                  <span>タグ <strong>{preview.snapshot.tags.length}件</strong></span>
                </div>
                <section className="history-restore-panel">
                  <h4>この状態へ復元</h4>
                  <p>予定や家計などカレンダー全体を置き換え、新しいVersionとして保存します。復元前の状態も履歴から選択して戻せます（保存上限は50世代）。</p>
                  {!canRestore && <p className="history-error" role="status">未保存の変更・オフライン・同期エラーがあるため、復元を停止しています。</p>}
                  {showRestoreConfirm && (
                    <div className="history-confirm">
                      <strong>Version {preview.version}に復元しますか？</strong>
                      <p>最新データ全体を置き換えます。選択したVersionが正しいか確認してください。</p>
                      <button type="button" className="history-cancel" onClick={() => setShowRestoreConfirm(false)}>キャンセル</button>
                    </div>
                  )}
                  <button type="button" className="history-restore-button"
                    disabled={!canRestore || busy}
                    onClick={() => { void restore(); }}>
                    {showRestoreConfirm ? '確認して復元を実行' : 'このVersionへ復元'}
                  </button>
                </section>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
