import assert from 'node:assert/strict';
import test from 'node:test';
import type { CalendarDataSnapshot } from '../src/repositories/calendarRepository.ts';
import {
  collectReferencedImageKeys,
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
  const objects = [
    { key: 'daily-images/optimized/default/used.webp', size: 100 },
    { key: 'daily-images/optimized/default/orphan.webp', size: 250 },
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
