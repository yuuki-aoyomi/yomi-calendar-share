import type { AppBackupData } from '../types/calendar';

export type ReferenceImpact = {
  eventCount: number;
  moneyRecordCount: number;
  subscriptionCount: number;
};

export type ReferenceIntegrityProblem = {
  kind: 'missing-tag' | 'missing-part-time-job' | 'missing-credit-card';
  ownerType: 'event' | 'money-record' | 'subscription' | 'part-time-job' | 'credit-card';
  ownerId: string;
  missingId: string;
};

export const getPartTimeJobReferenceImpact = (
  data: AppBackupData['data'],
  jobId: string,
): ReferenceImpact => ({
  eventCount: 0,
  moneyRecordCount: data.moneyRecords.filter((record) => record.partTimeJobId === jobId).length,
  subscriptionCount: 0,
});

export const getCreditCardReferenceImpact = (
  data: AppBackupData['data'],
  cardId: string,
): ReferenceImpact => ({
  eventCount: 0,
  moneyRecordCount: data.moneyRecords.filter((record) => record.creditCardId === cardId).length,
  subscriptionCount: data.subscriptions.filter((subscription) => subscription.creditCardId === cardId).length,
});

export const getTagReferenceImpact = (
  data: AppBackupData['data'],
  tagId: string,
): ReferenceImpact => {
  // Deleting a tag also deletes every job/card using it. Count those
  // indirect references once, even when a record references both settings.
  const jobIds = new Set(data.partTimeJobs.filter((job) => job.tagId === tagId).map((job) => job.id));
  const cardIds = new Set(data.creditCards.filter((card) => card.tagId === tagId).map((card) => card.id));
  return {
    eventCount: data.events.filter((event) => (event.tagIds ?? []).includes(tagId)).length,
    moneyRecordCount: data.moneyRecords.filter((record) =>
      (record.partTimeJobId && jobIds.has(record.partTimeJobId))
      || (record.creditCardId && cardIds.has(record.creditCardId))).length,
    subscriptionCount: data.subscriptions.filter((subscription) =>
      subscription.creditCardId && cardIds.has(subscription.creditCardId)).length,
  };
};

export const hasBlockingReferences = (impact: ReferenceImpact): boolean =>
  impact.eventCount > 0 || impact.moneyRecordCount > 0 || impact.subscriptionCount > 0;

export const formatReferenceImpact = (impact: ReferenceImpact): string => {
  const parts: string[] = [];
  if (impact.eventCount > 0) parts.push(`予定 ${impact.eventCount}件`);
  if (impact.moneyRecordCount > 0) parts.push(`家計記録 ${impact.moneyRecordCount}件`);
  if (impact.subscriptionCount > 0) parts.push(`サブスク ${impact.subscriptionCount}件`);
  return parts.join(' / ') || '参照なし';
};

export const auditReferenceIntegrity = (
  data: AppBackupData['data'],
): ReferenceIntegrityProblem[] => {
  const tagIds = new Set(data.tags.map((tag) => tag.id));
  const jobIds = new Set(data.partTimeJobs.map((job) => job.id));
  const cardIds = new Set(data.creditCards.map((card) => card.id));
  const problems: ReferenceIntegrityProblem[] = [];

  for (const event of data.events) {
    for (const tagId of event.tagIds ?? []) {
      if (!tagIds.has(tagId)) {
        problems.push({ kind: 'missing-tag', ownerType: 'event', ownerId: event.id, missingId: tagId });
      }
    }
  }

  for (const job of data.partTimeJobs) {
    if (!tagIds.has(job.tagId)) {
      problems.push({ kind: 'missing-tag', ownerType: 'part-time-job', ownerId: job.id, missingId: job.tagId });
    }
  }

  for (const card of data.creditCards) {
    if (!tagIds.has(card.tagId)) {
      problems.push({ kind: 'missing-tag', ownerType: 'credit-card', ownerId: card.id, missingId: card.tagId });
    }
  }

  for (const record of data.moneyRecords) {
    if (record.partTimeJobId && !jobIds.has(record.partTimeJobId)) {
      problems.push({
        kind: 'missing-part-time-job',
        ownerType: 'money-record',
        ownerId: record.id,
        missingId: record.partTimeJobId,
      });
    }
    if (record.creditCardId && !cardIds.has(record.creditCardId)) {
      problems.push({
        kind: 'missing-credit-card',
        ownerType: 'money-record',
        ownerId: record.id,
        missingId: record.creditCardId,
      });
    }
  }

  for (const subscription of data.subscriptions) {
    if (subscription.creditCardId && !cardIds.has(subscription.creditCardId)) {
      problems.push({
        kind: 'missing-credit-card',
        ownerType: 'subscription',
        ownerId: subscription.id,
        missingId: subscription.creditCardId,
      });
    }
  }

  return problems;
};

export const assertReferenceIntegrity = (data: AppBackupData['data']): void => {
  const problems = auditReferenceIntegrity(data);
  if (problems.length === 0) return;

  const sample = problems
    .slice(0, 3)
    .map((problem) => `${problem.ownerType}:${problem.ownerId} -> ${problem.missingId}`)
    .join(', ');
  throw new Error(`参照先が存在しないデータが ${problems.length}件あります。${sample}`);
};
