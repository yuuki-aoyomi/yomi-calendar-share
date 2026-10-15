import type { CalendarDataSnapshot } from '../repositories/calendarRepository';

type Identified = { id: string };

type MergeConflict = {
  collection: keyof CalendarDataSnapshot;
  id: string;
  kind: 'concurrent_edit' | 'delete_vs_edit';
};

export type CalendarMergeResult = {
  snapshot: CalendarDataSnapshot;
  conflicts: MergeConflict[];
};

const sameValue = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const mergeCollection = <T extends Identified>(
  collection: keyof CalendarDataSnapshot,
  baseItems: T[],
  localItems: T[],
  remoteItems: T[],
): { items: T[]; conflicts: MergeConflict[] } => {
  const base = new Map(baseItems.map((item) => [item.id, item]));
  const local = new Map(localItems.map((item) => [item.id, item]));
  const remote = new Map(remoteItems.map((item) => [item.id, item]));
  const ids = new Set([...base.keys(), ...local.keys(), ...remote.keys()]);
  const resolved = new Map<string, T>();
  const conflicts: MergeConflict[] = [];

  for (const id of ids) {
    const baseItem = base.get(id);
    const localItem = local.get(id);
    const remoteItem = remote.get(id);

    if (sameValue(localItem, remoteItem)) {
      if (localItem) resolved.set(id, localItem);
      continue;
    }

    if (sameValue(baseItem, localItem)) {
      if (remoteItem) resolved.set(id, remoteItem);
      continue;
    }

    if (sameValue(baseItem, remoteItem)) {
      if (localItem) resolved.set(id, localItem);
      continue;
    }

    if (!baseItem) {
      if (localItem && !remoteItem) resolved.set(id, localItem);
      else if (remoteItem && !localItem) resolved.set(id, remoteItem);
      else conflicts.push({ collection, id, kind: 'concurrent_edit' });
      continue;
    }

    if (!localItem || !remoteItem) {
      conflicts.push({ collection, id, kind: 'delete_vs_edit' });
      continue;
    }

    conflicts.push({ collection, id, kind: 'concurrent_edit' });
  }

  const orderedIds = [
    ...remoteItems.map((item) => item.id),
    ...localItems.map((item) => item.id).filter((id) => !remote.has(id)),
  ];
  const seen = new Set<string>();
  const items: T[] = [];

  for (const id of orderedIds) {
    if (seen.has(id)) continue;
    const item = resolved.get(id);
    if (item) items.push(item);
    seen.add(id);
  }

  for (const [id, item] of resolved) {
    if (!seen.has(id)) items.push(item);
  }

  return { items, conflicts };
};

export const mergeCalendarSnapshots = (
  base: CalendarDataSnapshot,
  local: CalendarDataSnapshot,
  remote: CalendarDataSnapshot,
): CalendarMergeResult => {
  const events = mergeCollection('events', base.events, local.events, remote.events);
  const moneyRecords = mergeCollection('moneyRecords', base.moneyRecords, local.moneyRecords, remote.moneyRecords);
  const loveLogs = mergeCollection('loveLogs', base.loveLogs, local.loveLogs, remote.loveLogs);
  const tags = mergeCollection('tags', base.tags, local.tags, remote.tags);
  const partTimeJobs = mergeCollection('partTimeJobs', base.partTimeJobs, local.partTimeJobs, remote.partTimeJobs);
  const creditCards = mergeCollection('creditCards', base.creditCards, local.creditCards, remote.creditCards);
  const subscriptions = mergeCollection('subscriptions', base.subscriptions, local.subscriptions, remote.subscriptions);
  const dailyPhotos = mergeCollection('dailyPhotos', base.dailyPhotos, local.dailyPhotos, remote.dailyPhotos);

  return {
    snapshot: {
      events: events.items,
      moneyRecords: moneyRecords.items,
      loveLogs: loveLogs.items,
      tags: tags.items,
      partTimeJobs: partTimeJobs.items,
      creditCards: creditCards.items,
      subscriptions: subscriptions.items,
      dailyPhotos: dailyPhotos.items,
    },
    conflicts: [
      ...events.conflicts,
      ...moneyRecords.conflicts,
      ...loveLogs.conflicts,
      ...tags.conflicts,
      ...partTimeJobs.conflicts,
      ...creditCards.conflicts,
      ...subscriptions.conflicts,
      ...dailyPhotos.conflicts,
    ],
  };
};
