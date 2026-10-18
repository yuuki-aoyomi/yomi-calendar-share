import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppBackupData } from '../src/types/calendar.ts';
import {
  assertReferenceIntegrity,
  auditReferenceIntegrity,
  getCreditCardReferenceImpact,
  getPartTimeJobReferenceImpact,
  getTagReferenceImpact,
} from '../src/utils/referenceIntegrity.ts';

const makeData = (): AppBackupData['data'] => ({
  events: [{
    id: 'event-1',
    date: '2026-10-18',
    title: 'バイト',
    category: 'schedule',
    tagIds: ['tag-job'],
    tags: ['バイトA'],
    timelineItems: [],
    createdAt: '',
    updatedAt: '',
  }],
  moneyRecords: [{
    id: 'money-job',
    date: '2026-10-18',
    type: 'income',
    amount: 1000,
    category: '給与',
    incomeSource: 'part-time',
    partTimeJobId: 'job-1',
    createdAt: '',
    updatedAt: '',
  }, {
    id: 'money-card',
    date: '2026-10-18',
    type: 'expense',
    amount: 500,
    category: '買い物',
    isCreditCard: true,
    creditCardId: 'card-1',
    createdAt: '',
    updatedAt: '',
  }],
  loveLogs: [],
  tags: [
    { id: 'tag-job', name: 'バイトA', type: 'work', color: '#000000', createdAt: '', updatedAt: '' },
    { id: 'tag-card', name: 'カードA', type: 'credit-card', color: '#000000', createdAt: '', updatedAt: '' },
  ],
  partTimeJobs: [{
    id: 'job-1',
    name: 'バイトA',
    tagId: 'tag-job',
    createdAt: '',
    updatedAt: '',
  }],
  creditCards: [{
    id: 'card-1',
    name: 'カードA',
    tagId: 'tag-card',
    closingDay: 15,
    paymentDay: 27,
    createdAt: '',
    updatedAt: '',
  }],
  subscriptions: [{
    id: 'sub-1',
    name: 'サービス',
    amount: 500,
    billingDay: 1,
    creditCardId: 'card-1',
    category: 'サブスク',
    isActive: true,
    createdAt: '',
    updatedAt: '',
  }],
  dailyPhotos: [],
});

test('reference impact counts historical records before configuration deletion', () => {
  const data = makeData();
  assert.deepEqual(getPartTimeJobReferenceImpact(data, 'job-1'), {
    eventCount: 0,
    moneyRecordCount: 1,
    subscriptionCount: 0,
  });
  assert.deepEqual(getCreditCardReferenceImpact(data, 'card-1'), {
    eventCount: 0,
    moneyRecordCount: 1,
    subscriptionCount: 1,
  });
  assert.deepEqual(getTagReferenceImpact(data, 'tag-job'), {
    eventCount: 1,
    moneyRecordCount: 0,
    subscriptionCount: 0,
  });
});

test('integrity audit accepts a complete snapshot', () => {
  const data = makeData();
  assert.deepEqual(auditReferenceIntegrity(data), []);
  assert.doesNotThrow(() => assertReferenceIntegrity(data));
});

test('integrity audit detects dangling job, card and tag references', () => {
  const data = makeData();
  data.partTimeJobs = [];
  data.creditCards = [];
  data.tags = [];

  const problems = auditReferenceIntegrity(data);
  assert.ok(problems.some((problem) => problem.kind === 'missing-part-time-job' && problem.ownerId === 'money-job'));
  assert.ok(problems.some((problem) => problem.kind === 'missing-credit-card' && problem.ownerId === 'money-card'));
  assert.ok(problems.some((problem) => problem.kind === 'missing-credit-card' && problem.ownerId === 'sub-1'));
  assert.ok(problems.some((problem) => problem.kind === 'missing-tag' && problem.ownerId === 'event-1'));
  assert.throws(() => assertReferenceIntegrity(data), /参照先が存在しないデータ/);
});
