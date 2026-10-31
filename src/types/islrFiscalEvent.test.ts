import test from 'node:test';
import assert from 'node:assert/strict';
import { IslrFiscalEvent, allocateIslrFiscalReversal, resolvePurchaseIslrFiscalTrigger, validateIslrFiscalEventLedger } from './islrFiscalEvent';

const event = (overrides: Partial<IslrFiscalEvent> = {}): IslrFiscalEvent => ({
  id: 'event-1', companyId: 'company-1', supplierRif: 'J-12345678-9',
  conceptCode: '005', fiscalDate: '2025-07-10', sequence: 1, kind: 'PAYMENT',
  allocations: [{ purchaseId: 'purchase-1', baseAmountBs: 1000 }],
  basePercentage: 90, unitTaxValueBs: 43, withheldAmountBs: 0,
  journalEntryId: 'journal-1', createdAt: '2025-07-10T12:00:00.000Z', ...overrides
});
const eligible = { 'purchase-1': 1000 };

test('cash purchases record ISLR on payment while credit purchases record it on account credit', () => {
  assert.equal(resolvePurchaseIslrFiscalTrigger('CONTADO'), 'PAYMENT');
  assert.equal(resolvePurchaseIslrFiscalTrigger('CREDITO'), 'ACCOUNT_CREDIT');
  assert.equal(resolvePurchaseIslrFiscalTrigger(undefined), 'ACCOUNT_CREDIT');
});


test('accepts a valid first fiscal event with verified date-specific UT snapshot', () => {
  assert.doesNotThrow(() => validateIslrFiscalEventLedger([], [event()], eligible));
});

test('rejects unverified UT snapshots for event date', () => {
  assert.throws(() => validateIslrFiscalEventLedger([], [event({ unitTaxValueBs: 9 })], eligible), /snapshot de UT/);
});

test('rejects duplicate sequence numbers on the same company date', () => {
  assert.throws(() => validateIslrFiscalEventLedger([], [
    event(), event({ id: 'event-2', journalEntryId: 'journal-2' })
  ], eligible), /secuencia.*duplicada/);
});

test('prevents payment and account-credit events from withholding the same invoice base twice', () => {
  assert.throws(() => validateIslrFiscalEventLedger([], [
    event(),
    event({ id: 'event-2', sequence: 2, kind: 'ACCOUNT_CREDIT', journalEntryId: 'journal-2' })
  ], eligible), /doble retención/);
});

test('allows partial events up to the invoice eligible base', () => {
  assert.doesNotThrow(() => validateIslrFiscalEventLedger([], [
    event({ allocations: [{ purchaseId: 'purchase-1', baseAmountBs: 400 }] }),
    event({ id: 'event-2', sequence: 2, kind: 'ACCOUNT_CREDIT', journalEntryId: 'journal-2',
      allocations: [{ purchaseId: 'purchase-1', baseAmountBs: 600 }] })
  ], eligible));
});

test('requires exact immutable reversal and preserves original event', () => {
  const original = event();
  const reversal = event({
    id: 'event-reversal', kind: 'REVERSAL', sequence: 2,
    journalEntryId: 'journal-reversal', reversalOfEventId: original.id,
    reversalReason: 'Corrección documentada'
  });
  assert.doesNotThrow(() => validateIslrFiscalEventLedger([], [original, reversal], eligible));
  assert.throws(() => validateIslrFiscalEventLedger([original], [
    { ...original, withheldAmountBs: 1 }
  ], eligible), /inmutable/);
});

test('rejects reversal of a nonexistent event or reversal without reason', () => {
  assert.throws(() => validateIslrFiscalEventLedger([], [
    event({ id: 'reversal', kind: 'REVERSAL', reversalOfEventId: 'missing' })
  ], eligible), /reversión fiscal/);
});

test('rejects allocations above the eligible invoice base', () => {
  assert.throws(() => validateIslrFiscalEventLedger([], [
    event({ allocations: [{ purchaseId: 'purchase-1', baseAmountBs: 1000.02 }] })
  ], eligible), /doble retención/);
});

test('rejects missing invoice allocations', () => {
  assert.throws(() => validateIslrFiscalEventLedger([], [
    event({ allocations: [{ purchaseId: 'missing', baseAmountBs: 10 }] })
  ], eligible), /facturas válidas/);
});

test('rejects a second reversal of an event already reversed in persisted history', () => {
  const original = event();
  const firstReversal = event({
    id: 'event-reversal-1', kind: 'REVERSAL', sequence: 2,
    journalEntryId: 'journal-reversal-1', reversalOfEventId: original.id,
    reversalReason: 'Primera corrección'
  });
  const secondReversal = event({
    id: 'event-reversal-2', kind: 'REVERSAL', sequence: 3,
    journalEntryId: 'journal-reversal-2', reversalOfEventId: original.id,
    reversalReason: 'Intento de segunda corrección'
  });
  assert.throws(() => validateIslrFiscalEventLedger(
    [original, firstReversal], [original, firstReversal, secondReversal], eligible
  ), /supera la base pendiente/);
});

