import type { AppBackupData } from '../types/calendar';
import { assertReferenceIntegrity } from './referenceIntegrity';

export type PartialExportSelection = {
  events?: boolean;
  todos?: boolean;
  moneyRecords?: boolean;
  loveLogs?: boolean;
  tags?: boolean;
  settings?: boolean;
  dailyPhotos?: boolean;
};

export type PartialTransferPayload = {
  app: 'yomi-calendar-share-partial';
  version: 1;
  exportedAt: string;
  selection: PartialExportSelection;
  data: AppBackupData['data'];
};

export type ImportStrategy = 'merge' | 'skip' | 'overwrite';

type CollectionName = keyof AppBackupData['data'];

type CollectionPreview = {
  incoming: number;
  newItems: number;
  duplicateIds: number;
  conflictingIds: number;
  duplicateContent: number;
};

export type PartialImportPreview = Record<CollectionName, CollectionPreview>;

const emptyData = (): AppBackupData['data'] => ({
  events: [],
  moneyRecords: [],
  loveLogs: [],
  tags: [],
  partTimeJobs: [],
  creditCards: [],
  subscriptions: [],
  dailyPhotos: [],
});

const collectionNames: CollectionName[] = [
  'events',
  'moneyRecords',
  'loveLogs',
  'tags',
  'partTimeJobs',
  'creditCards',
  'subscriptions',
  'dailyPhotos',
];

const canonicalize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const contentFingerprint = (value: unknown): string => {
  if (!value || typeof value !== 'object') return canonicalize(value);
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...content } = value as Record<string, unknown>;
  return canonicalize(content);
};

const exactFingerprint = (value: unknown): string => canonicalize(value);

export const createPartialExport = (
  data: AppBackupData['data'],
  selection: PartialExportSelection,
  exportedAt = new Date().toISOString(),
): PartialTransferPayload => {
  const result = emptyData();

  result.events = data.events.filter((event) =>
    event.category === 'todo' ? Boolean(selection.todos) : Boolean(selection.events),
  );
  result.moneyRecords = selection.moneyRecords ? [...data.moneyRecords] : [];
  result.loveLogs = selection.loveLogs ? [...data.loveLogs] : [];
  result.dailyPhotos = selection.dailyPhotos ? [...data.dailyPhotos] : [];

  const requiredJobIds = new Set(
    result.moneyRecords.map((record) => record.partTimeJobId).filter((id): id is string => Boolean(id)),
  );
  const requiredCardIds = new Set(
    result.moneyRecords.map((record) => record.creditCardId).filter((id): id is string => Boolean(id)),
  );

  result.partTimeJobs = selection.settings
    ? [...data.partTimeJobs]
    : data.partTimeJobs.filter((job) => requiredJobIds.has(job.id));
  result.creditCards = selection.settings
    ? [...data.creditCards]
    : data.creditCards.filter((card) => requiredCardIds.has(card.id));
  result.subscriptions = selection.settings ? [...data.subscriptions] : [];

  for (const subscription of result.subscriptions) {
    if (subscription.creditCardId) requiredCardIds.add(subscription.creditCardId);
  }
  if (!selection.settings && requiredCardIds.size > result.creditCards.length) {
    result.creditCards = data.creditCards.filter((card) => requiredCardIds.has(card.id));
  }

  const requiredTagIds = new Set<string>();
  result.events.forEach((event) => (event.tagIds ?? []).forEach((id) => requiredTagIds.add(id)));
  result.partTimeJobs.forEach((job) => requiredTagIds.add(job.tagId));
  result.creditCards.forEach((card) => requiredTagIds.add(card.tagId));

  result.tags = selection.tags
    ? [...data.tags]
    : data.tags.filter((tag) => requiredTagIds.has(tag.id));

  assertReferenceIntegrity(result);

  return {
    app: 'yomi-calendar-share-partial',
    version: 1,
    exportedAt,
    selection: { ...selection },
    data: result,
  };
};

export const validatePartialTransferPayload = (value: unknown): PartialTransferPayload => {
  if (!value || typeof value !== 'object') {
    throw new Error('部分Importデータの形式が正しくありません。');
  }

  const payload = value as PartialTransferPayload;
  if (payload.app !== 'yomi-calendar-share-partial' || payload.version !== 1 || !payload.data) {
    throw new Error('対応していない部分Importデータです。');
  }

  for (const collection of collectionNames) {
    if (!Array.isArray(payload.data[collection])) {
      throw new Error(`${collection} が配列ではありません。`);
    }
  }

  assertReferenceIntegrity(payload.data);
  return payload;
};

export const previewPartialImport = (
  current: AppBackupData['data'],
  payload: PartialTransferPayload,
): PartialImportPreview => {
  const preview = {} as PartialImportPreview;

  for (const collection of collectionNames) {
    const currentItems = current[collection] as Array<{ id: string }>;
    const incomingItems = payload.data[collection] as Array<{ id: string }>;
    const byId = new Map(currentItems.map((item) => [item.id, item]));
    const contentKeys = new Set(currentItems.map(contentFingerprint));
    let newItems = 0;
    let duplicateIds = 0;
    let conflictingIds = 0;
    let duplicateContent = 0;

    for (const incoming of incomingItems) {
      const existing = byId.get(incoming.id);
      if (existing) {
        if (exactFingerprint(existing) === exactFingerprint(incoming)) duplicateIds += 1;
        else conflictingIds += 1;
        continue;
      }

      if (contentKeys.has(contentFingerprint(incoming))) {
        duplicateContent += 1;
      } else {
        newItems += 1;
      }
    }

    preview[collection] = {
      incoming: incomingItems.length,
      newItems,
      duplicateIds,
      conflictingIds,
      duplicateContent,
    };
  }

  return preview;
};

const mergeCollection = <T extends { id: string }>(
  current: T[],
  incoming: T[],
  strategy: ImportStrategy,
): T[] => {
  const result = [...current];
  const indexById = new Map(result.map((item, index) => [item.id, index]));
  const contentKeys = new Set(result.map(contentFingerprint));

  for (const item of incoming) {
    const existingIndex = indexById.get(item.id);

    if (existingIndex !== undefined) {
      if (strategy === 'overwrite') {
        result[existingIndex] = item;
        contentKeys.add(contentFingerprint(item));
      }
      continue;
    }

    if (strategy === 'skip' && contentKeys.has(contentFingerprint(item))) continue;

    indexById.set(item.id, result.length);
    contentKeys.add(contentFingerprint(item));
    result.push(item);
  }

  return result;
};

export const mergePartialImport = (
  current: AppBackupData['data'],
  payload: PartialTransferPayload,
  strategy: ImportStrategy,
): AppBackupData['data'] => {
  validatePartialTransferPayload(payload);

  const merged: AppBackupData['data'] = {
    events: mergeCollection(current.events, payload.data.events, strategy),
    moneyRecords: mergeCollection(current.moneyRecords, payload.data.moneyRecords, strategy),
    loveLogs: mergeCollection(current.loveLogs, payload.data.loveLogs, strategy),
    tags: mergeCollection(current.tags, payload.data.tags, strategy),
    partTimeJobs: mergeCollection(current.partTimeJobs, payload.data.partTimeJobs, strategy),
    creditCards: mergeCollection(current.creditCards, payload.data.creditCards, strategy),
    subscriptions: mergeCollection(current.subscriptions, payload.data.subscriptions, strategy),
    dailyPhotos: mergeCollection(current.dailyPhotos, payload.data.dailyPhotos, strategy),
  };

  assertReferenceIntegrity(merged);
  return merged;
};
