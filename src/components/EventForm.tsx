import { useState } from 'react';
import type { CalendarEvent, EventCategory } from '../types/calendar';

type EventFormProps = {
  selectedDate: string;
  onAddEvent: (event: CalendarEvent) => void;
};

const categoryOptions: Array<{ value: EventCategory; label: string }> = [
  { value: 'schedule', label: '通常予定' },
  { value: 'diary', label: '日記' },
  { value: 'todo', label: 'ToDo' },
  { value: 'detail', label: '細かい予定' },
  { value: 'photo', label: '写真メモ' },
];

// 予定登録用の controlled form です。入力値は React state で管理します。
export function EventForm({ selectedDate, onAddEvent }: EventFormProps) {
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [category, setCategory] = useState<EventCategory>('schedule');
  const [memo, setMemo] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;

    const now = new Date().toISOString();
    const tags = tagsText
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    onAddEvent({
      id: crypto.randomUUID(),
      date: selectedDate,
      title: title.trim(),
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      category,
      memo: memo.trim() || undefined,
      tags,
      done: category === 'todo' ? false : undefined,
      imageUrl: imageUrl.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });

    setTitle('');
    setStartTime('');
    setEndTime('');
    setCategory('schedule');
    setMemo('');
    setTagsText('');
    setImageUrl('');
  };

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <div className="form-heading">
        <h3>予定を追加</h3>
        <span>{selectedDate}</span>
      </div>

      <label>
        タイトル
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例: バイト" />
      </label>

      <div className="form-grid">
        <label>
          開始
          <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
        </label>
        <label>
          終了
          <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
        </label>
      </div>

      <label>
        カテゴリ
        <select value={category} onChange={(event) => setCategory(event.target.value as EventCategory)}>
          {categoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        メモ
        <textarea value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="日記や補足を書けます" />
      </label>

      <label>
        タグ
        <input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="例: バイト, 大学" />
      </label>

      <label>
        写真URL / 写真メモ
        <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="画像URLや写真メモ" />
      </label>

      <button className="primary-button" type="submit">
        追加する
      </button>
    </form>
  );
}
