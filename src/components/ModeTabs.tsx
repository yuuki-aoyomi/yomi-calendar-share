import type { CalendarMode } from '../types/calendar';

type ModeTabsProps = {
  activeMode: CalendarMode;
  onChange: (mode: CalendarMode) => void;
};

const tabs: Array<{ id: CalendarMode; icon: string; label: string; description: string }> = [
  { id: 'schedule', icon: '□', label: '予定', description: '日記・ToDo・写真メモ' },
  { id: 'money', icon: '¥', label: 'お金', description: '収入・支出・月合計' },
  { id: 'love', icon: '♡', label: 'ラブ', description: 'いいところ・ハート' },
];

// 3つの機能を画面遷移なしで切り替えるためのタブです。
export function ModeTabs({ activeMode, onChange }: ModeTabsProps) {
  return (
    <div className="mode-tabs" role="tablist" aria-label="カレンダーモード">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={activeMode === tab.id ? `mode-tab ${tab.id} active` : `mode-tab ${tab.id}`}
          type="button"
          role="tab"
          aria-selected={activeMode === tab.id}
          onClick={() => onChange(tab.id)}
        >
          <strong><span className="mode-tab-icon">{tab.icon}</span>{tab.label}</strong>
          <span>{tab.description}</span>
        </button>
      ))}
    </div>
  );
}
