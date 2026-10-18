import type { CalendarDataSnapshot } from '../../src/repositories/calendarRepository';

export const managedImagePrefix = 'daily-images/optimized/';

export type ImageObjectInfo = {
  key: string;
  size: number;
};

export type ImageStorageSummary = {
  objectCount: number;
  totalBytes: number;
  referencedCount: number;
  orphanCount: number;
  orphanBytes: number;
  orphanKeys: string[];
};

export const collectReferencedImageKeys = (snapshots: CalendarDataSnapshot[]): Set<string> => {
  const keys = new Set<string>();

  for (const snapshot of snapshots) {
    for (const photo of snapshot.dailyPhotos ?? []) {
      const key = photo.imageKey?.trim();
      if (key?.startsWith(managedImagePrefix)) keys.add(key);
    }
  }

  return keys;
};

export const summarizeImageStorage = (
  objects: ImageObjectInfo[],
  referencedKeys: Set<string>,
): ImageStorageSummary => {
  const managedObjects = objects.filter((object) => object.key.startsWith(managedImagePrefix));
  const orphans = managedObjects.filter((object) => !referencedKeys.has(object.key));
  const existingKeys = new Set(managedObjects.map((object) => object.key));
  const referencedCount = [...referencedKeys].filter((key) => existingKeys.has(key)).length;

  return {
    objectCount: managedObjects.length,
    totalBytes: managedObjects.reduce((sum, object) => sum + object.size, 0),
    referencedCount,
    orphanCount: orphans.length,
    orphanBytes: orphans.reduce((sum, object) => sum + object.size, 0),
    orphanKeys: orphans.map((object) => object.key).sort(),
  };
};

export const selectConfirmedOrphans = (
  requestedKeys: string[],
  existingObjects: ImageObjectInfo[],
  referencedKeys: Set<string>,
): string[] => {
  const existing = new Set(
    existingObjects
      .filter((object) => object.key.startsWith(managedImagePrefix))
      .map((object) => object.key),
  );

  return [...new Set(requestedKeys)]
    .filter((key) => key.startsWith(managedImagePrefix))
    .filter((key) => existing.has(key))
    .filter((key) => !referencedKeys.has(key))
    .sort();
};
