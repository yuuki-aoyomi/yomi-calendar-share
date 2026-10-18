import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adoptCalendarSnapshot,
  checkCalendarSnapshotUpdate,
  fetchCalendarSnapshot,
} from '../src/api/calendarApi.ts';
import { buildCreditCardPaymentSchedules } from '../src/utils/creditCard.ts';
import { rankEventTemplateCandidates, scoreEventSuggestion } from '../src/utils/eventTemplates.ts';
import { getRecurrenceInterval, normalizeRecurrenceInterval } from '../src/utils/recurrenceForm.ts';
import { persistRemoteSnapshot } from '../src/utils/remoteSave.ts';
import { createSerialTaskQueue } from '../src/utils/serialTaskQueue.ts';
import { getHighlightedPendingTodos } from '../src/utils/todo.ts';
import type { CalendarDataSnapshot } from '../src/repositories/calendarRepository.ts';
import type { CalendarEvent, CreditCardSetting, MoneyRecord } from '../src/types/calendar.ts';

const makeEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'event',
  date: '2026-10-17',
  title: 'Test',
  category: 'schedule',
  tagIds: [],
  tags: [],
  timelineItems: [],
  createdAt: '2026-10-17T00:00:00Z',
  updatedAt: '2026-10-17T00:00:00Z',
  ...overrides,
});

const emptySnapshot = (): CalendarDataSnapshot => ({
  events: [],
  moneyRecords: [],
  loveLogs: [],
  tags: [],
  partTimeJobs: [],
  creditCards: [],
  subscriptions: [],
  dailyPhotos: [],
});

test('recurrence interval is preserved for editing and suggestion reuse', () => {
  const biweekly = makeEvent({ recurrence: { frequency: 'weekly', interval: 2, weekdays: [1, 3, 5] } });
  assert.equal(getRecurrenceInterval(biweekly), 2);
  assert.equal(getRecurrenceInterval(makeEvent({ recurrence: { frequency: 'weekly', interval: 1 } })), 1);
  assert.equal(getRecurrenceInterval(makeEvent()), 1);
  assert.equal(normalizeRecurrenceInterval(2), 2);
  assert.equal(normalizeRecurrenceInterval(0), 1);
  assert.equal(normalizeRecurrenceInterval(Number.NaN), 1);
});

test('failed remote save stays dirty and can be retried successfully', async () => {
  const snapshot = { value: 'local-change' };
  const previousSavedJson = JSON.stringify({ value: 'server-state' });
  let attempts = 0;

  const first = await persistRemoteSnapshot({
    snapshot,
    lastSavedJson: previousSavedJson,
    save: async () => {
      attempts += 1;
      throw new Error('network down');
    },
  });

  assert.equal(first.status, 'failed');
  assert.equal(first.savedJson, previousSavedJson);
  assert.match(first.error?.message ?? '', /network down/);

  const second = await persistRemoteSnapshot({
    snapshot,
    lastSavedJson: first.savedJson,
    save: async () => {
      attempts += 1;
      return 'saved';
    },
  });

  assert.equal(attempts, 2);
  assert.equal(second.status, 'saved');
  assert.equal(second.savedJson, JSON.stringify(snapshot));
});

test('reload-required result does not mark local data as saved', async () => {
  const previousSavedJson = JSON.stringify({ value: 'base' });
  const result = await persistRemoteSnapshot({
    snapshot: { value: 'conflicting-local-edit' },
    lastSavedJson: previousSavedJson,
    save: async () => 'reload-required',
  });

  assert.equal(result.status, 'reload-required');
  assert.equal(result.savedJson, previousSavedJson);
});

test('unchanged remote snapshot does not issue another save', async () => {
  const snapshot = { value: 'same' };
  const savedJson = JSON.stringify(snapshot);
  let called = false;

  const result = await persistRemoteSnapshot({
    snapshot,
    lastSavedJson: savedJson,
    save: async () => {
      called = true;
      return 'saved';
    },
  });

  assert.equal(result.status, 'unchanged');
  assert.equal(called, false);
});

test('serial task queue never overlaps remote save operations', async () => {
  const enqueue = createSerialTaskQueue();
  const order: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = enqueue(async () => {
    order.push('first:start');
    await firstGate;
    order.push('first:end');
    return 1;
  });
  const second = enqueue(async () => {
    order.push('second:start');
    order.push('second:end');
    return 2;
  });

  await Promise.resolve();
  assert.deepEqual(order, ['first:start']);
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.deepEqual(order, ['first:start', 'first:end', 'second:start', 'second:end']);
});

test('serial task queue continues after a failed operation', async () => {
  const enqueue = createSerialTaskQueue();
  const order: string[] = [];

  const failed = enqueue(async () => {
    order.push('failed');
    throw new Error('expected');
  });
  const next = enqueue(async () => {
    order.push('next');
    return 'ok';
  });

  await assert.rejects(failed, /expected/);
  assert.equal(await next, 'ok');
  assert.deepEqual(order, ['failed', 'next']);
});

