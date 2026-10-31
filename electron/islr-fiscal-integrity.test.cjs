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
    documentType: '01', invoiceDate: '2026-10-01', invoiceNumber: 'F-001', taxableBaseBs: 100, exemptAmountBs: 0,
    isCancelled: false, islrConceptCode: '003', islrBasePercentage: 90,
    islrUnitTaxValueBs: 43, islrWithheldBs: 5
  };
  const journal = {
    id: 'j1', companyId: 'c1', date: '2026-10-01', type: 'COMPRA',
    items: [{ accountCode: '2.1.2.04', debitBs: 0, creditBs: 5 }]
  };
  const voucher = { id: 'v1', companyId: 'c1', supplierRif: 'J-12345678-9', conceptCode: '003', invoiceNumber: 'F-001', invoiceDate: '2026-10-01', baseAmountBs: 100, withheldAmountBs: 5 };
  const fiscalEvent = {
    id: 'e1', companyId: 'c1', supplierRif: 'J-12345678-9',
    conceptCode: '003', fiscalDate: '2026-10-01', sequence: 1,
    kind: 'ACCOUNT_CREDIT', allocations: [{ purchaseId: 'p1', baseAmountBs: 100 }],
    basePercentage: 90, unitTaxValueBs: 43, withheldAmountBs: 5,
    journalEntryId: 'j1', voucherId: 'v1', createdAt: '2026-10-01T10:00:00.000Z'
  };
  assert.doesNotThrow(() => validateIslrFiscalEventLedger(
    { purchases: [purchase], journalEntries: [journal], islrVouchers: [], islrFiscalEvents: [] },
    { purchases: [purchase], journalEntries: [journal], islrVouchers: [voucher], islrFiscalEvents: [fiscalEvent] }
  ));
  assert.throws(() => validateIslrFiscalEventLedger(
    { purchases: [purchase], journalEntries: [journal], islrVouchers: [], islrFiscalEvents: [] },
    { purchases: [purchase], journalEntries: [{ ...journal, items: [] }], islrVouchers: [voucher], islrFiscalEvents: [fiscalEvent] }
  ), /asiento de compra no concilia/);
});

