export type RecurrenceInput = 'none' | 'weekly' | 'monthly';

export type EventFormValidationInput = {
  title: string;
  eventStartDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  recurrence: RecurrenceInput;
  recurrenceUntil: string;
  timelineTime: string;
  timelineTitle: string;
};

export type EventFormField = keyof EventFormValidationInput;
export type EventFormErrors = Partial<Record<EventFormField, string>>;

export const normalizeTime = (value: string): string | undefined => {
  const match = /^(\d{1,2}):?(\d{2})$/.exec(value.trim());
  if (!match) return undefined;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return undefined;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const validateTime = (value: string): string | undefined => {
  if (!value.trim()) return undefined;
  return normalizeTime(value)
    ? undefined
    : '時刻が正しくありません。HH:MM または HHMM（00:00〜23:59）で入力してください。';
};

export const validateEventForm = (input: EventFormValidationInput): EventFormErrors => {
  const errors: EventFormErrors = {};

  if (!input.title.trim()) {
    errors.title = 'タイトルを入力してください。';
  }

  if (input.endDate && input.endDate < input.eventStartDate) {
    errors.endDate = `終了日は開始日（${input.eventStartDate}）以降を指定してください。`;
  }

  const startTimeError = validateTime(input.startTime);
  if (startTimeError) errors.startTime = startTimeError;

  const endTimeError = validateTime(input.endTime);
  if (endTimeError) errors.endTime = endTimeError;

  if (input.breakMinutes.trim()) {
    const parsed = Number(input.breakMinutes);
    if (!Number.isInteger(parsed) || parsed < 0) {
      errors.breakMinutes = '休憩時間は0以上の整数で入力してください。';
    }
  }

  if (
    input.recurrence !== 'none' &&
    input.recurrenceUntil &&
    input.recurrenceUntil < input.eventStartDate
  ) {
    errors.recurrenceUntil = `繰り返し終了日は開始日（${input.eventStartDate}）以降を指定してください。`;
  }

  const hasTimelineDraft = Boolean(input.timelineTime.trim() || input.timelineTitle.trim());
  if (hasTimelineDraft) {
    if (!input.timelineTime.trim()) {
      errors.timelineTime = 'タイムスケジュールの時刻を入力してください。';
    } else {
      const timelineTimeError = validateTime(input.timelineTime);
      if (timelineTimeError) errors.timelineTime = timelineTimeError;
    }

    if (!input.timelineTitle.trim()) {
      errors.timelineTitle = 'タイムスケジュールの内容を入力してください。';
    }
  }

  return errors;
};
