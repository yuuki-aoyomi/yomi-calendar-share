import assert from 'node:assert/strict';
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
