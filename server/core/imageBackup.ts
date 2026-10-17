export type ImageBackupManifestEntry = {
  sourceKey: string;
  sourceEtag: string;
  sourceUploadedAt: string;
  backupKey: string;
  size: number;
};

const sanitizeEtag = (etag: string): string => {
  const normalized = etag.replace(/^W\//, '').replaceAll('"', '').trim();
  return normalized.replace(/[^A-Za-z0-9._-]/g, '_') || 'unknown-etag';
};

export const getImageBackupKey = (sourceKey: string, etag: string): string =>
  `r2-images/objects/${sourceKey}/__versions/${sanitizeEtag(etag)}`;

export const getImageBackupPrefix = (sourceKey: string): string =>
  `r2-images/objects/${sourceKey}/__versions/`;

export const getImageBackupManifestKey = (createdAt: string): string => {
  const dateKey = createdAt.slice(0, 10);
  return `r2-images/manifests/${dateKey}/${createdAt.replace(/[:.]/g, '-')}.json`;
};

export const createImageBackupManifest = (
  entries: ImageBackupManifestEntry[],
  createdAt: string,
) => ({
  schemaVersion: 1,
  createdAt,
  imageCount: entries.length,
  entries,
});
