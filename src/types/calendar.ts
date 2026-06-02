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

export type EventImageMeta = {
  fileName: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  mimeType: string;
  resized?: boolean;
  compressed?: boolean;
};

export type CalendarEvent = {
  id: string;
  date: string;
  title: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  sortOrder?: number;
  category: EventCategory;
  memo?: string;
  tagIds: string[];
  tags: string[];
  recurrence?: RecurrenceRule;
  timelineItems: EventTimelineItem[];
  done?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DailyPhoto = {
  id: string;
  date: string;
  imageUrl: string;
  imageKey?: string;
  memo?: string;
  imageMeta?: EventImageMeta;
  createdAt: string;
  updatedAt: string;
};

export type PartTimeJob = {
  id: string;
  name: string;
  tagId: string;
  hourlyWage?: number;
  lateNightHourlyWage?: number;
  closingDay?: number;
  paymentDay?: number;
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

export type Subscription = {
  id: string;
  name: string;
  amount: number;
  billingCycle?: 'monthly' | 'yearly';
  billingMonth?: number;
  billingDay: number;
  creditCardId?: string;
  category: string;
  memo?: string;
  isActive: boolean;
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

export type AppBackupData = {
  app: 'yomi-calendar-share';
  version: 1;
  exportedAt: string;
  data: {
    events: CalendarEvent[];
    moneyRecords: MoneyRecord[];
    loveLogs: LoveLog[];
    tags: CalendarTag[];
    partTimeJobs: PartTimeJob[];
    creditCards: CreditCardSetting[];
    subscriptions: Subscription[];
    dailyPhotos: DailyPhoto[];
  };
};
