import type { CalendarDataSnapshot } from '../../src/repositories/calendarRepository';

export const managedImagePrefix = 'daily-images/optimized/';
export const imageGcGracePeriodMs = 24 * 60 * 60 * 1000;

export type ImageObjectInfo = {
  key: string;
  size: number;
  uploaded?: Date;
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
      const legacyKey = getManagedImageUrlKey(photo.imageUrl);
      if (legacyKey) keys.add(legacyKey);
    }
  }

  return keys;
};

const getManagedImageUrlKey = (value: string | undefined): string | undefined => {
  if (!value || /^(data:|blob:)/i.test(value)) return undefined;
  const url = new URL(value, 'https://calendar.invalid');
  if (!['http:', 'https:'].includes(url.protocol) || !url.pathname.startsWith('/api/images/')) return undefined;
  const key = decodeURIComponent(url.pathname.slice('/api/images/'.length));
  return key.startsWith(managedImagePrefix) ? key : undefined;
};

// GC must never interpret an unreadable snapshot as an empty calendar.
// Inspect raw JSON here instead of the display path's permissive parser.
export const collectImageReferencesFromJson = (snapshotJson: string): Set<string> => {
  const snapshot: unknown = JSON.parse(snapshotJson);
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Invalid image reference snapshot.');
  }
  const photos = (snapshot as { dailyPhotos?: unknown }).dailyPhotos;
  if (photos === undefined) return new Set(); // Older snapshots may omit photos.
  if (!Array.isArray(photos)) throw new Error('Invalid photo collection.');
  const keys = new Set<string>();
  for (const photo of photos) {
    if (!photo || typeof photo !== 'object' || Array.isArray(photo)) throw new Error('Invalid photo reference.');
    const { imageKey, imageUrl } = photo as { imageKey?: unknown; imageUrl?: unknown };
    if ((imageKey !== undefined && typeof imageKey !== 'string')
      || (imageUrl !== undefined && typeof imageUrl !== 'string')) {
      throw new Error('Invalid image key or URL.');
    }
    if (imageKey?.trim().startsWith(managedImagePrefix)) keys.add(imageKey.trim());
    const legacyKey = getManagedImageUrlKey(imageUrl);
    if (legacyKey) keys.add(legacyKey);
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
  now = new Date(),
): string[] => {
  const existing = new Set(
    existingObjects
      .filter((object) => object.key.startsWith(managedImagePrefix)
        && object.uploaded !== undefined
        && Number.isFinite(object.uploaded.getTime())
        && object.uploaded.getTime() <= now.getTime() - imageGcGracePeriodMs)
      .map((object) => object.key),
  );

  return [...new Set(requestedKeys)]
    .filter((key) => key.startsWith(managedImagePrefix))
    .filter((key) => existing.has(key))
    .filter((key) => !referencedKeys.has(key))
    .sort();
};
