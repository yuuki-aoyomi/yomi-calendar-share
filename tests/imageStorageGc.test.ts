import assert from 'node:assert/strict';
import test from 'node:test';
import type { CalendarDataSnapshot } from '../src/repositories/calendarRepository.ts';
import {
  collectReferencedImageKeys,
  collectImageReferencesFromJson,
  imageGcGracePeriodMs,
  selectConfirmedOrphans,
  summarizeImageStorage,
} from '../server/core/imageStorageGc.ts';

const emptySnapshot = (): CalendarDataSnapshot => ({
  events: [],
  moneyRecords: [],
  loveLogs: [],
  tags: [],
  partTimeJobs: [],
  creditCards: [],
  subscriptions: [],
  dailyPhotos: [],
});

test('image storage summary finds only managed unreferenced objects as orphans', () => {
  const snapshot = emptySnapshot();
  snapshot.dailyPhotos.push({
    id: 'photo',
    date: '2026-10-18',
    imageUrl: '/api/images/daily-images/optimized/default/used.webp',
    imageKey: 'daily-images/optimized/default/used.webp',
    createdAt: '',
    updatedAt: '',
  });

  const referenced = collectReferencedImageKeys([snapshot]);
  const summary = summarizeImageStorage([
    { key: 'daily-images/optimized/default/used.webp', size: 100 },
    { key: 'daily-images/optimized/default/orphan.webp', size: 250 },
    { key: 'other/unmanaged.bin', size: 999 },
  ], referenced);

  assert.deepEqual(summary, {
    objectCount: 2,
    totalBytes: 350,
    referencedCount: 1,
    orphanCount: 1,
    orphanBytes: 250,
    orphanKeys: ['daily-images/optimized/default/orphan.webp'],
  });
});

test('GC selection refuses referenced, missing, unmanaged and duplicate keys', () => {
  const uploaded = new Date(Date.now() - 2 * imageGcGracePeriodMs);
  const objects = [
    { key: 'daily-images/optimized/default/used.webp', size: 100, uploaded },
    { key: 'daily-images/optimized/default/orphan.webp', size: 250, uploaded },
  ];
  const referenced = new Set(['daily-images/optimized/default/used.webp']);

  assert.deepEqual(
    selectConfirmedOrphans([
      'daily-images/optimized/default/orphan.webp',
      'daily-images/optimized/default/orphan.webp',
      'daily-images/optimized/default/used.webp',
      'daily-images/optimized/default/missing.webp',
      'other/unmanaged.bin',
    ], objects, referenced),
    ['daily-images/optimized/default/orphan.webp'],
  );
});

test('GC protects recent uploads, future dates and objects with unknown upload time', () => {
  const now = new Date('2026-10-21T00:00:00Z');
  const key = (name: string) => `daily-images/optimized/default/${name}.webp`;
  const objects = [
    { key: key('old'), size: 1, uploaded: new Date(now.getTime() - imageGcGracePeriodMs - 1) },
    { key: key('boundary'), size: 1, uploaded: new Date(now.getTime() - imageGcGracePeriodMs) },
    { key: key('recent'), size: 1, uploaded: new Date(now.getTime() - imageGcGracePeriodMs + 1) },
    { key: key('future'), size: 1, uploaded: new Date(now.getTime() + 1000) },
    { key: key('unknown'), size: 1 },
    { key: key('invalid'), size: 1, uploaded: new Date('invalid') },
  ];
  assert.deepEqual(selectConfirmedOrphans(objects.map((item) => item.key), objects, new Set(), now),
    [key('boundary'), key('old')]);
});

test('image references include legacy relative/absolute URLs and both stored key and displayed URL', () => {
  const keys = collectImageReferencesFromJson(JSON.stringify({ dailyPhotos: [
    { imageUrl: '/api/images/daily-images/optimized/default/a%20b.webp?token=old' },
    { imageKey: 'daily-images/optimized/default/key.webp', imageUrl: 'https://old.example/api/images/daily-images/optimized/default/url.webp' },
    { imageUrl: 'data:image/png;base64,example' },
    { imageUrl: 'https://external.example/photo.webp' },
    { imageUrl: '' },
  ] }));
  assert.deepEqual([...keys].sort(), [
    'daily-images/optimized/default/a b.webp',
    'daily-images/optimized/default/key.webp',
    'daily-images/optimized/default/url.webp',
  ]);
  assert.equal(collectImageReferencesFromJson('{}').size, 0);
});

test('unreadable image references fail closed rather than looking like an empty snapshot', () => {
  for (const json of ['broken', 'null', '[]', '{"dailyPhotos":null}', '{"dailyPhotos":[null]}',
    '{"dailyPhotos":[{"imageKey":123}]}', '{"dailyPhotos":[{"imageUrl":{}}]}',
    '{"dailyPhotos":[{"imageUrl":"/api/images/%invalid"}]}']) {
    assert.throws(() => collectImageReferencesFromJson(json), undefined, json);
  }
});
