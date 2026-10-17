import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppBackupData } from '../src/types/calendar.ts';
import {
  createPartialExport,
  mergePartialImport,
  previewPartialImport,
  validatePartialTransferPayload,
} from '../src/utils/dataTransfer.ts';

const makeData = (): AppBackupData['data'] => ({
  events: [
    {
      id: 'event-1',
      date: '2026-10-18',
      title: '大学',
      category: 'schedule',
      tagIds: ['tag-person'],
      tags: ['UserA'],
      timelineItems: [],
      createdAt: 'a',
      updatedAt: 'a',
    },
    {
      id: 'todo-1',
      date: '2026-10-18',
      title: '提出',
      category: 'todo',
      tagIds: [],
      tags: [],
      timelineItems: [],
      done: false,
      createdAt: 'a',
      updatedAt: 'a',
    },
  ],
  moneyRecords: [{
    id: 'money-1',
    date: '2026-10-18',
    type: 'expense',
    amount: 1000,
    category: '食費',
    isCreditCard: true,
    creditCardId: 'card-1',
    createdAt: 'a',
    updatedAt: 'a',
  }],
  loveLogs: [],
  tags: [
    { id: 'tag-person', name: 'UserA', type: 'person', color: '#fff', createdAt: 'a', updatedAt: 'a' },
    { id: 'tag-card', name: 'Card', type: 'credit-card', color: '#fff', createdAt: 'a', updatedAt: 'a' },
  ],
  partTimeJobs: [],
  creditCards: [{
    id: 'card-1',
    name: 'Card',
    tagId: 'tag-card',
    closingDay: 15,
    paymentDay: 27,
    createdAt: 'a',
    updatedAt: 'a',
  }],
  subscriptions: [],
  dailyPhotos: [],
});

test('partial money export automatically carries referenced card and tag', () => {
  const payload = createPartialExport(makeData(), { moneyRecords: true }, '2026-10-18T00:00:00Z');

  assert.equal(payload.data.moneyRecords.length, 1);
  assert.deepEqual(payload.data.creditCards.map((card) => card.id), ['card-1']);
  assert.deepEqual(payload.data.tags.map((tag) => tag.id), ['tag-card']);
  assert.equal(payload.data.events.length, 0);
});

test('event and todo scopes are independently selectable', () => {
  const onlyEvents = createPartialExport(makeData(), { events: true });
  const onlyTodos = createPartialExport(makeData(), { todos: true });

  assert.deepEqual(onlyEvents.data.events.map((event) => event.id), ['event-1']);
  assert.deepEqual(onlyTodos.data.events.map((event) => event.id), ['todo-1']);
  assert.deepEqual(onlyEvents.data.tags.map((tag) => tag.id), ['tag-person']);
});

test('import preview separates duplicate ids, conflicting ids and duplicate content', () => {
  const current = makeData();
  const payload = createPartialExport(current, { events: true });
  payload.data.events = [
    { ...current.events[0] },
    { ...current.events[0], title: '変更済み' },
    { ...current.events[0], id: 'event-copy', createdAt: 'other', updatedAt: 'other' },
    {
      ...current.events[0],
      id: 'event-new',
      title: '完全に新しい予定',
      createdAt: 'other',
      updatedAt: 'other',
    },
  ];

  const preview = previewPartialImport(current, payload);
  assert.equal(preview.events.incoming, 4);
  assert.equal(preview.events.duplicateIds, 1);
  assert.equal(preview.events.conflictingIds, 1);
  assert.equal(preview.events.duplicateContent, 1);
  assert.equal(preview.events.newItems, 1);
});

test('skip avoids content duplicates while overwrite replaces id conflicts', () => {
  const current = makeData();
  const payload = createPartialExport(current, { events: true });
  payload.data.events = [
    { ...current.events[0], title: '上書き版' },
    { ...current.events[0], id: 'event-copy', createdAt: 'other', updatedAt: 'other' },
  ];

  const skipped = mergePartialImport(current, payload, 'skip');
  assert.equal(skipped.events.length, current.events.length);
  assert.equal(skipped.events.find((event) => event.id === 'event-1')?.title, '大学');

  const overwritten = mergePartialImport(current, payload, 'overwrite');
  assert.equal(overwritten.events.find((event) => event.id === 'event-1')?.title, '上書き版');
  assert.ok(overwritten.events.some((event) => event.id === 'event-copy'));
});

test('partial payload with dangling references is rejected before merge', () => {
  const payload = createPartialExport(makeData(), { moneyRecords: true });
  payload.data.creditCards = [];
  payload.data.tags = [];

  assert.throws(() => validatePartialTransferPayload(payload), /参照先が存在しないデータ/);
});
