'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateIslrFiscalEventLedger } = require('./islr-fiscal-integrity.cjs');

test('rejects duplicate ISLR sequence against historical events', () => {
  const purchase = id => ({ id, companyId: 'c1', supplierRif: 'J-12345678-9', documentType: '01', taxableBaseBs: 100, exemptAmountBs: 0, isCancelled: false });
  const journal = id => ({ id, companyId: 'c1', date: '2026-10-01' });
  const event = (id, purchaseId, journalEntryId) => ({ id, companyId: 'c1', supplierRif: 'J-12345678-9', conceptCode: '003', fiscalDate: '2026-10-01', sequence: 1, kind: 'PAYMENT', allocations: [{ purchaseId, baseAmountBs: 100 }], basePercentage: 90, unitTaxValueBs: 43, withheldAmountBs: 0, journalEntryId, createdAt: '2026-10-01T10:00:00.000Z' });
  const old = event('old', 'p1', 'j1');
  const previous = { purchases: [purchase('p1'), purchase('p2')], journalEntries: [journal('j1')], islrFiscalEvents: [old] };
  const next = { purchases: previous.purchases, journalEntries: [...previous.journalEntries, journal('j2')], islrFiscalEvents: [old, event('new', 'p2', 'j2')] };
  assert.throws(() => validateIslrFiscalEventLedger(previous, next), /secuencia de eventos ISLR duplicada/);
});

test('preserves duplicate legacy sequences when no new event is added', () => {
  const purchase = (id) => ({ id, companyId: 'c1', supplierRif: 'J-12345678-9', documentType: '01', taxableBaseBs: 100, exemptAmountBs: 0, isCancelled: false });
  const journal = (id) => ({ id, companyId: 'c1', date: '2026-10-01' });
  const event = (id, purchaseId) => ({
    id, companyId: 'c1', supplierRif: 'J-12345678-9', conceptCode: '003',
    fiscalDate: '2026-10-01', sequence: 1, kind: 'PAYMENT',
    allocations: [{ purchaseId, baseAmountBs: 50 }], basePercentage: 90,
    unitTaxValueBs: 43, withheldAmountBs: 0, journalEntryId: 'j-' + id,
    createdAt: '2026-10-01T10:00:00.000Z'
  });
  const oldOne = event('old-1', 'p1');
  const oldTwo = event('old-2', 'p2');
  const previous = {
    purchases: [purchase('p1'), purchase('p2')],
    journalEntries: [journal('j-old-1'), journal('j-old-2')],
    islrFiscalEvents: [oldOne, oldTwo]
  };
  assert.doesNotThrow(() => validateIslrFiscalEventLedger(previous, previous));
});
