// Conservative R2 retention: keep multiple recoverable copies, but don't
// allow daily metadata or historical image revisions to grow indefinitely.
export const D1_BACKUP_DAYS = 14;
export const IMAGE_MANIFEST_DAYS = 7;
export const IMAGE_VERSION_DAYS = 30;
export const MIN_D1_RECOVERY_POINTS = 2;
export const MIN_MANIFEST_RECOVERY_POINTS = 2;
export const IMAGE_VERSIONS_PER_SOURCE = 2;

export type BackupObject = { key: string; uploaded: Date };

const olderThan = (uploaded: Date, now: Date, days: number): boolean =>
  Number.isFinite(uploaded.getTime()) && uploaded.getTime() < now.getTime() - days * 86_400_000;

export const selectExpiredBackupKeys = (
  objects: BackupObject[],
  now: Date,
): string[] => {
  const expired = new Set<string>();
  const preserveLatest = (items: BackupObject[], keep: number, days: number) => {
    const sorted = [...items].sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime());
    for (const item of sorted.slice(keep)) {
      if (olderThan(item.uploaded, now, days)) expired.add(item.key);
    }
  };

  preserveLatest(objects.filter((object) => object.key.startsWith('d1-calendar-snapshots/')),
    MIN_D1_RECOVERY_POINTS, D1_BACKUP_DAYS);
  preserveLatest(objects.filter((object) => object.key.startsWith('r2-images/manifests/')),
    MIN_MANIFEST_RECOVERY_POINTS, IMAGE_MANIFEST_DAYS);

  const revisions = new Map<string, BackupObject[]>();
  for (const object of objects) {
    if (!object.key.startsWith('r2-images/objects/')) continue;
    // A key is r2-images/objects/{source}/__versions/{etag}; match at the
    // last marker because directory names may otherwise share prefixes.
    const marker = '/__versions/';
    const separator = object.key.lastIndexOf(marker);
    if (separator < 0 || separator + marker.length === object.key.length) continue;
    const source = object.key.slice(0, separator);
    const group = revisions.get(source) ?? [];
    group.push(object);
    revisions.set(source, group);
  }
  for (const entries of revisions.values()) {
    // Protect the newest two image versions forever, even if the original
    // image was removed from the calendar. Older revisions expire after 30d.
    preserveLatest(entries, IMAGE_VERSIONS_PER_SOURCE, IMAGE_VERSION_DAYS);
  }

  return [...expired].sort();
};
