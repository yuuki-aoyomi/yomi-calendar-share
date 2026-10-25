import test from 'node:test';
import assert from 'node:assert/strict';
import { isDateKey, validateCardTransactionPatch } from '../server/core/cardTransactions';

test('validates real calendar dates', () => {
  assert.equal(isDateKey('2026-02-28'), true);
  assert.equal(isDateKey('2026-02-30'), false);
  assert.equal(isDateKey('2024-02-29'), true);
});

test('rejects unknown and unsafe patch fields', () => {
  assert.equal(validateCardTransactionPatch({ expectedRevision: 0, sourceId: 'attacker' }).ok, false);
  assert.equal(validateCardTransactionPatch({ expectedRevision: 0, amountYen: -10 }).ok, false);
  assert.equal(validateCardTransactionPatch({ expectedRevision: 0, status: 'unknown' }).ok, false);
  for (const status of [['confirmed'], { value: 'confirmed' }, 1, true, null]) {
    assert.equal(validateCardTransactionPatch({ expectedRevision: 0, status }).ok, false);
  }
  assert.equal(validateCardTransactionPatch({ expectedRevision: 0, confirmedAmountYen: 10.5 }).ok, false);
  assert.equal(validateCardTransactionPatch({ expectedRevision: 0, confirmedPaymentDate: '2026-02-30' }).ok, false);
  assert.equal(validateCardTransactionPatch({ expectedRevision: 0 }).ok, false);
});

test('accepts editable confirmation metadata', () => {
  assert.deepEqual(validateCardTransactionPatch({ expectedRevision: 0,
    status: 'confirmed',
    confirmedAmountYen: 500,
    confirmedPaymentDate: '2026-11-10',
    needsReview: false,
  }), {
    ok: true,
    expectedRevision: 0,
    value: { status: 'confirmed', confirmedAmountYen: 500,
      confirmedPaymentDate: '2026-11-10', needsReview: false },
  });
});
