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

test('reconciles account-credit ISLR event with purchase concept, base and journal retention', () => {
  const purchase = {
    id: 'p1', companyId: 'c1', supplierRif: 'J-12345678-9',
    documentType: '01', taxableBaseBs: 100, exemptAmountBs: 0,
    isCancelled: false, islrConceptCode: '003', islrBasePercentage: 90,
    islrUnitTaxValueBs: 43, islrWithheldBs: 5
  };
  const journal = {
    id: 'j1', companyId: 'c1', date: '2026-10-01', type: 'COMPRA',
    items: [{ accountCode: '2.1.2.04', debitBs: 0, creditBs: 5 }]
  };
  const fiscalEvent = {
    id: 'e1', companyId: 'c1', supplierRif: 'J-12345678-9',
    conceptCode: '003', fiscalDate: '2026-10-01', sequence: 1,
    kind: 'ACCOUNT_CREDIT', allocations: [{ purchaseId: 'p1', baseAmountBs: 100 }],
    basePercentage: 90, unitTaxValueBs: 43, withheldAmountBs: 5,
    journalEntryId: 'j1', createdAt: '2026-10-01T10:00:00.000Z'
  };
  assert.doesNotThrow(() => validateIslrFiscalEventLedger(
    { purchases: [purchase], journalEntries: [journal], islrFiscalEvents: [] },
    { purchases: [purchase], journalEntries: [journal], islrFiscalEvents: [fiscalEvent] }
  ));
  assert.throws(() => validateIslrFiscalEventLedger(
    { purchases: [purchase], journalEntries: [journal], islrFiscalEvents: [] },
    { purchases: [purchase], journalEntries: [{ ...journal, items: [] }], islrFiscalEvents: [fiscalEvent] }
  ), /asiento de compra no concilia/);
});

test('requires and reconciles an ISLR voucher for positive account-credit withholding', () => {
  const purchase = {
    id: 'p1', companyId: 'c1', supplierRif: 'J-12345678-9',
    documentType: '01', invoiceDate: '2026-10-01', invoiceNumber: 'F-001',
    taxableBaseBs: 100, exemptAmountBs: 0, isCancelled: false,
    islrConceptCode: '003', islrBasePercentage: 90,
    islrUnitTaxValueBs: 43, islrWithheldBs: 5
  };
  const journal = {
    id: 'j1', companyId: 'c1', date: '2026-10-01', type: 'COMPRA',
    items: [{ accountCode: '2.1.2.04', debitBs: 0, creditBs: 5 }]
  };
  const voucher = {
    id: 'v1', companyId: 'c1', supplierRif: 'J-12345678-9',
    conceptCode: '003', invoiceNumber: 'F-001', invoiceDate: '2026-10-01',
    baseAmountBs: 100, withheldAmountBs: 5
  };
  const event = {
    id: 'e1', companyId: 'c1', supplierRif: 'J-12345678-9',
    conceptCode: '003', fiscalDate: '2026-10-01', sequence: 1,
    kind: 'ACCOUNT_CREDIT', allocations: [{ purchaseId: 'p1', baseAmountBs: 100 }],
    basePercentage: 90, unitTaxValueBs: 43, withheldAmountBs: 5,
    journalEntryId: 'j1', voucherId: 'v1', createdAt: '2026-10-01T10:00:00.000Z'
  };
  const previous = { purchases: [purchase], journalEntries: [journal], islrVouchers: [], islrFiscalEvents: [] };
  const next = { ...previous, islrVouchers: [voucher], islrFiscalEvents: [event] };
  assert.doesNotThrow(() => validateIslrFiscalEventLedger(previous, next));
  assert.throws(() => validateIslrFiscalEventLedger(previous, {
    ...next, islrVouchers: []
  }), /comprobante emitido no existe/);
  assert.throws(() => validateIslrFiscalEventLedger(previous, {
    ...next, islrVouchers: [{ ...voucher, withheldAmountBs: 4 }]
  }), /comprobante emitido no existe/);
});
