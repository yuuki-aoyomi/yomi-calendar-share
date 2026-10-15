import assert from 'node:assert/strict';
import { createCalendarBackup, parseCalendarBackup } from '../server/core/calendarBackup.ts';
import { getJapaneseHoliday } from '../src/utils/japaneseHolidays.ts';
import { normalizeTime, validateEventForm } from '../src/utils/eventFormValidation.ts';
import { mergeCalendarSnapshots } from '../src/utils/calendarSync.ts';
import { eventOccursOnDate } from '../src/utils/recurrence.ts';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCreditCardPaymentSchedules } from '../src/utils/creditCard.ts';
import { matchesHighlightedTag } from '../src/utils/calendarHighlight.ts';
import type { CalendarEvent, CreditCardSetting, MoneyRecord } from '../src/types/calendar.ts';
import type { CalendarDataSnapshot } from '../src/repositories/calendarRepository.ts';

const card = (id: string, closingDay: number, paymentDay: number): CreditCardSetting => ({
  id, name: id, tagId: id, closingDay, paymentDay, createdAt: '', updatedAt: '',
});
const expense = (id: string, date: string, amount: number, creditCardId: string, isCreditCard = true): MoneyRecord => ({
  id, date, amount, creditCardId, isCreditCard, type: 'expense', category: 'test', createdAt: '', updatedAt: '',
});
const event = (tagIds: string[]): CalendarEvent => ({
  id: 'event', date: '2026-10-13', title: 'Test', category: 'schedule', tagIds, tags: [], timelineItems: [], createdAt: '', updatedAt: '',
});
const snapshot = (events: CalendarEvent[] = []): CalendarDataSnapshot => ({
  events,
  moneyRecords: [],
  loveLogs: [],
  tags: [],
  partTimeJobs: [],
  creditCards: [],
  subscriptions: [],
  dailyPhotos: [],
});
const syncEvent = (id: string, title: string, updatedAt = '2026-10-15T00:00:00Z'): CalendarEvent => ({
  id,
  date: '2026-10-15',
  title,
  category: 'schedule',
  tagIds: [],
  tags: [],
  timelineItems: [],
  createdAt: '2026-10-15T00:00:00Z',
  updatedAt,
});
const recurringEvent = (recurrence: CalendarEvent['recurrence']): CalendarEvent => ({
  id: 'recurring',
  date: '2026-10-12',
  title: 'Recurring',
  category: 'schedule',
  tagIds: [],
  tags: [],
  timelineItems: [],
  recurrence,
  createdAt: '',
  updatedAt: '',
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

test('restore CLI dry-run validates without touching D1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yomi-restore-test-'));
  try {
    const file = join(dir, 'backup.json');
    writeFileSync(file, JSON.stringify(createCalendarBackup([
      { calendar_id: 'main', snapshot_json: JSON.stringify({ events: [{ title: '復元確認' }] }), created_at: '2026-10-13', updated_at: '2026-10-13' },
    ], '2026-10-13T18:00:00Z')));
    const output = execFileSync(process.execPath, ['scripts/restore-d1.mjs', file], { encoding: 'utf8' });
    assert.match(output, /Dry run only/);
    assert.throws(() => execFileSync(process.execPath, ['scripts/restore-d1.mjs', file, '--remote'], { stdio: 'pipe' }));
    writeFileSync(file, JSON.stringify({ format: 'yomi-calendar-d1-backup', version: 1, createdAt: 'now', rowCount: 1, rows: [] }));
    assert.throws(() => execFileSync(process.execPath, ['scripts/restore-d1.mjs', file], { stdio: 'pipe' }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('time input accepts HH:MM and HHMM and rejects invalid values', () => {
  assert.equal(normalizeTime('09:30'), '09:30');
  assert.equal(normalizeTime('930'), '09:30');
  assert.equal(normalizeTime('0930'), '09:30');
  assert.equal(normalizeTime('23:59'), '23:59');
  assert.equal(normalizeTime('24:00'), undefined);
  assert.equal(normalizeTime('12:60'), undefined);
  assert.equal(normalizeTime('9:3'), undefined);
});

test('event form validation reports the field that prevents saving', () => {
  const base = {
    title: 'バイト',
    eventStartDate: '2026-10-15',
    endDate: '',
    startTime: '09:30',
    endTime: '1800',
    breakMinutes: '60',
    recurrence: 'none' as const,
    recurrenceUntil: '',
    timelineTime: '',
    timelineTitle: '',
  };

  assert.deepEqual(validateEventForm(base), {});
  assert.match(validateEventForm({ ...base, startTime: '25:00' }).startTime ?? '', /時刻が正しくありません/);
  assert.match(validateEventForm({ ...base, endDate: '2026-10-14' }).endDate ?? '', /開始日/);
  assert.match(validateEventForm({ ...base, breakMinutes: '-1' }).breakMinutes ?? '', /0以上の整数/);
  assert.match(
    validateEventForm({ ...base, recurrence: 'weekly', recurrenceUntil: '2026-10-14', recurrenceWeekdays: [4] }).recurrenceUntil ?? '',
    /開始日/,
  );
  assert.match(
    validateEventForm({ ...base, recurrence: 'weekly', recurrenceWeekdays: [] }).recurrenceWeekdays ?? '',
    /1つ以上/,
  );
  assert.match(validateEventForm({ ...base, timelineTime: '1200' }).timelineTitle ?? '', /内容を入力/);
  assert.match(validateEventForm({ ...base, timelineTitle: '開場' }).timelineTime ?? '', /時刻を入力/);
});

test('daily recurrence occurs every day from the start date', () => {
  const item = recurringEvent({ frequency: 'daily', interval: 1 });
  assert.equal(eventOccursOnDate(item, '2026-10-12'), true);
  assert.equal(eventOccursOnDate(item, '2026-10-13'), true);
  assert.equal(eventOccursOnDate(item, '2026-10-18'), true);
  assert.equal(eventOccursOnDate(item, '2026-10-11'), false);
});

test('weekly recurrence can occur on multiple selected weekdays', () => {
  const item = recurringEvent({ frequency: 'weekly', interval: 1, weekdays: [1, 3, 5] });
  assert.equal(eventOccursOnDate(item, '2026-10-12'), true); // Monday
  assert.equal(eventOccursOnDate(item, '2026-10-14'), true); // Wednesday
  assert.equal(eventOccursOnDate(item, '2026-10-16'), true); // Friday
  assert.equal(eventOccursOnDate(item, '2026-10-15'), false); // Thursday
  assert.equal(eventOccursOnDate(item, '2026-10-19'), true); // next Monday
});

test('legacy weekly recurrence without weekdays keeps the original weekday', () => {
  const item = recurringEvent({ frequency: 'weekly', interval: 1 });
  assert.equal(eventOccursOnDate(item, '2026-10-12'), true);
  assert.equal(eventOccursOnDate(item, '2026-10-13'), false);
  assert.equal(eventOccursOnDate(item, '2026-10-19'), true);
});

test('weekly recurrence interval applies to the selected weekday set', () => {
  const item = recurringEvent({ frequency: 'weekly', interval: 2, weekdays: [1, 5] });
  assert.equal(eventOccursOnDate(item, '2026-10-12'), true);
  assert.equal(eventOccursOnDate(item, '2026-10-16'), true);
  assert.equal(eventOccursOnDate(item, '2026-10-19'), false);
  assert.equal(eventOccursOnDate(item, '2026-10-26'), true);
  assert.equal(eventOccursOnDate(item, '2026-10-30'), true);
});

test('three-way merge combines independent edits from different clients', () => {
  const base = snapshot([syncEvent('a', 'A'), syncEvent('b', 'B')]);
  const local = snapshot([syncEvent('a', 'A local'), syncEvent('b', 'B')]);
  const remote = snapshot([syncEvent('a', 'A'), syncEvent('b', 'B remote')]);
  const result = mergeCalendarSnapshots(base, local, remote);

  assert.deepEqual(result.conflicts, []);
  assert.equal(result.snapshot.events.find((item) => item.id === 'a')?.title, 'A local');
  assert.equal(result.snapshot.events.find((item) => item.id === 'b')?.title, 'B remote');
});

test('three-way merge preserves a deletion when the other client did not edit the item', () => {
  const original = syncEvent('a', 'A');
  const result = mergeCalendarSnapshots(snapshot([original]), snapshot([]), snapshot([original]));

  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.snapshot.events, []);
});

test('three-way merge detects delete-versus-edit conflicts', () => {
  const original = syncEvent('a', 'A');
  const result = mergeCalendarSnapshots(
    snapshot([original]),
    snapshot([]),
    snapshot([syncEvent('a', 'A remote edit')]),
  );

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].kind, 'delete_vs_edit');
  assert.equal(result.conflicts[0].id, 'a');
});

test('three-way merge detects concurrent edits to the same item', () => {
  const original = syncEvent('a', 'A');
  const result = mergeCalendarSnapshots(
    snapshot([original]),
    snapshot([syncEvent('a', 'A local edit')]),
    snapshot([syncEvent('a', 'A remote edit')]),
  );

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].kind, 'concurrent_edit');
});
