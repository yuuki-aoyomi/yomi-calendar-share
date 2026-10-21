import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCalendarSnapshot } from '../src/utils/validateCalendarSnapshot.ts';
import { createBackupData, readBackupFile } from '../src/utils/backup.ts';
import { createPartialExport, mergePartialImport, previewPartialImport, validatePartialTransferPayload } from '../src/utils/dataTransfer.ts';
import type { CalendarDataSnapshot } from '../src/repositories/calendarRepository.ts';

const valid = (): CalendarDataSnapshot => ({
  events: [{ id: 'event', date: '2024-02-29', title: '予定', category: 'schedule',
    tagIds: [], tags: [], timelineItems: [], createdAt: '', updatedAt: '' }],
  moneyRecords: [], loveLogs: [], tags: [], partTimeJobs: [], creditCards: [], subscriptions: [], dailyPhotos: [],
});

test('snapshot validation rejects malformed collections, items and duplicate IDs', () => {
  for (const value of [null, [], {}, { ...valid(), events: null }, { ...valid(), tags: {} },
    { ...valid(), events: [null] }, { ...valid(), events: [valid().events[0], valid().events[0]] },
    { ...valid(), events: [{ ...valid().events[0], id: '' }] }]) {
    assert.throws(() => validateCalendarSnapshot(value));
  }
});

test('snapshot validation checks dates, enum values, nested fields and finite numbers', () => {
  const event = valid().events[0];
  for (const change of [{ date: '2026-02-29' }, { category: 'unknown' }, { title: 123 }, { done: 'false' },
    { startTime: '25:00' }, { tagIds: [123] }, { tags: [{}] }, { sortOrder: Infinity }, { breakMinutes: -1 },
    { recurrence: { frequency: 'weekly', interval: 0 } },
    { recurrence: { frequency: 'weekly', interval: 1, weekdays: [7] } },
    { timelineItems: [{ id: 't', time: '10:00', title: 'A' }, { id: 't', time: '11:00', title: 'B' }] }]) {
    assert.throws(() => validateCalendarSnapshot({ ...valid(), events: [{ ...event, ...change }] }));
  }
});

test('all collections validate their item fields', () => {
  const fields = { id: 'x', createdAt: '', updatedAt: '' };
  const data = {
    ...valid(),
    moneyRecords: [{ ...fields, date: '2026-10-21', type: 'expense', amount: 100, category: '食費' }],
    loveLogs: [{ ...fields, date: '2026-10-21', title: '日記', heartCount: 1 }],
    tags: [{ ...fields, name: 'カード', type: 'credit-card', color: '#000' }],
    partTimeJobs: [{ ...fields, name: '勤務', tagId: 'x' }],
    creditCards: [{ ...fields, name: 'カード', tagId: 'x', closingDay: 31, paymentDay: 1 }],
    subscriptions: [{ ...fields, name: 'サービス', amount: 50, billingDay: 1, category: '', isActive: true }],
    dailyPhotos: [{ ...fields, date: '2026-10-21', imageUrl: '' }],
  };
  assert.deepEqual(validateCalendarSnapshot(data), data);
  for (const [collection, change] of [
    ['moneyRecords', { amount: '100' }], ['loveLogs', { heartCount: -1 }], ['loveLogs', { heartCount: 1_000_000_000 }], ['tags', { type: 'bad' }],
    ['partTimeJobs', { hourlyWage: NaN }], ['creditCards', { paymentDay: 32 }],
    ['subscriptions', { billingMonth: 13 }], ['dailyPhotos', { imageUrl: {} }],
  ] as const) {
    assert.throws(() => validateCalendarSnapshot({ ...data, [collection]: [{ ...data[collection][0], ...change }] }));
  }
});

test('known legacy omissions normalize without changing existing values or the input', () => {
  const data = valid();
  const { subscriptions: _subscriptions, dailyPhotos: _photos, ...legacy } = data;
  const { tagIds: _tagIds, tags: _tags, timelineItems: _timeline, ...event } = data.events[0];
  const input = { ...legacy, events: [{ ...event, customFutureField: 'preserve' }], customTopLevel: 42 };
  const before = structuredClone(input);
  const result = validateCalendarSnapshot(input);
  assert.deepEqual(result.subscriptions, []);
  assert.deepEqual(result.dailyPhotos, []);
  assert.deepEqual(result.events[0].tagIds, []);
  assert.deepEqual(result.events[0].timelineItems, []);
  assert.equal((result as unknown as { customTopLevel: number }).customTopLevel, 42);
  assert.deepEqual(input, before);
  assert.throws(() => validateCalendarSnapshot({ ...input, dailyPhotos: null }));
});

test('full Import refuses invalid data instead of replacing a collection with an empty array', async () => {
  const backup = createBackupData(valid());
  const original = structuredClone(backup);
  const file = (value: unknown) => new File([JSON.stringify(value)], 'backup.json', { type: 'application/json' });
  const parsed = await readBackupFile(file(backup));
  assert.deepEqual(parsed.data, backup.data);
  await assert.rejects(readBackupFile(file({ ...backup, data: { ...backup.data, events: null } })), /events/);
  await assert.rejects(readBackupFile(file({ ...backup, data: { ...backup.data, events: [{ ...backup.data.events[0], date: 'invalid' }] } })), /date/);
  await assert.rejects(readBackupFile(file(null)));
  assert.deepEqual(backup, original);
});

test('legacy full and partial Imports apply known collection defaults', async () => {
  const current = valid();
  const { subscriptions: _subs, dailyPhotos: _photos, ...legacy } = current;
  const file = new File([JSON.stringify({ ...createBackupData(current), data: legacy })], 'legacy.json');
  assert.deepEqual((await readBackupFile(file)).data, current);
  const payload = { ...createPartialExport(current, { events: true }), data: legacy };
  const normalized = validatePartialTransferPayload(payload);
  assert.deepEqual(normalized.data, current);
  assert.deepEqual(mergePartialImport(current, normalized, 'merge'), current);
});

test('partial Import validates preview and merge before modifying current data', () => {
  const data = valid();
  const payload = createPartialExport(data, { events: true });
  const original = structuredClone(data);
  const malformed = { ...payload, data: { ...payload.data, events: [{ ...data.events[0], title: 1 }] } };
  assert.throws(() => validatePartialTransferPayload(malformed), /title/);
  assert.throws(() => previewPartialImport(data, malformed as unknown as typeof payload), /title/);
  assert.throws(() => mergePartialImport(data, malformed as unknown as typeof payload, 'overwrite'), /title/);
  assert.deepEqual(data, original);
});
