import assert from 'node:assert/strict';
import { createCalendarBackup, parseCalendarBackup } from '../server/core/calendarBackup.ts';
import { getJapaneseHoliday } from '../src/utils/japaneseHolidays.ts';
import test from 'node:test';
import { buildCreditCardPaymentSchedules } from '../src/utils/creditCard.ts';
import { matchesHighlightedTag } from '../src/utils/calendarHighlight.ts';
import type { CalendarEvent, CreditCardSetting, MoneyRecord } from '../src/types/calendar.ts';

const card = (id: string, closingDay: number, paymentDay: number): CreditCardSetting => ({
  id, name: id, tagId: id, closingDay, paymentDay, createdAt: '', updatedAt: '',
});
const expense = (id: string, date: string, amount: number, creditCardId: string, isCreditCard = true): MoneyRecord => ({
  id, date, amount, creditCardId, isCreditCard, type: 'expense', category: 'test', createdAt: '', updatedAt: '',
});
const event = (tagIds: string[]): CalendarEvent => ({
  id: 'event', date: '2026-10-13', title: 'Test', category: 'schedule', tagIds, tags: [], timelineItems: [], createdAt: '', updatedAt: '',
});

test('credit card payments are grouped by card and payment month', () => {
  const cards = [card('A', 15, 10), card('B', 31, 25)];
  const records = [
    expense('1', '2026-10-10', 1000, 'A'),
    expense('2', '2026-10-15', 2000, 'A'),
    expense('3', '2026-10-16', 3000, 'A'),
    expense('4', '2026-10-20', 4000, 'B'),
    expense('5', '2026-10-20', 9000, 'B', false),
    { ...expense('6', '2026-10-20', 9000, 'B'), type: 'income' as const },
  ];
  const schedules = buildCreditCardPaymentSchedules(records, cards);
  assert.deepEqual(schedules.map(({ cardId, paymentDate, amount }) => ({ cardId, paymentDate, amount })), [
    { cardId: 'A', paymentDate: '2026-11-10', amount: 3000 },
    { cardId: 'B', paymentDate: '2026-11-25', amount: 4000 },
    { cardId: 'A', paymentDate: '2026-12-10', amount: 3000 },
  ]);
  assert.equal(schedules.filter((item) => item.paymentDate.startsWith('2026-11')).reduce((sum, item) => sum + item.amount, 0), 7000);
});

test('closing/payment days clamp at end of short months', () => {
  const schedules = buildCreditCardPaymentSchedules([expense('1', '2027-01-31', 100, 'A')], [card('A', 31, 31)]);
  assert.equal(schedules[0].paymentDate, '2027-02-28');
});

test('tag highlight only matches explicitly selected tags', () => {
  assert.equal(matchesHighlightedTag([event(['work', 'personal'])], 'work'), true);
  assert.equal(matchesHighlightedTag([event(['work'])], 'personal'), false);
  assert.equal(matchesHighlightedTag([event(['work'])], undefined), false);
  assert.equal(matchesHighlightedTag([], 'work'), false);
});

test('D1 backup preserves all calendar rows and Japanese text', () => {
  const rows = [
    { calendar_id: 'main', snapshot_json: JSON.stringify({ events: [{ title: '買い物' }] }), created_at: '2026-10-13', updated_at: '2026-10-13' },
    { calendar_id: 'shared', snapshot_json: JSON.stringify({ events: [] }), created_at: '2026-10-12', updated_at: '2026-10-13' },
  ];
  const backup = createCalendarBackup(rows, '2026-10-13T18:00:00Z');
  assert.deepEqual(parseCalendarBackup(JSON.parse(JSON.stringify(backup))).rows, rows);
  assert.equal(backup.rowCount, 2);
});

test('D1 backup accepts empty database and rejects corrupted snapshots', () => {
  assert.equal(createCalendarBackup([], '2026-10-13T18:00:00Z').rowCount, 0);
  assert.throws(() => createCalendarBackup([{ calendar_id: 'bad', snapshot_json: '{', created_at: 'a', updated_at: 'b' }], 'now'));
  assert.throws(() => parseCalendarBackup({ format: 'unknown', version: 1, rows: [], rowCount: 0 }));
});

test('Japanese holidays include substitute holidays', () => {
  assert.equal(getJapaneseHoliday('2026-05-03'), '憲法記念日');
  assert.equal(getJapaneseHoliday('2026-05-06'), '振替休日');
  assert.equal(getJapaneseHoliday('2026-10-13'), undefined);
});