test('preserves legacy duplicate sequences while rejecting new collisions', () => {
  const eligibleWithSecond = { ...eligible, 'purchase-2': 1000 };
  const legacyOne = event({ id: 'legacy-1', sequence: 7, allocations: [{ purchaseId: 'purchase-1', baseAmountBs: 400 }] });
  const legacyTwo = event({ id: 'legacy-2', sequence: 7, allocations: [{ purchaseId: 'purchase-2', baseAmountBs: 400 }] });
  assert.doesNotThrow(() => validateIslrFiscalEventLedger(
    [legacyOne, legacyTwo], [legacyOne, legacyTwo], eligibleWithSecond
  ));
  assert.throws(() => validateIslrFiscalEventLedger(
    [legacyOne, legacyTwo],
    [legacyOne, legacyTwo, event({ id: 'new-collision', sequence: 7, allocations: [{ purchaseId: 'purchase-1', baseAmountBs: 100 }] })],
    eligibleWithSecond
  ), /secuencia.*duplicada/);
  assert.doesNotThrow(() => validateIslrFiscalEventLedger(
    [legacyOne, legacyTwo],
    [legacyOne, legacyTwo, event({ id: 'new-sequence', sequence: 8, allocations: [{ purchaseId: 'purchase-1', baseAmountBs: 100 }] })],
    eligibleWithSecond
  ));
});

test('supports cumulative partial ISLR reversals without releasing unreversed base', () => {
  const original = event({ withheldAmountBs: 100 });
  const first = event({
    id: 'partial-1', kind: 'REVERSAL', sequence: 2, journalEntryId: 'journal-r1',
    allocations: [{ purchaseId: 'purchase-1', baseAmountBs: 300 }],
    withheldAmountBs: 30, reversalOfEventId: original.id, reversalReason: 'Devolución parcial inicial'
  });
  const second = event({
    id: 'partial-2', kind: 'REVERSAL', sequence: 3, journalEntryId: 'journal-r2',
    allocations: [{ purchaseId: 'purchase-1', baseAmountBs: 200 }],
    withheldAmountBs: 20, reversalOfEventId: original.id, reversalReason: 'Devolución parcial posterior'
  });
  assert.doesNotThrow(() => validateIslrFiscalEventLedger([], [original, first, second], eligible));
  const excessive = event({
    id: 'partial-3', kind: 'REVERSAL', sequence: 4, journalEntryId: 'journal-r3',
    allocations: [{ purchaseId: 'purchase-1', baseAmountBs: 600 }],
    withheldAmountBs: 60, reversalOfEventId: original.id, reversalReason: 'Excede saldo'
  });
  assert.throws(() => validateIslrFiscalEventLedger([], [original, first, second, excessive], eligible), /supera la base pendiente/);
});

test('distributes a credit-note reversal across multiple active fiscal events', () => {
  const first = event({ id: 'payment-1', sequence: 1, kind: 'PAYMENT',
    allocations: [{ purchaseId: 'purchase-1', baseAmountBs: 400 }], withheldAmountBs: 40 });
  const second = event({ id: 'credit-1', sequence: 2, kind: 'ACCOUNT_CREDIT',
    allocations: [{ purchaseId: 'purchase-1', baseAmountBs: 600 }], withheldAmountBs: 60 });
  const prior = event({ id: 'prior-reversal', kind: 'REVERSAL', sequence: 3,
    allocations: [{ purchaseId: 'purchase-1', baseAmountBs: 100 }], withheldAmountBs: 10,
    reversalOfEventId: first.id, reversalReason: 'Devolución parcial anterior' });
  const allocations = allocateIslrFiscalReversal([first, second, prior], 'purchase-1', 500);
  assert.equal(allocations.length, 2);
  assert.deepEqual(allocations.map(item => item.originalEvent.id), ['payment-1', 'credit-1']);
  assert.equal(allocations[0].baseAmountBs, 166.67);
  assert.equal(allocations[0].withheldAmountBs, 16.67);
  assert.equal(allocations[1].baseAmountBs, 333.33);
  assert.equal(allocations[1].withheldAmountBs, 33.33);
  assert.equal(allocations.reduce((sum, item) => sum + item.baseAmountBs, 0), 500);
  assert.equal(allocations.reduce((sum, item) => sum + item.withheldAmountBs, 0), 50);
});

test('rejects a credit-note reversal above the combined unreversed fiscal base', () => {
  const first = event({ id: 'payment-1', allocations: [{ purchaseId: 'purchase-1', baseAmountBs: 400 }], withheldAmountBs: 40 });
  const second = event({ id: 'credit-1', sequence: 2, allocations: [{ purchaseId: 'purchase-1', baseAmountBs: 600 }], withheldAmountBs: 60 });
  assert.throws(() => allocateIslrFiscalReversal([first, second], 'purchase-1', 1000.02), /supera la base ISLR pendiente/);
});
