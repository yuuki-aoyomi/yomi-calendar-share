export type CalendarMode = 'schedule' | 'money' | 'love';

export type EventCategory = 'schedule' | 'diary' | 'todo' | 'detail' | 'photo';

export type CalendarEvent = {
  id: string;
  date: string;
  title: string;
  startTime?: string;
  endTime?: string;
  category: EventCategory;
  memo?: string;
  tags: string[];
  done?: boolean;
  imageUrl?: string;
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
