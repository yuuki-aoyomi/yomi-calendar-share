import assert from 'node:assert/strict';
import test from 'node:test';
import type { CalendarEvent } from '../src/types/calendar.ts';
import { getPendingTodos, getTodosForView, getTodoDeadlineLabel, getTodoPeriod } from '../src/utils/todo.ts';

const todo = (id: string, date: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, date, title: id, category: 'todo', tagIds: [], tags: [], timelineItems: [],
  createdAt: '2026-10-01', updatedAt: '2026-10-01', ...extra,
});

test('all pending tasks include future months and disabled highlights, excluding completed and other categories', () => {
  const events = [todo('future', '2027-04-01'), todo('done', '2026-10-27', { done: true }),
    todo('quiet', '2026-10-28', { highlightTodo: false }), todo('past', '2026-09-01'),
    todo('schedule', '2026-10-01', { category: 'schedule' }), todo('today', '2026-10-27')];
  const original = [...events];
  assert.deepEqual(getPendingTodos(events).map((item) => item.id), ['past', 'today', 'quiet', 'future']);
  assert.deepEqual(events, original);
  assert.deepEqual(getPendingTodos(events.map((event) => ({ ...event, done: true }))), []);
});

test('same-day ordering follows manual order then creation time, without expanding recurring series', () => {
  const events = [todo('later', '2026-10-27', { sortOrder: 2 }),
    todo('first', '2026-10-27', { sortOrder: 1, recurrence: { frequency: 'daily', interval: 1 } }),
    todo('unordered', '2026-10-27'), todo('older', '2026-10-27', { createdAt: '2026-09-01' })];
  assert.deepEqual(getPendingTodos(events).map((item) => item.id), ['first', 'later', 'older', 'unordered']);
});

test('deadline groups and remaining days cover month, year, leap day and midnight boundaries', () => {
  assert.equal(getTodoPeriod('2026-10-26', '2026-10-27'), 'overdue');
  assert.equal(getTodoPeriod('2026-10-27', '2026-10-27'), 'today');
  assert.equal(getTodoPeriod('2027-01-01', '2026-10-27'), 'upcoming');
  assert.equal(getTodoDeadlineLabel('2026-10-27', '2026-10-27'), '今日が期限');
  assert.equal(getTodoDeadlineLabel('2026-10-27', '2026-10-28'), '1日超過');
  assert.equal(getTodoDeadlineLabel('2027-01-01', '2026-12-31'), 'あと1日');
  assert.equal(getTodoDeadlineLabel('2028-03-01', '2028-02-28'), 'あと2日');
  assert.equal(getTodoDeadlineLabel('2026-11-01', '2026-10-27'), 'あと5日');
});


test('normal view includes highlighted pending todos from all dates, with legacy flags enabled by default', () => {
  const events = [todo('past', '2020-01-01'), todo('future', '2030-01-01', { highlightTodo: true }),
    todo('quiet', '2026-10-27', { highlightTodo: false }),
    todo('done', '2026-10-27', { done: true }),
    todo('schedule', '2026-10-27', { category: 'schedule' })];
  assert.deepEqual(getTodosForView(events).map((item) => item.id), ['past', 'future']);
  assert.deepEqual(getTodosForView(events, 'pending').map((item) => item.id), ['past', 'quiet', 'future']);
  assert.deepEqual(getTodosForView(events, 'completed').map((item) => item.id), ['done']);
  assert.deepEqual(getTodosForView(events, 'all').map((item) => item.id), ['past', 'done', 'quiet', 'future']);
});

test('disabling highlighting removes only normal visibility, while the uncompleted task is preserved', () => {
  const original = [todo('abandoned', '2026-01-01', { memo: 'keep me', highlightTodo: true })];
  const before = JSON.stringify(original);
  const changed = original.map((item) => ({ ...item, highlightTodo: false }));
  assert.equal(getTodosForView(changed).length, 0);
  assert.equal(getTodosForView(changed, 'completed').length, 0);
  assert.equal(getTodosForView(changed, 'pending')[0], changed[0]);
  assert.equal(getTodosForView(changed, 'all')[0].memo, 'keep me');
  assert.equal(changed[0].done, undefined);
  assert.equal(JSON.stringify(original), before);
  const restored = changed.map((item) => ({ ...item, highlightTodo: true }));
  assert.equal(getTodosForView(restored)[0].id, 'abandoned');
});

test('completion and reopening respect the highlight flag without losing any todo from all view', () => {
  for (const highlightTodo of [true, false]) {
    const completed = [todo('task', '2026-01-01', { done: true, highlightTodo })];
    assert.equal(getTodosForView(completed).length, 0);
    assert.equal(getTodosForView(completed, 'pending').length, 0);
    assert.equal(getTodosForView(completed, 'completed').length, 1);
    const reopened = completed.map((item) => ({ ...item, done: false }));
    assert.equal(getTodosForView(reopened, 'pending').length, 1);
    assert.equal(getTodosForView(reopened).length, highlightTodo ? 1 : 0);
    assert.equal(getTodosForView(reopened, 'completed').length, 0);
    assert.equal(getTodosForView(reopened, 'all').length, 1);
  }
});