test('rejects duplicate ISLR withholding events when partial payments follow the first account-credit trigger', () => {
  const purchase = {
    id: 'p-partial', companyId: 'c1', supplierRif: 'J-12345678-9',
    documentType: '01', invoiceDate: '2026-10-01', invoiceNumber: 'F-PARTIAL',
    paymentTerm: 'CREDITO', taxableBaseBs: 100, exemptAmountBs: 0, isCancelled: false,
    islrConceptCode: '003', islrBasePercentage: 90, islrUnitTaxValueBs: 43, islrWithheldBs: 5
  };
  const journal = (id, date, type = 'COMPRA') => ({
    id, companyId: 'c1', date, type,
    items: [{ accountCode: '2.1.2.04', debitBs: 0, creditBs: 5 }]
  });
  const voucher = {
    id: 'v-partial', companyId: 'c1', supplierRif: 'J-12345678-9',
    conceptCode: '003', invoiceNumber: 'F-PARTIAL', invoiceDate: '2026-10-01',
    baseAmountBs: 100, withheldAmountBs: 5
  };
  const accountCredit = {
    id: 'e-account-credit', companyId: 'c1', supplierRif: purchase.supplierRif,
    conceptCode: '003', fiscalDate: '2026-10-01', sequence: 1, kind: 'ACCOUNT_CREDIT',
    allocations: [{ purchaseId: purchase.id, baseAmountBs: 100 }],
    basePercentage: 90, unitTaxValueBs: 43, withheldAmountBs: 5,
    journalEntryId: 'j-purchase', voucherId: 'v-partial', createdAt: '2026-10-01T10:00:00.000Z'
  };
  const paymentOne = {
    ...accountCredit, id: 'e-payment-1', fiscalDate: '2026-10-05', sequence: 1,
    kind: 'PAYMENT', allocations: [{ purchaseId: purchase.id, baseAmountBs: 25 }],
    journalEntryId: 'j-payment-1', voucherId: undefined
  };
  const paymentTwo = {
    ...paymentOne, id: 'e-payment-2', fiscalDate: '2026-10-06', sequence: 1,
    allocations: [{ purchaseId: purchase.id, baseAmountBs: 15 }],
    journalEntryId: 'j-payment-2'
  };
  const previous = {
    purchases: [purchase], journalEntries: [journal('j-purchase', '2026-10-01')],
    islrVouchers: [voucher], islrFiscalEvents: [accountCredit]
  };
  const next = {
    purchases: [purchase],
    journalEntries: [journal('j-purchase', '2026-10-01'), journal('j-payment-1', '2026-10-05', 'PAGO'), journal('j-payment-2', '2026-10-06', 'PAGO')],
    islrVouchers: [voucher], islrFiscalEvents: [accountCredit, paymentOne, paymentTwo]
  };
  assert.throws(() => validateIslrFiscalEventLedger(previous, next), /base fiscal asignada supera la base elegible/);
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

test('SQLite accepts cumulative partial ISLR reversals and rejects over-reversal', () => {
  const purchase = { id: 'p1', companyId: 'c1', supplierRif: 'J-12345678-9', documentType: '01', taxableBaseBs: 1000, exemptAmountBs: 0, isCancelled: false };
  const originalJournal = { id: 'j0', companyId: 'c1', date: '2026-10-01' };
  const reversalJournal = (id, amount) => ({ id, companyId: 'c1', date: '2026-10-10', type: 'AJUSTE', items: [{ accountCode: '2.1.2.04', debitBs: amount, creditBs: 0 }] });
  const original = { id: 'e0', companyId: 'c1', supplierRif: 'J-12345678-9', conceptCode: '003', fiscalDate: '2026-10-01', sequence: 1, kind: 'PAYMENT', allocations: [{ purchaseId: 'p1', baseAmountBs: 1000 }], basePercentage: 100, unitTaxValueBs: 43, withheldAmountBs: 100, journalEntryId: 'j0', createdAt: '2026-10-01T10:00:00.000Z' };
  const reversal = (id, sequence, base, amount, journalId) => ({ id, companyId: 'c1', supplierRif: 'J-12345678-9', conceptCode: '003', fiscalDate: '2026-10-10', sequence, kind: 'REVERSAL', allocations: [{ purchaseId: 'p1', baseAmountBs: base }], basePercentage: 100, unitTaxValueBs: 43, withheldAmountBs: amount, journalEntryId: journalId, reversalOfEventId: 'e0', reversalReason: 'Devolución parcial documentada', createdAt: '2026-10-10T10:00:00.000Z' });
  const previous = { purchases: [purchase], journalEntries: [originalJournal], islrVouchers: [], islrFiscalEvents: [] };
  const first = reversal('r1', 1, 300, 30, 'jr1');
  const second = reversal('r2', 2, 200, 20, 'jr2');
  const next = { purchases: [purchase], journalEntries: [originalJournal, reversalJournal('jr1', 30), reversalJournal('jr2', 20)], islrVouchers: [], islrFiscalEvents: [original, first, second] };
  assert.doesNotThrow(() => validateIslrFiscalEventLedger(previous, next));
  const excessive = reversal('r3', 3, 600, 60, 'jr3');
  assert.throws(() => validateIslrFiscalEventLedger(previous, {
    ...next, journalEntries: [...next.journalEntries, reversalJournal('jr3', 60)],
    islrFiscalEvents: [...next.islrFiscalEvents, excessive]
  }), /supera la base pendiente/);
});

test('reconciles multiple partial ISLR source-event reversals against one credit-note journal', () => {
  const purchase = { id: 'p1', companyId: 'c1', supplierRif: 'J-12345678-9', documentType: '01', taxableBaseBs: 1000, exemptAmountBs: 0, isCancelled: false };
  const originalJournal = { id: 'j0', companyId: 'c1', date: '2026-10-01' };
  const reversalJournal = {
    id: 'j-credit-note', companyId: 'c1', date: '2026-10-20', type: 'AJUSTE',
    items: [{ accountCode: '2.1.2.04', debitBs: 30, creditBs: 0 }]
  };
  const original = {
    id: 'e0', companyId: 'c1', supplierRif: 'J-12345678-9', conceptCode: '003',
    fiscalDate: '2026-10-01', sequence: 1, kind: 'PAYMENT',
    allocations: [{ purchaseId: 'p1', baseAmountBs: 400 }], basePercentage: 90,
    unitTaxValueBs: 43, withheldAmountBs: 40, journalEntryId: 'j0',
    createdAt: '2026-10-01T10:00:00.000Z'
  };
  const secondOriginal = {
    ...original, id: 'e1', fiscalDate: '2026-10-02', sequence: 1, kind: 'PAYMENT',
    allocations: [{ purchaseId: 'p1', baseAmountBs: 600 }],
    withheldAmountBs: 60, journalEntryId: 'j1'
  };
  const secondOriginalJournal = { id: 'j1', companyId: 'c1', date: '2026-10-02' };
  const reversal = (id, sequence, sourceId, base, withheld) => ({
    id, companyId: 'c1', supplierRif: 'J-12345678-9', conceptCode: '003',
    fiscalDate: '2026-10-20', sequence, kind: 'REVERSAL',
    allocations: [{ purchaseId: 'p1', baseAmountBs: base }],
    basePercentage: 90, unitTaxValueBs: 43, withheldAmountBs: withheld,
    journalEntryId: 'j-credit-note', reversalOfEventId: sourceId,
    reversalReason: 'Nota de crédito parcial documentada',
    createdAt: '2026-10-20T10:00:00.000Z'
  });
  const firstReversal = reversal('r1', 1, 'e0', 100, 10);
  const secondReversal = reversal('r2', 2, 'e1', 200, 20);
  const previous = {
    purchases: [purchase],
    journalEntries: [originalJournal, secondOriginalJournal],
    islrVouchers: [], islrFiscalEvents: []
  };
  const next = {
    purchases: [purchase],
    journalEntries: [originalJournal, secondOriginalJournal, reversalJournal],
    islrVouchers: [],
    islrFiscalEvents: [original, secondOriginal, firstReversal, secondReversal]
  };
  assert.doesNotThrow(() => validateIslrFiscalEventLedger(previous, next));
  assert.throws(() => validateIslrFiscalEventLedger(previous, {
    ...next, journalEntries: [...next.journalEntries.slice(0, -1), {
      ...reversalJournal, items: [{ accountCode: '2.1.2.04', debitBs: 29, creditBs: 0 }]
    }]
  }), /total de eventos revertidos/);
});


test('reconciles cash-purchase ISLR PAYMENT event against the cash purchase, voucher and purchase journal', () => {
  const purchase = {
    id: 'p-cash', companyId: 'c1', supplierRif: 'J-12345678-9',
    documentType: '01', invoiceDate: '2026-10-01', invoiceNumber: 'F-CASH',
    paymentTerm: 'CONTADO', taxableBaseBs: 100, exemptAmountBs: 0,
    isCancelled: false, islrConceptCode: '003', islrBasePercentage: 90,
    islrUnitTaxValueBs: 43, islrWithheldBs: 5
  };
  const journal = {
    id: 'j-cash', companyId: 'c1', date: '2026-10-01', type: 'COMPRA',
    items: [{ accountCode: '2.1.2.04', debitBs: 0, creditBs: 5 }]
  };
  const voucher = {
    id: 'v-cash', companyId: 'c1', supplierRif: 'J-12345678-9',
    conceptCode: '003', invoiceNumber: 'F-CASH', invoiceDate: '2026-10-01',
    baseAmountBs: 100, withheldAmountBs: 5
  };
  const fiscalEvent = {
    id: 'e-cash', companyId: 'c1', supplierRif: 'J-12345678-9',
    conceptCode: '003', fiscalDate: '2026-10-01', sequence: 1,
    kind: 'PAYMENT', allocations: [{ purchaseId: 'p-cash', baseAmountBs: 100 }],
    basePercentage: 90, unitTaxValueBs: 43, withheldAmountBs: 5,
    journalEntryId: 'j-cash', voucherId: 'v-cash', createdAt: '2026-10-01T10:00:00.000Z'
  };
  const previous = { purchases: [], journalEntries: [], islrVouchers: [], islrFiscalEvents: [] };
  const next = { purchases: [purchase], journalEntries: [journal], islrVouchers: [voucher], islrFiscalEvents: [fiscalEvent] };
  assert.doesNotThrow(() => validateIslrFiscalEventLedger(previous, next));
  assert.throws(() => validateIslrFiscalEventLedger(previous, {
    ...next, islrFiscalEvents: [{ ...fiscalEvent, kind: 'ACCOUNT_CREDIT' }]
  }), /ACCOUNT_CREDIT para una compra de contado/);
});
