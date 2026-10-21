import test from 'node:test';
import assert from 'node:assert/strict';
import { isDateKey, validateCardTransactionPatch } from '../server/core/cardTransactions';

test('validates real calendar dates', () => {
  assert.equal(isDateKey('2026-02-28'), true);
  assert.equal(isDateKey('2026-02-30'), false);
  assert.equal(isDateKey('2024-02-29'), true);
});

test('rejects unknown and unsafe patch fields', () => {
  assert.equal(validateCardTransactionPatch({ sourceId: 'attacker' }).ok, false);
  assert.equal(validateCardTransactionPatch({ amountYen: -10 }).ok, false);
  assert.equal(validateCardTransactionPatch({ status: 'unknown' }).ok, false);
  for (const status of [['confirmed'], { value: 'confirmed' }, 1, true, null]) {
    assert.equal(validateCardTransactionPatch({ status }).ok, false);
  }
  assert.equal(validateCardTransactionPatch({ confirmedAmountYen: 10.5 }).ok, false);
  assert.equal(validateCardTransactionPatch({ confirmedPaymentDate: '2026-02-30' }).ok, false);
  assert.equal(validateCardTransactionPatch({}).ok, false);
});

test('accepts editable confirmation metadata', () => {
  assert.deepEqual(validateCardTransactionPatch({
    status: 'confirmed',
    confirmedAmountYen: 500,
    confirmedPaymentDate: '2026-11-10',
    needsReview: false,
  }), {
    ok: true,
    value: { status: 'confirmed', confirmedAmountYen: 500,
      confirmedPaymentDate: '2026-11-10', needsReview: false },
  });
});
