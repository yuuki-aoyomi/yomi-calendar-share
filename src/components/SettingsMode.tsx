import { useState } from 'react';
import type { AppBackupData } from '../types/calendar';
import { createBackupData, downloadBackupFile, readBackupFile } from '../utils/backup';

type SettingsModeProps = {
  theme: 'light' | 'dark';
  backupData: AppBackupData['data'];
  onImportBackup: (data: AppBackupData['data']) => void;
  onThemeChange: (theme: 'light' | 'dark') => void;
};

export function SettingsMode({ theme, backupData, onImportBackup, onThemeChange }: SettingsModeProps) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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

  return (
    <div className="mode-content">
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
