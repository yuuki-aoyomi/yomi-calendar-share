import { useEffect, useState } from 'react';
import type {
  CalendarEvent,
  CalendarTag,
  CalendarTagType,
  EventCategory,
  EventTimelineItem,
  RecurrenceFrequency,
} from '../types/calendar';
import { createId } from '../utils/id';
import { estimateBreakMinutes } from '../utils/salary';
import { sortCalendarTags } from '../utils/tags';

type EventFormProps = {
  selectedDate: string;
  events: CalendarEvent[];
  editingEvent?: CalendarEvent;
  tags: CalendarTag[];
  onSaveEvent: (event: CalendarEvent) => void;
  onCancelEdit: () => void;
  onDeleteEvent?: () => void;
  onTagsChange: React.Dispatch<React.SetStateAction<CalendarTag[]>>;
};

const categoryOptions: Array<{ value: EventCategory; label: string }> = [
  { value: 'schedule', label: '通常予定' },
  { value: 'diary', label: '日記' },
  { value: 'todo', label: 'ToDo' },
  { value: 'detail', label: '細かい予定' },
  { value: 'photo', label: '写真メモ' },
];

const tagTypeOptions: Array<{ value: CalendarTagType; label: string }> = [
  { value: 'person', label: 'User / 人' },
  { value: 'work', label: 'バイト' },
  { value: 'credit-card', label: 'クレカ' },
  { value: 'custom', label: 'その他' },
];

const tagColors: Record<CalendarTagType, string> = {
  person: '#4f8cff',
  work: '#1fbf83',
  'credit-card': '#f5b400',
  custom: '#7c6ee6',
};

type RecurrenceInput = 'none' | RecurrenceFrequency;

const getWorkMinutes = (startTime: string, endTime: string): number => {
  if (!startTime || !endTime) return 0;

  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const start = startHour * 60 + startMinute;
  const rawEnd = endHour * 60 + endMinute;
  const end = rawEnd <= start ? rawEnd + 24 * 60 : rawEnd;

  return Math.max(end - start, 0);
};

