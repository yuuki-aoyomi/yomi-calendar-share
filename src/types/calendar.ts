export type CalendarMode = 'schedule' | 'money' | 'love';

export type EventCategory = 'schedule' | 'diary' | 'todo' | 'detail' | 'photo';

export type RecurrenceFrequency = 'weekly' | 'monthly';

export type RecurrenceRule = {
  frequency: RecurrenceFrequency;
  interval: number;
  until?: string;
};

export type CalendarTagType = 'person' | 'work' | 'credit-card' | 'custom';

export type CalendarTag = {
  id: string;
  name: string;
  type: CalendarTagType;
  color: string;
  createdAt: string;
  updatedAt: string;
};

export type EventTimelineItem = {
  id: string;
  time: string;
  title: string;
};

export type CalendarEvent = {
  id: string;
  date: string;
  title: string;
  startTime?: string;
  endTime?: string;
  category: EventCategory;
  memo?: string;
  tagIds: string[];
  tags: string[];
  recurrence?: RecurrenceRule;
  timelineItems: EventTimelineItem[];
  done?: boolean;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type PartTimeJob = {
  id: string;
  name: string;
  tagId: string;
  hourlyWage?: number;
  createdAt: string;
  updatedAt: string;
};

export type CreditCardSetting = {
  id: string;
  name: string;
  tagId: string;
  closingDay: number;
  paymentDay: number;
  createdAt: string;
  updatedAt: string;
};

export type MoneyRecord = {
  id: string;
  date: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  memo?: string;
  isCreditCard?: boolean;
  creditCardId?: string;
  createdAt: string;
  updatedAt: string;
};

export type LoveLog = {
  id: string;
  date: string;
  title: string;
  memo?: string;
  heartCount: number;
  createdAt: string;
  updatedAt: string;
};
