import assert from 'node:assert/strict';
import test from 'node:test';
import type { CalendarEvent, CalendarTag } from '../src/types/calendar.ts';
import { buildEventTemplate, buildEventTemplateCandidates } from '../src/utils/eventTemplates.ts';

test('event history is converted to a reusable template without stale absolute dates', () => {
  const currentTag: CalendarTag = {
    id: 'work', name: 'バイト', type: 'work', color: '#000000', createdAt: '', updatedAt: '',
  };
  const source: CalendarEvent = {
    id: 'past',
    date: '2026-09-01',
    endDate: '2026-09-03',
    title: '出張',
    startTime: '09:00',
    endTime: '18:00',
    breakMinutes: 60,
    category: 'schedule',
    memo: '持ち物確認',
    tagIds: ['work', 'deleted-tag'],
    tags: ['旧バイト', '削除済み'],
    recurrence: { frequency: 'weekly', interval: 2, weekdays: [1, 3, 5], until: '2026-09-30' },
    timelineItems: [{ id: 't1', time: '12:00', title: '昼食' }],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-03T00:00:00Z',
  };

  const template = buildEventTemplate(source, '2026-10-20', [currentTag]);
  assert.equal(template.date, '2026-10-20');
  assert.equal(template.endDate, '2026-10-22');
  assert.deepEqual(template.tagIds, ['work']);
  assert.deepEqual(template.tags, ['バイト']);
  assert.deepEqual(template.recurrence, { frequency: 'weekly', interval: 2, weekdays: [1, 3, 5] });
  assert.equal(template.memo, '持ち物確認');
  assert.notEqual(template.timelineItems, source.timelineItems);
  assert.notEqual(template.recurrence?.weekdays, source.recurrence?.weekdays);
});

test('legacy weekly templates without weekdays remain compatible', () => {
  const source: CalendarEvent = {
    id: 'legacy',
    date: '2026-09-01',
    title: '定例',
    category: 'schedule',
    tagIds: [],
    tags: [],
    recurrence: { frequency: 'weekly', interval: 1 },
    timelineItems: [],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  assert.deepEqual(buildEventTemplate(source, '2026-10-20', []).recurrence, {
    frequency: 'weekly',
    interval: 1,
    weekdays: undefined,
  });
});

test('todo templates reset completion state and candidates prefer the latest history', () => {
  const older: CalendarEvent = {
    id: 'older', date: '2026-09-01', title: '買い物', category: 'todo', tagIds: [], tags: [], timelineItems: [],
    done: true, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
  };
  const newer: CalendarEvent = {
    ...older,
    id: 'newer',
    startTime: '18:00',
    updatedAt: '2026-10-01T00:00:00Z',
  };

  const candidates = buildEventTemplateCandidates([older, newer], '2026-10-20', []);
  assert.equal(candidates[0].id, 'newer');
  assert.equal(candidates[0].date, '2026-10-20');
  assert.equal(candidates[0].done, false);
});
