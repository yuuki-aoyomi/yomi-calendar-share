import assert from 'node:assert/strict';
import test from 'node:test';
import type { CalendarEvent, MoneyRecord } from '../src/types/calendar.ts';
import { searchCalendarData } from '../src/utils/search.ts';

const event = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'event',
  date: '2026-10-18',
  title: '大学',
  category: 'schedule',
  tagIds: [],
  tags: [],
  timelineItems: [],
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

const money = (overrides: Partial<MoneyRecord>): MoneyRecord => ({
  id: 'money',
  date: '2026-10-18',
  type: 'expense',
  amount: 1000,
  category: '食費',
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

test('full text search spans event title memo tags and money category memo', () => {
  const events = [
    event({ id: 'title', title: '大学作業' }),
    event({ id: 'memo', title: '予定', memo: '研究室で暗号' }),
    event({ id: 'tag', title: '予定2', tags: ['セキュリティ'] }),
  ];
  const records = [money({ id: 'food', category: '食費', memo: 'ラーメン' })];

  assert.deepEqual(searchCalendarData(events, records, { query: '大学' }).map((item) => item.id), ['title']);
  assert.deepEqual(searchCalendarData(events, records, { query: '暗号' }).map((item) => item.id), ['memo']);
  assert.deepEqual(searchCalendarData(events, records, { query: 'セキュリティ' }).map((item) => item.id), ['tag']);
  assert.deepEqual(searchCalendarData(events, records, { query: 'ラーメン' }).map((item) => item.id), ['food']);
});

test('event filters combine tag category todo state and date range', () => {
  const events = [
    event({ id: 'wanted', date: '2026-10-15', category: 'todo', done: false, tagIds: ['work'] }),
    event({ id: 'done', date: '2026-10-15', category: 'todo', done: true, tagIds: ['work'] }),
    event({ id: 'wrong-tag', date: '2026-10-15', category: 'todo', done: false, tagIds: ['other'] }),
    event({ id: 'outside', date: '2026-11-01', category: 'todo', done: false, tagIds: ['work'] }),
  ];

  const results = searchCalendarData(events, [], {
    tagIds: ['work'],
    categories: ['todo'],
    todoDone: false,
    dateFrom: '2026-10-01',
    dateTo: '2026-10-31',
  });

  assert.deepEqual(results.map((item) => item.id), ['wanted']);
});

test('money filters combine type card amount and date range', () => {
  const records = [
    money({ id: 'wanted', date: '2026-10-20', amount: 2500, type: 'expense', creditCardId: 'card-a' }),
    money({ id: 'cheap', date: '2026-10-20', amount: 300, type: 'expense', creditCardId: 'card-a' }),
    money({ id: 'other-card', date: '2026-10-20', amount: 2500, type: 'expense', creditCardId: 'card-b' }),
    money({ id: 'income', date: '2026-10-20', amount: 2500, type: 'income' }),
  ];

  const results = searchCalendarData([], records, {
    moneyType: 'expense',
    creditCardId: 'card-a',
    minAmount: 1000,
    maxAmount: 3000,
    dateFrom: '2026-10-01',
    dateTo: '2026-10-31',
  });

  assert.deepEqual(results.map((item) => item.id), ['wanted']);
});

test('combined results are sorted by newest date then stable presentation keys', () => {
  const results = searchCalendarData(
    [event({ id: 'older', date: '2026-10-17', title: 'B' }), event({ id: 'newer', date: '2026-10-18', title: 'A' })],
    [money({ id: 'money-new', date: '2026-10-18', category: 'C' })],
    {},
  );

  assert.deepEqual(results.map((item) => item.id), ['newer', 'money-new', 'older']);
});

test('type-specific filters do not leak results from the other data type', () => {
  const events = [event({ id: 'event', category: 'todo', done: false, tagIds: ['work'] })];
  const records = [money({ id: 'record', type: 'expense', creditCardId: 'card-a', amount: 1500 })];

  assert.deepEqual(searchCalendarData(events, records, { categories: ['todo'] }).map((item) => item.id), ['event']);
  assert.deepEqual(searchCalendarData(events, records, { tagIds: ['work'] }).map((item) => item.id), ['event']);
  assert.deepEqual(searchCalendarData(events, records, { todoDone: false }).map((item) => item.id), ['event']);
  assert.deepEqual(searchCalendarData(events, records, { moneyType: 'expense' }).map((item) => item.id), ['record']);
  assert.deepEqual(searchCalendarData(events, records, { creditCardId: 'card-a' }).map((item) => item.id), ['record']);
  assert.deepEqual(searchCalendarData(events, records, { minAmount: 1000 }).map((item) => item.id), ['record']);
  assert.deepEqual(searchCalendarData(events, records, { maxAmount: 2000 }).map((item) => item.id), ['record']);
  assert.deepEqual(searchCalendarData(events, records, { categories: ['todo'], moneyType: 'expense' }), []);
  assert.deepEqual(searchCalendarData(events, records, {} ).map((item) => item.id), ['event', 'record']);
});