test('todo highlight includes only unfinished enabled todos due today or earlier', () => {
  const events: CalendarEvent[] = [
    makeEvent({ id: 'old', date: '2026-10-15', category: 'todo', done: false, highlightTodo: true }),
    makeEvent({ id: 'today', date: '2026-10-17', category: 'todo', done: false, highlightTodo: true }),
    makeEvent({ id: 'future', date: '2026-10-18', category: 'todo', done: false, highlightTodo: true }),
    makeEvent({ id: 'done', date: '2026-10-16', category: 'todo', done: true, highlightTodo: true }),
    makeEvent({ id: 'disabled', date: '2026-10-16', category: 'todo', done: false, highlightTodo: false }),
    makeEvent({ id: 'legacy', date: '2026-10-16', category: 'todo', done: false, highlightTodo: undefined }),
    makeEvent({ id: 'schedule', date: '2026-10-16', category: 'schedule' }),
  ];

  assert.deepEqual(
    getHighlightedPendingTodos(events, '2026-10-17').map((event) => event.id),
    ['old', 'legacy', 'today'],
  );
});

test('credit card month-end clamping handles leap years', () => {
  const card: CreditCardSetting = {
    id: 'leap',
    name: 'Leap',
    tagId: 'leap',
    closingDay: 31,
    paymentDay: 31,
    createdAt: '',
    updatedAt: '',
  };
  const record: MoneyRecord = {
    id: 'r1',
    date: '2028-01-31',
    amount: 1000,
    creditCardId: 'leap',
    isCreditCard: true,
    type: 'expense',
    category: 'test',
    createdAt: '',
    updatedAt: '',
  };

  const schedules = buildCreditCardPaymentSchedules([record], [card]);
  assert.equal(schedules[0].paymentDate, '2028-02-29');
});

test('calendar snapshot survives JSON serialization without losing data', () => {
  const snapshot = emptySnapshot();
  snapshot.events.push(makeEvent({
    id: 'serialized',
    title: '日本語の予定',
    recurrence: { frequency: 'weekly', interval: 2, weekdays: [1, 5] },
  }));

  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
});

test('suggestion score prefers exact title, same weekday, time bucket and matching tags', () => {
  const matching = makeEvent({
    title: 'バイト',
    date: '2026-10-12',
    startTime: '18:00',
    tagIds: ['work'],
  });
  const unrelated = makeEvent({
    title: '買い物',
    date: '2026-10-13',
    startTime: '09:00',
    tagIds: ['personal'],
  });

  const context = { title: 'バイト', startTime: '18:30', tagIds: ['work'] };
  assert.ok(
    scoreEventSuggestion(matching, '2026-10-19', context, 3) >
      scoreEventSuggestion(unrelated, '2026-10-19', context, 1),
  );
});

test('suggestion ranking uses frequency and recency and returns safe shifted templates', () => {
  const events: CalendarEvent[] = [
    makeEvent({
      id: 'gym-old',
      title: 'ジム',
      date: '2026-10-05',
      startTime: '19:00',
      updatedAt: '2026-10-05T00:00:00Z',
    }),
    makeEvent({
      id: 'gym-new',
      title: 'ジム',
      date: '2026-10-12',
      startTime: '19:00',
      updatedAt: '2026-10-12T00:00:00Z',
    }),
    makeEvent({
      id: 'gym-extra',
      title: 'ジム',
      date: '2026-09-28',
      startTime: '19:00',
      updatedAt: '2026-09-28T00:00:00Z',
    }),
    makeEvent({
      id: 'study',
      title: '勉強',
      date: '2026-10-12',
      startTime: '19:00',
      updatedAt: '2026-10-16T00:00:00Z',
    }),
  ];

  const ranked = rankEventTemplateCandidates(events, '2026-10-19', [], { startTime: '19:30' });
  assert.equal(ranked[0].title, 'ジム');
  assert.equal(ranked[0].id, 'gym-new');
  assert.equal(ranked[0].date, '2026-10-19');
  assert.equal(ranked.filter((event) => event.title === 'ジム').length, 1);
});

test('title query filters unrelated suggestions and exact match wins', () => {
  const events: CalendarEvent[] = [
    makeEvent({ id: 'exact', title: '大学', updatedAt: '2026-10-01T00:00:00Z' }),
    makeEvent({ id: 'prefix', title: '大学作業', updatedAt: '2026-10-16T00:00:00Z' }),
    makeEvent({ id: 'other', title: 'バイト', updatedAt: '2026-10-17T00:00:00Z' }),
  ];

  const ranked = rankEventTemplateCandidates(events, '2026-10-17', [], { title: '大学' });
  assert.deepEqual(ranked.map((event) => event.id), ['exact', 'prefix']);
});

test('remote version polling detects a newer server version', async () => {
  const originalFetch = globalThis.fetch;
  try {
    adoptCalendarSnapshot('default', emptySnapshot(), 3);
    globalThis.fetch = async () => new Response(JSON.stringify({ calendarId: 'default', version: 4 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    const update = await checkCalendarSnapshotUpdate('default', 'token');
    assert.deepEqual(update, { changed: true, calendarId: 'default', version: 4 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetching a newer snapshot does not silently adopt it as the sync base', async () => {
  const originalFetch = globalThis.fetch;
  try {
    adoptCalendarSnapshot('default', emptySnapshot(), 3);
    let call = 0;
    globalThis.fetch = async () => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({
          calendarId: 'default',
          version: 4,
          snapshot: { ...emptySnapshot(), events: [makeEvent({ id: 'remote' })] },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ calendarId: 'default', version: 4 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const fetched = await fetchCalendarSnapshot('default', 'token');
    assert.equal(fetched.version, 4);
    assert.equal(fetched.snapshot.events[0].id, 'remote');

    const stillChanged = await checkCalendarSnapshotUpdate('default', 'token');
    assert.equal(stillChanged.changed, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