// 予定登録用の controlled form です。入力値は React state で管理します。
export function EventForm({
  selectedDate,
  events,
  editingEvent,
  tags,
  onSaveEvent,
  onCancelEdit,
  onDeleteEvent,
  onTagsChange,
}: EventFormProps) {
  const [title, setTitle] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [breakMinutes, setBreakMinutes] = useState('');
  const [category, setCategory] = useState<EventCategory>('schedule');
  const [memo, setMemo] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagType, setNewTagType] = useState<CalendarTagType>('custom');
  const [newTagColor, setNewTagColor] = useState(tagColors.custom);
  const [recurrence, setRecurrence] = useState<RecurrenceInput>('none');
  const [recurrenceUntil, setRecurrenceUntil] = useState('');
  const [timelineItems, setTimelineItems] = useState<EventTimelineItem[]>([]);
  const [timelineTime, setTimelineTime] = useState('');
  const [timelineTitle, setTimelineTitle] = useState('');
  const isEditing = Boolean(editingEvent);
  const eventStartDate = editingEvent?.date ?? selectedDate;
  const orderedTags = sortCalendarTags(tags);
  const eventSuggestions = events
    .filter((event, index, source) => {
      if (isEditing) return false;
      const normalizedTitle = title.trim().toLowerCase();
      const isTitleMatched = normalizedTitle
        ? event.title.toLowerCase().includes(normalizedTitle)
        : index < 5;
      const isFirstSameTitle = source.findIndex((item) => item.title === event.title) === index;

      return isTitleMatched && isFirstSameTitle;
    })
    .slice(0, 5);

  const resetForm = () => {
    setTitle('');
    setEndDate('');
    setStartTime('');
    setEndTime('');
    setBreakMinutes('');
    setCategory('schedule');
    setMemo('');
    setSelectedTagIds([]);
    setRecurrence('none');
    setRecurrenceUntil('');
    setTimelineItems([]);
    setTimelineTime('');
    setTimelineTitle('');
  };

  useEffect(() => {
    if (!editingEvent) {
      resetForm();
      return;
    }

    setTitle(editingEvent.title);
    setEndDate(editingEvent.endDate ?? '');
    setStartTime(editingEvent.startTime ?? '');
    setEndTime(editingEvent.endTime ?? '');
    setBreakMinutes(
      editingEvent.breakMinutes === undefined ? '' : String(editingEvent.breakMinutes),
    );
    setCategory(editingEvent.category);
    setMemo(editingEvent.memo ?? '');
    setSelectedTagIds(editingEvent.tagIds ?? []);
    setRecurrence(editingEvent.recurrence?.frequency ?? 'none');
    setRecurrenceUntil(editingEvent.recurrence?.until ?? '');
    setTimelineItems(editingEvent.timelineItems ?? []);
    setTimelineTime('');
    setTimelineTitle('');
  }, [editingEvent]);

  const handleToggleTag = (tagId: string) => {
    setSelectedTagIds((current) =>
      current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId],
    );
  };

  const handleCreateTag = () => {
    const name = newTagName.trim();
    if (!name) return;

    const duplicatedTag = tags.find((tag) => tag.name === name && tag.type === newTagType);
    if (duplicatedTag) {
      handleToggleTag(duplicatedTag.id);
      setNewTagName('');
      return;
    }

    const now = new Date().toISOString();
    const tag: CalendarTag = {
      id: createId(),
      name,
      type: newTagType,
      color: newTagColor,
      createdAt: now,
      updatedAt: now,
    };

    onTagsChange((current) => [...current, tag]);
    setSelectedTagIds((current) => [...current, tag.id]);
    setNewTagName('');
  };

  const handleRemoveTagFromEvent = (tagId: string) => {
    setSelectedTagIds((current) => current.filter((id) => id !== tagId));
  };

  const handleApplySuggestion = (suggestion: CalendarEvent) => {
    setTitle(suggestion.title);
    setEndDate(suggestion.endDate ?? '');
    setStartTime(suggestion.startTime ?? '');
    setEndTime(suggestion.endTime ?? '');
    setBreakMinutes(
      suggestion.breakMinutes === undefined ? '' : String(suggestion.breakMinutes),
    );
    setCategory(suggestion.category);
    setMemo(suggestion.memo ?? '');
    setSelectedTagIds(suggestion.tagIds ?? []);
    setRecurrence(suggestion.recurrence?.frequency ?? 'none');
    setRecurrenceUntil(suggestion.recurrence?.until ?? '');
    setTimelineItems(suggestion.timelineItems ?? []);
  };

  const handleAddTimelineItem = () => {
    if (!timelineTime || !timelineTitle.trim()) return;

    setTimelineItems((current) =>
      [...current, { id: createId(), time: timelineTime, title: timelineTitle.trim() }].sort((a, b) =>
        a.time.localeCompare(b.time),
      ),
    );
    setTimelineTime('');
    setTimelineTitle('');
  };

  const handleDeleteTimelineItem = (id: string) => {
    setTimelineItems((current) => current.filter((item) => item.id !== id));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;

    const now = new Date().toISOString();
    const selectedTagNames = orderedTags
      .filter((tag) => selectedTagIds.includes(tag.id))
      .map((tag) => tag.name);
    const parsedBreakMinutes = Number(breakMinutes);
    const normalizedEndDate = endDate && endDate >= eventStartDate ? endDate : undefined;

    onSaveEvent({
      id: editingEvent?.id ?? createId(),
      date: eventStartDate,
      endDate: normalizedEndDate,
      title: title.trim(),
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      breakMinutes:
        breakMinutes.trim() && Number.isInteger(parsedBreakMinutes) && parsedBreakMinutes >= 0
          ? parsedBreakMinutes
          : undefined,
      sortOrder: editingEvent?.sortOrder,
      category,
      memo: memo.trim() || undefined,
      tagIds: selectedTagIds,
      tags: selectedTagNames,
      recurrence:
        recurrence === 'none'
          ? undefined
          : {
              frequency: recurrence,
              interval: 1,
              until: recurrenceUntil || undefined,
            },
      timelineItems,
      done: category === 'todo' ? editingEvent?.done ?? false : undefined,
      createdAt: editingEvent?.createdAt ?? now,
      updatedAt: now,
    });

    resetForm();
    if (isEditing) onCancelEdit();
  };

  const hasWorkTag = tags.some((tag) => selectedTagIds.includes(tag.id) && tag.type === 'work');
  const autoBreakMinutes = estimateBreakMinutes(getWorkMinutes(startTime, endTime));

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <div className="form-heading">
        <h3>{isEditing ? '予定を編集' : '予定を追加'}</h3>
        <span>{isEditing ? 'シリーズ全体' : selectedDate}</span>
      </div>

      <label>
        タイトル
        <input
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="例: バイト"
        />
      </label>

      {eventSuggestions.length > 0 && (
        <div className="suggestion-box">
          <div className="form-heading small">
            <h4>もしかしてこれ？</h4>
            <span>過去の予定から入力</span>
          </div>
          <div className="suggestion-list">
            {eventSuggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                className="suggestion-button"
                onClick={() => handleApplySuggestion(suggestion)}
              >
                <strong>{suggestion.title}</strong>
                <span>
                  {suggestion.startTime || '--:--'} - {suggestion.endTime || '--:--'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="form-grid">
        <label>
          終了日
          <input
            type="date"
            min={eventStartDate}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
        <label>
          開始
          <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
        </label>
        <label>
          終了
          <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
        </label>
      </div>

      {hasWorkTag && (
        <label>
          休憩時間（分）
          <input
            type="number"
            min="0"
            value={breakMinutes}
            onChange={(event) => setBreakMinutes(event.target.value)}
            placeholder={`自動: ${autoBreakMinutes}分`}
          />
          <span className="helper-text">未入力なら勤務時間から自動計算します。入力するとこの予定だけ上書きします。</span>
        </label>
      )}

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

      <div className="form-grid">
        <label>
          繰り返し
          <select value={recurrence} onChange={(event) => setRecurrence(event.target.value as RecurrenceInput)}>
            <option value="none">なし</option>
            <option value="weekly">毎週</option>
            <option value="monthly">毎月</option>
          </select>
        </label>
        <label>
          終了日
          <input
            type="date"
            value={recurrenceUntil}
            disabled={recurrence === 'none'}
            onChange={(event) => setRecurrenceUntil(event.target.value)}
          />
        </label>
      </div>

      <label>
        メモ
        <textarea value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="日記や補足を書けます" />
      </label>

      <div className="field-group timeline-editor">
        <div className="form-heading small">
          <h4>タイムスケジュール</h4>
          <span>予定内の流れ</span>
        </div>
        <div className="timeline-create-row">
          <input type="time" value={timelineTime} onChange={(event) => setTimelineTime(event.target.value)} />
          <input
            value={timelineTitle}
            onChange={(event) => setTimelineTitle(event.target.value)}
            placeholder="例: 開場・準備"
          />
          <button type="button" className="ghost-button" onClick={handleAddTimelineItem}>
            追加
          </button>
        </div>
        {timelineItems.length > 0 && (
          <div className="timeline-preview">
            {timelineItems.map((item) => (
              <div className="timeline-preview-item" key={item.id}>
                <span>{item.time}</span>
                <strong>{item.title}</strong>
                <button type="button" className="ghost-button danger" onClick={() => handleDeleteTimelineItem(item.id)}>
                  削除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="field-group">
        <div className="form-heading small">
          <h4>タグ</h4>
          <span>選択・作成・削除できます</span>
        </div>

        {tags.length === 0 ? (
          <p className="helper-text">まだタグがありません。下の入力欄から作成してください。</p>
        ) : (
          <div className="tag-picker">
            {orderedTags.map((tag) => (
              <span
                key={tag.id}
                className={selectedTagIds.includes(tag.id) ? 'tag-option active' : 'tag-option'}
                style={{ borderColor: tag.color }}
              >
                <button type="button" className="tag-toggle-button" onClick={() => handleToggleTag(tag.id)}>
                  <span style={{ background: tag.color }} />
                  {tag.name}
                </button>
                {selectedTagIds.includes(tag.id) && (
                  <button
                    type="button"
                    className="tag-delete-button"
                    aria-label={`${tag.name} をこの予定から外す`}
                    onClick={() => handleRemoveTagFromEvent(tag.id)}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        <div className="tag-create-row">
          <select
            value={newTagType}
            onChange={(event) => {
              const nextType = event.target.value as CalendarTagType;
              setNewTagType(nextType);
              setNewTagColor(tagColors[nextType]);
            }}
          >
            {tagTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="color-input-row">
            <input
              type="color"
              value={newTagColor}
              aria-label="タグの色"
              onChange={(event) => setNewTagColor(event.target.value)}
            />
            <span className="color-preview-chip">
              <i style={{ background: newTagColor }} />
              {newTagColor}
            </span>
          </div>
          <input value={newTagName} onChange={(event) => setNewTagName(event.target.value)} placeholder="例: UserA / バイトA" />
          <button type="button" className="ghost-button" onClick={handleCreateTag}>
            作成
          </button>
        </div>
      </div>

      <div className="form-actions">
        <button
          className="ghost-button"
          type="button"
          onClick={() => {
            resetForm();
            onCancelEdit();
          }}
        >
          キャンセル
        </button>
        <button className="primary-button" type="submit">
          {isEditing ? '保存する' : '追加する'}
        </button>
      </div>
      {isEditing && onDeleteEvent && (
        <div className="form-delete-zone">
          <button type="button" className="ghost-button danger" onClick={onDeleteEvent}>
            削除
          </button>
        </div>
      )}
    </form>
  );
}
