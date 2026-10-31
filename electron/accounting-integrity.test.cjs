const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAccountingSnapshot } = require('./accounting-integrity.cjs');
const Database = require('better-sqlite3');

const line = (debitBs, creditBs, debitUsd, creditUsd) => ({
  accountCode: debitBs > 0 || creditBs > 0 ? '1.1.1.01' : '4.1.1.01',
  accountName: 'Cuenta de prueba', debitBs, creditBs, debitUsd, creditUsd
});
const sourceEntry = () => ({
  id: 'entry-1', companyId: 'company-1', entryNumber: 1, date: '2026-10-01',
  description: 'Asiento original', type: 'MANUAL', bcvRate: 100,
  items: [line(100, 0, 1, 0), line(0, 100, 0, 1)],
  createdAt: '2026-10-01T10:00:00.000Z'
});
const reversalEntry = () => ({
  id: 'entry-2', companyId: 'company-1', entryNumber: 2, date: '2026-10-02',
  description: 'REVERSIÓN / Corrección documentada', type: 'AJUSTE', bcvRate: 100, referenceDoc: 'REV-1',
  items: [line(0, 100, 0, 1), line(100, 0, 1, 0)],
  createdAt: '2026-10-02T10:00:00.000Z', reversalOfEntryId: 'entry-1',
  reversalReason: 'Corrección documentada de error', workpaperNote: 'Papel de trabajo y soporte revisado'
});
const emptyState = (journalEntries = []) => ({
  journalEntries, purchases: [], sales: [], movements: [], creditSettlements: [],
  bankStatementMovements: [], vatVouchers: [], islrVouchers: [], islrFiscalEvents: [], products: [], companies: [], accounts: []
});

test('SQLite rejects reuse of a lower unused journal sequence number', () => {
  const prior = { ...sourceEntry(), entryNumber: 5 };
  const lower = { ...sourceEntry(), id: 'entry-lower', entryNumber: 4 };
  assert.throws(() => validateAccountingSnapshot(
    emptyState([prior]), emptyState([prior, lower])
  ), /correlativo de asiento no creciente/);
  const next = { ...sourceEntry(), id: 'entry-next', entryNumber: 6 };
  assert.doesNotThrow(() => validateAccountingSnapshot(
    emptyState([prior]), emptyState([prior, next])
  ));
});


test('SQLite validates ISLR event structure and historical UT during every state save', () => {
  const invalidUtEvent = {
    id: 'islr-event-1', companyId: 'company-1', supplierRif: 'J-12345678-9',
    conceptCode: '003', fiscalDate: '2025-07-10', sequence: 1, kind: 'PAYMENT',
    allocations: [{ purchaseId: 'purchase-1', baseAmountBs: 100 }],
    basePercentage: 90, unitTaxValueBs: 9, withheldAmountBs: 0,
    journalEntryId: 'entry-1', createdAt: '2025-07-10T12:00:00.000Z'
  };
  assert.throws(() => validateAccountingSnapshot(
    emptyState(), { ...emptyState([sourceEntry()]), islrFiscalEvents: [invalidUtEvent] }
  ), /snapshot de UT ISLR/);
});

test('SQLite rejects ISLR events linked to a missing invoice', () => {
  const event = {
    id: 'islr-event-1', companyId: 'company-1', supplierRif: 'J-12345678-9',
    conceptCode: '003', fiscalDate: '2026-10-01', sequence: 1, kind: 'PAYMENT',
    allocations: [{ purchaseId: 'missing-purchase', baseAmountBs: 100 }],
    basePercentage: 90, unitTaxValueBs: 43, withheldAmountBs: 0,
    journalEntryId: 'entry-1', createdAt: '2026-10-01T12:00:00.000Z'
  };
  assert.throws(() => validateAccountingSnapshot(
    emptyState(), { ...emptyState([sourceEntry()]), islrFiscalEvents: [event] }
  ), /factura inexistente/);
});

test('SQLite prevents ISLR allocations above taxable plus exempt invoice base', () => {
  const purchase = {
    id: 'purchase-1', companyId: 'company-1', supplierRif: 'J-12345678-9',
    documentType: '01', taxableBaseBs: 800, exemptAmountBs: 200, isCancelled: false
  };
  const event = {
    id: 'islr-event-1', companyId: 'company-1', supplierRif: 'J-12345678-9',
    conceptCode: '003', fiscalDate: '2026-10-01', sequence: 1, kind: 'PAYMENT',
    allocations: [{ purchaseId: 'purchase-1', baseAmountBs: 1000.02 }],
    basePercentage: 90, unitTaxValueBs: 43, withheldAmountBs: 0,
    journalEntryId: 'entry-1', createdAt: '2026-10-01T12:00:00.000Z'
  };
  assert.throws(() => validateAccountingSnapshot(
    emptyState(), { ...emptyState([sourceEntry()]), purchases: [purchase], islrFiscalEvents: [event] }
  ), /superior a la base de la factura/);
});

test('SQLite rejects physical deletion of a posted journal entry', () => {
  assert.throws(
    () => validateAccountingSnapshot(emptyState([sourceEntry()]), emptyState([])),
    /eliminación del asiento histórico/
  );
});

test('SQLite rejects changes to the financial content of an existing journal entry', () => {
  const original = sourceEntry();
  const edited = { ...original, description: 'Texto alterado' };
  assert.throws(
    () => validateAccountingSnapshot(emptyState([original]), emptyState([edited])),
    /modificación del contenido histórico/
  );
});

test('SQLite accepts one new, balanced contra-entry with reciprocal immutable linkage', () => {
  const original = sourceEntry();
  const reversal = reversalEntry();
  const linkedOriginal = { ...original, reversedByEntryId: reversal.id, isAdjusted: true };
  assert.doesNotThrow(() => validateAccountingSnapshot(
    emptyState([original]),
    emptyState([linkedOriginal, reversal])
  ));
});

test('SQLite rejects a balanced contra-entry whose lines do not exactly reverse the source', () => {
  const original = sourceEntry();
  const reversal = {
    ...reversalEntry(),
    items: [line(50, 0, 0.5, 0), line(0, 50, 0, 0.5)]
  };
  const linkedOriginal = { ...original, reversedByEntryId: reversal.id, isAdjusted: true };
  assert.throws(() => validateAccountingSnapshot(
    emptyState([original]), emptyState([linkedOriginal, reversal])
  ), /no invierte exactamente Debe\/Haber/);
});

test('SQLite rejects a contra-entry without reciprocal linkage or supporting paper', () => {
  const original = sourceEntry();
  const reversal = { ...reversalEntry(), workpaperNote: '' };
  const linkedOriginal = { ...original, reversedByEntryId: reversal.id, isAdjusted: true };
  assert.throws(() => validateAccountingSnapshot(
    emptyState([original]), emptyState([linkedOriginal, reversal])
  ), /contra-asiento sin origen, enlace recíproco, justificación, papel de trabajo o fecha válida/);
});

test('SQLite rejects a second contra-entry for the same original', () => {
  const original = sourceEntry();
  const first = reversalEntry();
  const second = { ...reversalEntry(), id: 'entry-3', entryNumber: 3 };
  const linkedOriginal = { ...original, reversedByEntryId: first.id, isAdjusted: true };
  assert.throws(() => validateAccountingSnapshot(
    emptyState([original]),
    emptyState([linkedOriginal, first, second])
  ), /segunda reversión/);
});

test('SQLite rejects supplier-return movements imported through a snapshot or backup', () => {
  const returnMovement = {
    id: 'supplier-return-1', companyId: 'company-1', productId: 'p-1',
    date: '2026-10-12', type: 'SALIDA', concept: 'DEVOLUCION_COMPRA',
    documentRef: 'NC-100', quantity: 1, totalCostBs: 100
  };
  assert.throws(() => validateAccountingSnapshot(
    emptyState(),
    { ...emptyState(), movements: [returnMovement] }
  ), /cada línea de nota de crédito debe tener exactamente su salida de Kardex asociada/);
});

test('SQLite rejects supplier debit/credit notes imported as new purchase records', () => {
  const note = {
    id: 'purchase-note-1', companyId: 'company-1', invoiceNumber: 'NC-100',
    supplierRif: 'J-12345678-9', documentType: '03', totalAmountBs: 100
  };
  assert.throws(() => validateAccountingSnapshot(
    emptyState(),
    { ...emptyState(), purchases: [note] }
  ), /falta factura original, proveedor, soporte/);
});

test('SQLite rejects a purchase whose declared inventory lines are missing from Kardex', () => {
  const purchase = {
    id: 'purchase-new', companyId: 'company-1', invoiceDate: '2026-10-10',
    supplierRif: 'J-12345678-9', invoiceNumber: 'FAC-100', documentType: '01',
    totalAmountBs: 200, taxableBaseBs: 200, exemptAmountBs: 0, taxRate: 0, vatAmountBs: 0,
    vatWithheldBs: 0, islrWithheldBs: 0, igtfAmountBs: 0, bcvRate: 100,
    totalAmountUsd: 2, taxableBaseUsd: 2, vatAmountUsd: 0, vatWithheldUsd: 0,
    islrWithheldUsd: 0, igtfAmountUsd: 0, journalEntryId: 'purchase-entry',
    inventoryLines: [{ productId: 'p-1', quantity: 2, unitCostBs: 100 }]
  };
  const entry = {
    id: 'purchase-entry', companyId: 'company-1', entryNumber: 1,
    date: '2026-10-10', description: 'Compra', type: 'COMPRA', bcvRate: 100, referenceDoc: 'FAC-100',
    items: [line(200, 0, 2, 0), line(0, 200, 0, 2)],
    createdAt: '2026-10-10T10:00:00.000Z'
  };
  assert.throws(() => validateAccountingSnapshot(
    emptyState(),
    { ...emptyState([entry]), purchases: [purchase] }
  ), /número de entradas de Kardex no coincide/);
});

test('SQLite accepts a purchase only when invoice, inventory debit and Kardex lines reconcile', () => {
  const purchase = {
    id: 'purchase-new', companyId: 'company-1', invoiceDate: '2026-10-10',
    supplierRif: 'J-12345678-9', invoiceNumber: '100', documentType: '01',
    totalAmountBs: 200, taxableBaseBs: 200, exemptAmountBs: 0, taxRate: 0, vatAmountBs: 0,
    vatWithheldBs: 0, islrWithheldBs: 0, igtfAmountBs: 0, bcvRate: 100,
    totalAmountUsd: 2, taxableBaseUsd: 2, vatAmountUsd: 0, vatWithheldUsd: 0,
    islrWithheldUsd: 0, igtfAmountUsd: 0, journalEntryId: 'purchase-entry',
    inventoryLines: [{ productId: 'p-1', quantity: 2, unitCostBs: 100 }]
  };
  const entry = {
    id: 'purchase-entry', companyId: 'company-1', entryNumber: 1,
    date: '2026-10-10', description: 'Compra', type: 'COMPRA', bcvRate: 100, referenceDoc: 'FAC-100',
    items: [
      { accountCode: '1.1.4.01', accountName: 'Inventario', debitBs: 200, creditBs: 0, debitUsd: 2, creditUsd: 0 },
      { accountCode: '2.1.1.01', accountName: 'CxP', debitBs: 0, creditBs: 200, debitUsd: 0, creditUsd: 2 }
    ],
    createdAt: '2026-10-10T10:00:00.000Z'
  };
  const movement = {
    id: 'movement-new', companyId: 'company-1', productId: 'p-1',
    date: '2026-10-10', type: 'ENTRADA', concept: 'COMPRA',
    documentRef: ' FAC - 100 ', counterpartyRif: 'J-12345678-9',
    quantity: 2, unitCostBs: 100, unitCostUsd: 1, totalCostBs: 200, totalCostUsd: 2, bcvRate: 100
  };
  assert.doesNotThrow(() => validateAccountingSnapshot(
    emptyState(),
    { ...emptyState([entry]), purchases: [purchase], movements: [movement], products: [{ id: 'p-1', companyId: 'company-1', inventoryAccountCode: '1.1.4.01' }] }
  ));
  for (const invalidMovement of [
    { ...movement, counterpartyRif: '' },
    { ...movement, unitCostBs: 90 },
    { ...movement, unitCostUsd: 0.9 }
  ]) {
    assert.throws(() => validateAccountingSnapshot(
      emptyState(),
      { ...emptyState([entry]), purchases: [purchase], movements: [invalidMovement] }
    ), /una entrada de Kardex no coincide/);
  }
});

test('SQLite accepts cash purchase posted directly to selected cash/bank account with no payable', () => {
  const purchase = {
    id: 'purchase-cash', companyId: 'company-1', invoiceDate: '2026-10-10', accountCreditDate: '2026-10-10',
    supplierRif: 'J-12345678-9', invoiceNumber: '101', documentType: '01',
    totalAmountBs: 232, taxableBaseBs: 200, exemptAmountBs: 0, taxRate: 16, vatAmountBs: 32,
    vatWithheldBs: 0, islrWithheldBs: 0, igtfAmountBs: 0, bcvRate: 100,
    totalAmountUsd: 2.32, taxableBaseUsd: 2, vatAmountUsd: 0.32, vatWithheldUsd: 0,
    islrWithheldUsd: 0, igtfAmountUsd: 0, journalEntryId: 'purchase-cash-entry',
    paymentTerm: 'CONTADO', paymentAccountCode: '1.1.1.01', paymentReference: 'EG-0001',
    inventoryLines: [{ productId: 'p-1', quantity: 2, unitCostBs: 100 }]
  };
  const entry = {
    id: 'purchase-cash-entry', companyId: 'company-1', entryNumber: 1,
    date: '2026-10-10', description: 'Compra contado', type: 'COMPRA', bcvRate: 100, referenceDoc: 'FAC-101',
    items: [
      { accountCode: '1.1.4.01', accountName: 'Inventario', debitBs: 200, creditBs: 0, debitUsd: 2, creditUsd: 0 },
      { accountCode: '1.1.3.01', accountName: 'IVA Crédito Fiscal', debitBs: 32, creditBs: 0, debitUsd: 0.32, creditUsd: 0 },
      { accountCode: '1.1.1.01', accountName: 'Caja Principal', debitBs: 0, creditBs: 232, debitUsd: 0, creditUsd: 2.32 }
    ], createdAt: '2026-10-10T10:00:00.000Z'
  };
  const movement = {
    id: 'movement-cash', companyId: 'company-1', productId: 'p-1',
    date: '2026-10-10', type: 'ENTRADA', concept: 'COMPRA',
    documentRef: 'FAC-101', counterpartyRif: 'J-12345678-9',
    quantity: 2, unitCostBs: 100, unitCostUsd: 1, totalCostBs: 200, totalCostUsd: 2, bcvRate: 100
  };
  const account = { code: '1.1.1.01', name: 'Caja Principal', type: 'ACTIVO', level: 4, isMovement: true, parentCode: '1.1.1' };
  const state = { ...emptyState([entry]), accounts: [account], purchases: [purchase], movements: [movement], products: [{ id: 'p-1', companyId: 'company-1', inventoryAccountCode: '1.1.4.01' }] };
  assert.doesNotThrow(() => validateAccountingSnapshot(emptyState(), state));
  const invalid = structuredClone(state);
  invalid.purchases[0].paymentAccountCode = '2.1.1.01';
  assert.throws(() => validateAccountingSnapshot(emptyState(), invalid), /asiento no reconoce en Bs\. y USD/);
});

test('SQLite accepts cash expense purchase with effective payment/account-credit date different from invoice date', () => {
  const purchase = {
    id: 'purchase-cash-expense', companyId: 'company-1',
    invoiceDate: '2026-10-09', accountCreditDate: '2026-10-10',
    supplierRif: 'J-12345678-9', invoiceNumber: '102', documentType: '01',
    totalAmountBs: 232, taxableBaseBs: 200, exemptAmountBs: 0, taxRate: 16, vatAmountBs: 32,
    vatWithheldBs: 0, islrWithheldBs: 0, igtfAmountBs: 0, bcvRate: 100,
    totalAmountUsd: 2.32, taxableBaseUsd: 2, vatAmountUsd: 0.32, vatWithheldUsd: 0,
    islrWithheldUsd: 0, igtfAmountUsd: 0, journalEntryId: 'purchase-cash-expense-entry',
    paymentTerm: 'CONTADO', paymentAccountCode: '1.1.1.01', paymentReference: 'TRF-102'
  };
  const entry = {
    id: 'purchase-cash-expense-entry', companyId: 'company-1', entryNumber: 1,
    date: '2026-10-10', description: 'Compra contado gasto', type: 'COMPRA',
    bcvRate: 100, referenceDoc: 'FAC-102',
    items: [
      { accountCode: '6.1.1.04', accountName: 'Honorarios Profesionales', debitBs: 200, creditBs: 0, debitUsd: 2, creditUsd: 0 },
      { accountCode: '1.1.3.01', accountName: 'IVA Crédito Fiscal', debitBs: 32, creditBs: 0, debitUsd: 0.32, creditUsd: 0 },
      { accountCode: '1.1.1.01', accountName: 'Caja Principal', debitBs: 0, creditBs: 232, debitUsd: 0, creditUsd: 2.32 }
    ],
    createdAt: '2026-10-10T10:00:00.000Z'
  };
  const account = { code: '1.1.1.01', name: 'Caja Principal', type: 'ACTIVO', level: 4, isMovement: true, parentCode: '1.1.1' };
  assert.doesNotThrow(() => validateAccountingSnapshot(
    emptyState(), { ...emptyState([entry]), accounts: [account], purchases: [purchase] }
  ));
});

test('SQLite rejects a purchase when the inventory debit differs from its Kardex total', () => {
  const purchase = {
    id: 'purchase-new', companyId: 'company-1', invoiceDate: '2026-10-10',
    supplierRif: 'J-12345678-9', invoiceNumber: '100', documentType: '01',
    totalAmountBs: 200, taxableBaseBs: 200, exemptAmountBs: 0, taxRate: 0, vatAmountBs: 0,
    vatWithheldBs: 0, islrWithheldBs: 0, igtfAmountBs: 0, bcvRate: 100,
    totalAmountUsd: 2, taxableBaseUsd: 2, vatAmountUsd: 0, vatWithheldUsd: 0,
    islrWithheldUsd: 0, igtfAmountUsd: 0, journalEntryId: 'purchase-entry',
    inventoryLines: [{ productId: 'p-1', quantity: 2, unitCostBs: 100 }]
  };
  const entry = {
    id: 'purchase-entry', companyId: 'company-1', entryNumber: 1,
    date: '2026-10-10', description: 'Compra', type: 'COMPRA', bcvRate: 100, referenceDoc: 'FAC-100',
    items: [
      { accountCode: '1.1.4.01', accountName: 'Inventario', debitBs: 150, creditBs: 0, debitUsd: 1.5, creditUsd: 0 },
      { accountCode: '2.1.1.01', accountName: 'CxP', debitBs: 0, creditBs: 150, debitUsd: 0, creditUsd: 1.5 }
    ],
    createdAt: '2026-10-10T10:00:00.000Z'
  };
  const movement = {
    id: 'movement-new', companyId: 'company-1', productId: 'p-1',
    date: '2026-10-10', type: 'ENTRADA', concept: 'COMPRA',
    documentRef: 'FAC-100', counterpartyRif: 'J-12345678-9',
    quantity: 2, unitCostBs: 100, unitCostUsd: 1, totalCostBs: 200, totalCostUsd: 2, bcvRate: 100
  };
  assert.throws(() => validateAccountingSnapshot(
    emptyState(),
    { ...emptyState([entry]), purchases: [purchase], movements: [movement], products: [{ id: 'p-1', companyId: 'company-1', inventoryAccountCode: '1.1.4.01' }] }
  ), /asiento no reconoce en Bs\. y USD/);
});


test('SQLite reconciles purchase inventory across multiple product auxiliary accounts', () => {
  const { prior, next } = supplierCreditFixture();
  const product = next.products.find(item => item.id === 'p-1');
  product.inventoryAccountCode = '1.1.4.07';
  const originalEntry = next.journalEntries.find(item => item.id === 'purchase-entry');
  originalEntry.items.find(item => item.accountCode === '1.1.4.01').accountCode = '1.1.4.07';
  const noteEntry = next.journalEntries.find(item => item.id === 'credit-entry');
  noteEntry.items.find(item => item.accountCode === '1.1.4.01').accountCode = '1.1.4.07';
  assert.doesNotThrow(() => validateAccountingSnapshot(prior, next));

  const corrupted = structuredClone(next);
  corrupted.journalEntries.find(item => item.id === 'purchase-entry')
    .items.find(item => item.accountCode === '1.1.4.07').accountCode = '1.1.4.01';
  assert.throws(() => validateAccountingSnapshot(prior, corrupted),
    /asiento no reconoce en Bs\. y USD|factura original o el asiento fiscal no están conciliados|modificación del contenido histórico del asiento/);
});

test('SQLite rejects purchase inventory lines whose product is absent from the company catalog', () => {
  const { prior, next } = supplierCreditFixture();
  next.products = [];
  assert.throws(() => validateAccountingSnapshot(prior, next), /no existe el artículo asociado/);
});

test('SQLite keeps inventory movements append-only', () => {
  const movement = { id: 'mov-1', companyId: 'company-1', productId: 'p-1', quantity: 2, totalCostBs: 200 };
  assert.throws(() => validateAccountingSnapshot(
    { ...emptyState(), movements: [movement] },
    { ...emptyState(), movements: [] }
  ), /eliminación del registro histórico en movements/);
});

test('SQLite allows reversal metadata on a settlement but not edits to its amount', () => {
  const original = sourceEntry();
  const reversal = reversalEntry();
  const linkedOriginal = { ...original, reversedByEntryId: reversal.id, isAdjusted: true };
  const settlement = {
    id: 's-1', companyId: 'company-1', documentId: 'purchase-1',
    journalEntryId: original.id, amountUsd: 10, amountBs: 1000, isReversed: false
  };
  const reversed = { ...settlement, isReversed: true, reversedByJournalEntryId: reversal.id };
  const previous = { ...emptyState([original]), creditSettlements: [settlement] };
  const next = { ...emptyState([linkedOriginal, reversal]), creditSettlements: [reversed] };
  assert.doesNotThrow(() => validateAccountingSnapshot(previous, next));
  assert.throws(() => validateAccountingSnapshot(
    previous,
    { ...next, creditSettlements: [{ ...reversed, amountUsd: 11 }] }
  ), /modificación de un registro histórico en creditSettlements/);
});

test('SQLite permits bank reconciliation metadata changes without changing imported statement facts', () => {
  const statement = { id: 'bank-1', companyId: 'company-1', reference: 'TRX-1', amountBs: 1000, isReconciled: false };
  const reconciled = { ...statement, isReconciled: true, reconciledWithJournalEntryId: 'entry-2', matchedBy: 'MANUAL' };
  assert.doesNotThrow(() => validateAccountingSnapshot(
    { ...emptyState(), bankStatementMovements: [statement] },
    { ...emptyState(), bankStatementMovements: [reconciled] }
  ));
  assert.throws(() => validateAccountingSnapshot(
    { ...emptyState(), bankStatementMovements: [statement] },
    { ...emptyState(), bankStatementMovements: [{ ...reconciled, amountBs: 1200 }] }
  ), /modificación de un registro histórico en bankStatementMovements/);
});

test('SQLite preserves historical bank reconciliation links after unreconciliation', () => {
  const statement = {
    id: 'bank-historical', companyId: 'company-1', bankAccountId: 'bank-1',
    reference: 'TRX-1', amountBs: 1000, isReconciled: true,
    reconciledWithJournalEntryId: 'entry-1', reconciledJournalEntryIds: ['entry-1']
  };
  const unreconciled = {
    ...statement, isReconciled: false, reconciledWithJournalEntryId: undefined,
    matchedBy: undefined, reconciledAt: undefined
  };
  assert.doesNotThrow(() => validateAccountingSnapshot(
    { ...emptyState(), bankStatementMovements: [statement] },
    { ...emptyState(), bankStatementMovements: [unreconciled] }
  ));
  assert.throws(() => validateAccountingSnapshot(
    { ...emptyState(), bankStatementMovements: [statement] },
    { ...emptyState(), bankStatementMovements: [{ ...unreconciled, reconciledJournalEntryIds: [] }] }
  ), /historial de conciliación bancaria/);
  assert.doesNotThrow(() => validateAccountingSnapshot(
    { ...emptyState(), bankStatementMovements: [statement] },
    { ...emptyState(), bankStatementMovements: [{ ...unreconciled, reconciledJournalEntryIds: ['entry-1', 'entry-2'] }] }
  ));
});

test('SQLite refuses deletion of historical legacy-company journal entries', () => {
  const demoEntry = { ...sourceEntry(), id: 'demo-entry', companyId: 'comp-1' };
  assert.throws(() => validateAccountingSnapshot(
    emptyState([demoEntry]), emptyState([])
  ), /eliminación del asiento histórico/);
});

test('SQLite accepts fiscal cancellation only when linked to its immutable contra-entry', () => {
  const original = { ...sourceEntry(), type: 'VENTA', referenceDoc: 'FAC-100' };
  const reversal = reversalEntry();
  const linkedOriginal = { ...original, reversedByEntryId: reversal.id, isAdjusted: true };
  const oldSale = {
    id: 'sale-1', companyId: 'company-1', invoiceNumber: '100',
    journalEntryId: original.id, isCancelled: false
  };
  const cancelledSale = {
    ...oldSale, isCancelled: true, cancelledByJournalEntryId: reversal.id,
    cancellationReason: 'Factura emitida con datos incorrectos',
    cancellationNote: 'Soporte revisado y justificación archivada'
  };
  assert.doesNotThrow(() => validateAccountingSnapshot(
    { ...emptyState([original]), sales: [oldSale] },
    { ...emptyState([linkedOriginal, reversal]), sales: [cancelledSale] }
  ));
});

test('SQLite rejects a fiscal cancellation without an actual contra-entry', () => {
  const original = { ...sourceEntry(), type: 'COMPRA', referenceDoc: 'FAC-200' };
  const oldPurchase = {
    id: 'purchase-1', companyId: 'company-1', invoiceNumber: '200',
    journalEntryId: original.id, isCancelled: false
  };
  const cancelledPurchase = {
    ...oldPurchase, isCancelled: true, cancelledByJournalEntryId: 'missing-entry',
    cancellationReason: 'Documento incorrecto', cancellationNote: 'Soporte revisado y archivado'
  };
  assert.throws(() => validateAccountingSnapshot(
    { ...emptyState([original]), purchases: [oldPurchase] },
    { ...emptyState([original]), purchases: [cancelledPurchase] }
  ), /cancelación del documento fiscal.*contra-asiento enlazado/i);
});

test('SQLite allows repairing a missing invoice-to-entry link only to the matching original entry', () => {
  const original = { ...sourceEntry(), type: 'VENTA', referenceDoc: 'FAC-400' };
  const reversal = reversalEntry();
  const linkedOriginal = { ...original, reversedByEntryId: reversal.id, isAdjusted: true };
  const oldSale = { id: 'sale-4', companyId: 'company-1', invoiceNumber: '400', isCancelled: false };
  const cancelledSale = {
    ...oldSale, journalEntryId: original.id, isCancelled: true,
    cancelledByJournalEntryId: reversal.id,
    cancellationReason: 'Factura con vínculo histórico incompleto',
    cancellationNote: 'Se verificó la referencia original y el contra-asiento'
  };
  assert.doesNotThrow(() => validateAccountingSnapshot(
    { ...emptyState([original]), sales: [oldSale] },
    { ...emptyState([linkedOriginal, reversal]), sales: [cancelledSale] }
  ));
});

test('SQLite accepts reversal of a settlement only when the settlement points to its contra-entry', () => {
  const original = sourceEntry();
  const reversal = reversalEntry();
  const linkedOriginal = { ...original, reversedByEntryId: reversal.id, isAdjusted: true };
  const oldSettlement = {
    id: 'settlement-1', companyId: 'company-1', documentId: 'purchase-1',
    journalEntryId: original.id, amountUsd: 10, amountBs: 1000, isReversed: false
  };
  const reversedSettlement = {
    ...oldSettlement, isReversed: true, reversedByJournalEntryId: reversal.id
  };
  assert.doesNotThrow(() => validateAccountingSnapshot(
    { ...emptyState([original]), creditSettlements: [oldSettlement] },
    { ...emptyState([linkedOriginal, reversal]), creditSettlements: [reversedSettlement] }
  ));
});

test('SQLite requires fiscal retention correction flags to link to the document reversal', () => {
  const original = { ...sourceEntry(), type: 'COMPRA', referenceDoc: 'FAC-300' };
  const reversal = reversalEntry();
  const linkedOriginal = { ...original, reversedByEntryId: reversal.id, isAdjusted: true };
  const oldPurchase = {
    id: 'purchase-3', companyId: 'company-1', invoiceNumber: '300',
    journalEntryId: original.id, isCancelled: false
  };
  const cancelledPurchase = {
    ...oldPurchase, isCancelled: true, cancelledByJournalEntryId: reversal.id,
    cancellationReason: 'Factura con error de identificación',
    cancellationNote: 'Documento de soporte revisado por el contador'
  };
  const oldVoucher = { id: 'vat-1', companyId: 'company-1', purchaseRecordId: oldPurchase.id, requiresFiscalCorrection: false };
  const correctedVoucher = {
    ...oldVoucher, requiresFiscalCorrection: true, correctionEntryId: reversal.id,
    correctionNote: 'Requiere rectificación fiscal documentada'
  };
  assert.doesNotThrow(() => validateAccountingSnapshot(
    { ...emptyState([original]), purchases: [oldPurchase], vatVouchers: [oldVoucher] },
    { ...emptyState([linkedOriginal, reversal]), purchases: [cancelledPurchase], vatVouchers: [correctedVoucher] }
  ));
});

test('SQLite rejects reopening or deleting a closed accounting period', () => {
  const previous = { ...emptyState(), companies: [{ id: 'company-1', name: 'Empresa', closedThroughDate: '2026-09-30' }] };
  assert.throws(() => validateAccountingSnapshot(previous, {
    ...emptyState(), companies: [{ id: 'company-1', name: 'Empresa', closedThroughDate: '2026-08-31' }]
  }), /bloqueó la reapertura/);
  assert.throws(() => validateAccountingSnapshot(previous, emptyState()), /bloqueó la reapertura/);
  assert.doesNotThrow(() => validateAccountingSnapshot(previous, {
    ...emptyState(), companies: [{ id: 'company-1', name: 'Empresa', closedThroughDate: '2026-10-31' }]
  }));
});

test('SQLite audit_events table rejects UPDATE and DELETE operations', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        details_json TEXT NOT NULL
      );
      CREATE TRIGGER audit_events_no_update
        BEFORE UPDATE ON audit_events
        BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
      CREATE TRIGGER audit_events_no_delete
        BEFORE DELETE ON audit_events
        BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
    `);
    const insert = db.prepare('INSERT INTO audit_events(event_type,details_json) VALUES(?,?)');
    insert.run('journal_entry_reversed', JSON.stringify({ entryId: 'entry-2' }));
    assert.throws(() => db.prepare("UPDATE audit_events SET event_type='changed' WHERE id=1").run(), /append-only/);
    assert.throws(() => db.prepare('DELETE FROM audit_events WHERE id=1').run(), /append-only/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_events').get().count, 1);
  } finally {
    db.close();
  }
});


const supplierCreditFixture = () => {
  const originalPurchase = {
    id: 'purchase-original', companyId: 'company-1', opNumber: 1,
    invoiceDate: '2026-10-01', supplierRif: 'J-12345678-9',
    supplierName: 'Proveedor', invoiceNumber: '100', controlNumber: '00-100',
    documentType: '01', totalAmountBs: 238.96, taxableBaseBs: 200,
    exemptAmountBs: 0, taxRate: 16, vatAmountBs: 32, retentionRate: 75,
    vatWithheldBs: 24, islrWithheldBs: 2, islrSubtrahendBs: 0,
    bcvRate: 100, totalAmountUsd: 2.3896, taxableBaseUsd: 2,
    vatAmountUsd: 0.32, vatWithheldUsd: 0.24, islrWithheldUsd: 0.02,
    igtfAmountBs: 6.96, igtfAmountUsd: 0.0696,
    paymentTerm: 'CREDITO', journalEntryId: 'purchase-entry',
    inventoryLines: [{ productId: 'p-1', quantity: 2, unitCostBs: 100 }]
  };
  const originalEntry = {
    id: 'purchase-entry', companyId: 'company-1', entryNumber: 1,
    date: '2026-10-01', description: 'Compra', type: 'COMPRA', bcvRate: 100,
    referenceDoc: 'FAC-100',
    items: [
      { accountCode: '1.1.4.01', debitBs: 200, creditBs: 0, debitUsd: 2, creditUsd: 0 },
      { accountCode: '1.1.3.01', debitBs: 32, creditBs: 0, debitUsd: 0.32, creditUsd: 0 },
      { accountCode: '6.1.1.11', debitBs: 6.96, creditBs: 0, debitUsd: 0.0696, creditUsd: 0 },
      { accountCode: '2.1.2.03', debitBs: 0, creditBs: 24, debitUsd: 0, creditUsd: 0.24 },
      { accountCode: '2.1.2.04', debitBs: 0, creditBs: 2, debitUsd: 0, creditUsd: 0.02 },
      { accountCode: '2.1.1.01', debitBs: 0, creditBs: 212.96, debitUsd: 0, creditUsd: 2.1296 }
    ],
    createdAt: '2026-10-01T10:00:00.000Z'
  };
  const originalMovement = {
    id: 'purchase-movement', companyId: 'company-1', productId: 'p-1',
    date: '2026-10-01', type: 'ENTRADA', concept: 'COMPRA',
    documentRef: 'FAC-100', counterpartyRif: 'J-12345678-9',
    quantity: 2, unitCostBs: 100, unitCostUsd: 1, totalCostBs: 200,
    totalCostUsd: 2, bcvRate: 100
  };
  const product = { id: 'p-1', companyId: 'company-1', currentStock: 1, inventoryAccountCode: '1.1.4.01' };
  const noteEntry = {
    id: 'credit-entry', companyId: 'company-1', entryNumber: 2,
    date: '2026-10-10', description: 'Nota de crédito NC-001', type: 'AJUSTE',
    bcvRate: 100, referenceDoc: 'NC-PROV-NC-001',
    items: [
      { accountCode: '2.1.1.01', debitBs: 106.48, creditBs: 0, debitUsd: 1.0648, creditUsd: 0 },
      { accountCode: '2.1.2.03', debitBs: 12, creditBs: 0, debitUsd: 0.12, creditUsd: 0 },
      { accountCode: '2.1.2.04', debitBs: 1, creditBs: 0, debitUsd: 0.01, creditUsd: 0 },
      { accountCode: '1.1.4.01', debitBs: 0, creditBs: 100, debitUsd: 0, creditUsd: 1 },
      { accountCode: '1.1.3.01', debitBs: 0, creditBs: 16, debitUsd: 0, creditUsd: 0.16 },
      { accountCode: '6.1.1.11', debitBs: 0, creditBs: 3.48, debitUsd: 0, creditUsd: 0.0348 }
    ],
    createdAt: '2026-10-10T10:00:00.000Z'
  };
  const returnMovement = {
    id: 'return-movement', companyId: 'company-1', productId: 'p-1',
    date: '2026-10-10', type: 'SALIDA', concept: 'DEVOLUCION_COMPRA',
    documentRef: 'NC-PROV-NC-001', quantity: 1, unitCostBs: 100, unitCostUsd: 1, bcvRate: 100,
    totalCostBs: 100, totalCostUsd: 1, balanceQty: 1, correctionForMovementId: 'purchase-movement',
    journalEntryId: 'credit-entry', counterpartyRif: 'J-12345678-9'
  };
  const note = {
    id: 'purchase-credit-note', companyId: 'company-1', opNumber: 2,
    invoiceDate: '2026-10-10', supplierRif: 'J-12345678-9',
    supplierName: 'Proveedor', invoiceNumber: 'NC-001', controlNumber: '00-NC-001',
    creditNoteNumber: 'NC-001', affectedInvoiceNumber: '100', documentType: '03',
    totalAmountBs: 119.48, taxableBaseBs: 100, exemptAmountBs: 0,
    taxRate: 16, vatAmountBs: 16, retentionRate: 75, vatWithheldBs: 12,
    islrWithheldBs: 1, bcvRate: 100, totalAmountUsd: 1.1948,
    taxableBaseUsd: 1, vatAmountUsd: 0.16, vatWithheldUsd: 0.12,
    islrWithheldUsd: 0.01, igtfAmountBs: 3.48, igtfAmountUsd: 0.0348,
    journalEntryId: 'credit-entry', originalPurchaseId: 'purchase-original',
    netPayableReductionBs: 106.48, netPayableReductionUsd: 1.0648,
    notes: 'Mercancía defectuosa devuelta',
    creditNoteLines: [{ productId: 'p-1', originalMovementId: 'purchase-movement',
      movementId: 'return-movement', quantity: 1, unitCostBs: 100, inventoryCostBs: 100 }]
  };
  const vatVoucher = { id: 'vat-original', companyId: 'company-1', purchaseRecordId: originalPurchase.id,
    invoiceNumber: originalPurchase.invoiceNumber, supplierRif: originalPurchase.supplierRif,
    requiresFiscalCorrection: false };
  const islrVoucher = { id: 'islr-original', companyId: 'company-1', invoiceNumber: originalPurchase.invoiceNumber,
    supplierRif: originalPurchase.supplierRif, requiresFiscalCorrection: false };
  const correctedVatVoucher = { ...vatVoucher, requiresFiscalCorrection: true,
    correctionEntryId: noteEntry.id, correctionEntryIds: [noteEntry.id], correctionNote: 'Nota de crédito NC-001 requiere revisar retención fiscal' };
  const correctedIslrVoucher = { ...islrVoucher, requiresFiscalCorrection: true,
    correctionEntryId: noteEntry.id, correctionEntryIds: [noteEntry.id], correctionNote: 'Nota de crédito NC-001 requiere revisar retención fiscal' };
  const prior = { ...emptyState([originalEntry]), purchases: [originalPurchase],
    movements: [originalMovement], products: [{ ...product, currentStock: 2 }],
    vatVouchers: [vatVoucher], islrVouchers: [islrVoucher] };
  const next = { ...emptyState([originalEntry, noteEntry]), purchases: [originalPurchase, note],
    movements: [originalMovement, returnMovement], products: [product],
    vatVouchers: [correctedVatVoucher], islrVouchers: [correctedIslrVoucher] };
  return { prior, next, note, returnMovement };
};

function applySupplierAdvanceToFixture(next, note, advanceBs) {
  note.supplierAdvanceBs = advanceBs;
  note.supplierAdvanceUsd = advanceBs / 100;
  note.netPayableReductionBs = Math.round((Number(note.totalAmountBs) -
    Number(note.vatWithheldBs || 0) - Number(note.islrWithheldBs || 0) - advanceBs) * 100) / 100;
  note.netPayableReductionUsd = Math.round((Number(note.totalAmountUsd) -
    Number(note.vatWithheldUsd || 0) - Number(note.islrWithheldUsd || 0) - note.supplierAdvanceUsd) * 1000000) / 1000000;
  const journal = next.journalEntries.find(item => item.id === note.journalEntryId);
  const payable = journal.items.find(item => String(item.accountCode || '').startsWith('2.1.1.'));
  payable.debitBs = note.netPayableReductionBs;
  payable.debitUsd = note.netPayableReductionUsd;
  journal.items.push({
    accountCode: '1.1.2.03', debitBs: advanceBs, creditBs: 0,
    debitUsd: note.supplierAdvanceUsd, creditUsd: 0
  });
}

test('SQLite reconciles concurrent supplier returns independently when companies reuse product ids', () => {
  const { prior, next } = supplierCreditFixture();
  const clone = (value, suffix) => ({ ...value,
    id: value.id + suffix, companyId: 'company-2',
    ...(value.journalEntryId ? { journalEntryId: value.journalEntryId + suffix } : {}),
    ...(value.correctionEntryId ? { correctionEntryId: value.correctionEntryId + suffix } : {}),
    ...(value.correctionEntryIds ? { correctionEntryIds: value.correctionEntryIds.map(id => id + suffix) } : {}),
    ...(value.purchaseRecordId ? { purchaseRecordId: value.purchaseRecordId + suffix } : {}),
    ...(value.originalPurchaseId ? { originalPurchaseId: value.originalPurchaseId + suffix } : {}),
    ...(value.originalMovementId ? { originalMovementId: value.originalMovementId + suffix } : {}),
    ...(value.movementId ? { movementId: value.movementId + suffix } : {}),
    ...(value.correctionForMovementId ? { correctionForMovementId: value.correctionForMovementId + suffix } : {}),
    ...(value.creditNoteLines ? { creditNoteLines: value.creditNoteLines.map(line => ({
      ...line, originalMovementId: line.originalMovementId + suffix,
      movementId: line.movementId + suffix
    })) } : {})
  });
  const originalPurchase = clone(prior.purchases[0], '-2');
  const originalEntry = clone(prior.journalEntries[0], '-2');
  const originalMovement = clone(prior.movements[0], '-2');
  const productPrior = { ...prior.products[0], companyId: 'company-2' };
  const note = clone(next.purchases[1], '-2');
  const noteEntry = clone(next.journalEntries[1], '-2');
  const returnMovement = clone(next.movements[1], '-2');
  const productNext = { ...next.products[0], companyId: 'company-2' };
  prior.purchases.push(originalPurchase);
  prior.journalEntries.push(originalEntry);
  prior.movements.push(originalMovement);
  prior.products.push(productPrior);
  next.purchases.push(originalPurchase, note);
  next.journalEntries.push(originalEntry, noteEntry);
  next.movements.push(originalMovement, returnMovement);
  next.products.push(productNext);
  assert.doesNotThrow(() => validateAccountingSnapshot(prior, next));
});

test('SQLite accepts a supplier credit note only with linked stock return, balanced journal, taxes, AP reduction and flagged retention vouchers', () => {
  const { prior, next } = supplierCreditFixture();
  assert.equal(next.vatVouchers[0].correctionEntryId, 'credit-entry');
  assert.equal(next.islrVouchers[0].correctionEntryId, 'credit-entry');
  assert.doesNotThrow(() => validateAccountingSnapshot(prior, next));
});

test('SQLite rejects duplicate references to the same original stock movement in one supplier credit note', () => {
  const { prior, next } = supplierCreditFixture();
  const note = next.purchases.find(item => item.id === 'purchase-credit-note');
  const returnMovement = next.movements.find(item => item.id === 'return-movement');
  note.creditNoteLines.push({ ...note.creditNoteLines[0], movementId: 'return-movement-duplicate' });
  next.movements.push({ ...returnMovement, id: 'return-movement-duplicate' });
  assert.throws(() => validateAccountingSnapshot(prior, next), /salida física no concilia|línea de nota de crédito|existencia final del artículo/i);
});

test('SQLite reconciles supplier credit note against the payable auxiliary used by the original purchase', () => {
  const { prior, next } = supplierCreditFixture();
  const originalEntry = next.journalEntries.find(item => item.id === 'purchase-entry');
  const creditEntry = next.journalEntries.find(item => item.id === 'credit-entry');
  originalEntry.items.find(item => item.accountCode === '2.1.1.01').accountCode = '2.1.1.09';
  creditEntry.items.find(item => item.accountCode === '2.1.1.01').accountCode = '2.1.1.09';
  assert.doesNotThrow(() => validateAccountingSnapshot(prior, next));
  creditEntry.items.find(item => item.accountCode === '2.1.1.09').accountCode = '2.1.1.01';
  assert.throws(() => validateAccountingSnapshot(prior, next), /no está balanceado o no revierte CxP/);
});

test('SQLite rejects supplier credit note amounts posted to the opposite side of the payable auxiliary', () => {
  const { prior, next } = supplierCreditFixture();
  const entry = next.journalEntries.find(item => item.id === 'credit-entry');
  entry.items.push(
    { accountCode: '2.1.1.01', debitBs: 0, creditBs: 1, debitUsd: 0, creditUsd: 0.01 },
    { accountCode: '1.1.1.01', debitBs: 1, creditBs: 0, debitUsd: 0.01, creditUsd: 0 }
  );
  assert.throws(() => validateAccountingSnapshot(prior, next), /no está balanceado o no revierte CxP/);
});

test('SQLite rejects a retention correction flag linked to an unrelated entry', () => {
  const { prior, next } = supplierCreditFixture();
  next.vatVouchers[0].correctionEntryId = 'unrelated-entry';
  next.vatVouchers[0].correctionEntryIds.push('unrelated-entry');
  assert.throws(() => validateAccountingSnapshot(prior, next), /corrección de retención IVA/);
});

test('SQLite reconciles the portion of a supplier credit note applied to AP and the excess recorded as an advance', () => {
  const { prior, next } = supplierCreditFixture();
  const note = next.purchases[1];
  const entry = next.journalEntries.find(item => item.id === note.journalEntryId);
  note.netPayableReductionBs = 96.48;
  note.netPayableReductionUsd = 0.9648;
  note.supplierAdvanceBs = 10;
  note.supplierAdvanceUsd = 0.1;
  const payable = entry.items.find(item => item.accountCode === '2.1.1.01');
  payable.debitBs = 96.48;
  payable.debitUsd = 0.9648;
  entry.items.push({ accountCode: '1.1.2.03', debitBs: 10, creditBs: 0, debitUsd: 0.1, creditUsd: 0 });
  assert.doesNotThrow(() => validateAccountingSnapshot(prior, next));
  note.supplierAdvanceBs = 9;
  assert.throws(() => validateAccountingSnapshot(prior, next), /no revierte CxP, inventario, IVA, retenciones e IGTF/);
});

test('SQLite rejects impossible calendar dates on supplier credit notes', () => {
  const { prior, next } = supplierCreditFixture();
  next.purchases[1].invoiceDate = '2026-02-30';
  next.journalEntries[1].date = '2026-02-30';
  next.movements[1].date = '2026-02-30';
  assert.throws(() => validateAccountingSnapshot(prior, next), /falta factura original, proveedor, soporte/);
});

test('SQLite rejects supplier credit note without the linked physical return', () => {
  const { prior, next } = supplierCreditFixture();
  next.movements = next.movements.filter(item => item.id !== 'return-movement');
  assert.throws(() => validateAccountingSnapshot(prior, next), /cada línea de nota de crédito debe tener exactamente su salida/);
});

test('SQLite rejects a return movement linked to the note but assigned to another product or date', () => {
  for (const mutate of [
    movement => { movement.productId = 'different-product'; },
    movement => { movement.date = '2026-10-11'; },
    movement => { movement.unitCostBs = 99; }
  ]) {
    const { prior, next } = supplierCreditFixture();
    mutate(next.movements[1]);
    assert.throws(() => validateAccountingSnapshot(prior, next), /la salida física no concilia/);
  }
});

test('SQLite rejects supplier credit note whose journal does not reverse VAT or AP correctly', () => {
  const { prior, next } = supplierCreditFixture();
  next.journalEntries[1].items[0].debitBs = 50;
  assert.throws(() => validateAccountingSnapshot(prior, next), /no cuadra simultáneamente/);
});

test('SQLite rejects cumulative supplier returns above the original invoice quantity', () => {
  const { prior, next } = supplierCreditFixture();
  const secondNote = {
    ...next.purchases[1], id: 'purchase-credit-note-2', invoiceNumber: 'NC-002',
    creditNoteNumber: 'NC-002', opNumber: 3, journalEntryId: 'credit-entry-2',
    totalAmountBs: 179.22, taxableBaseBs: 150, vatAmountBs: 24,
    vatWithheldBs: 18, islrWithheldBs: 1.5, igtfAmountBs: 5.22,
    totalAmountUsd: 1.7922, taxableBaseUsd: 1.5, vatAmountUsd: 0.24,
    vatWithheldUsd: 0.18, islrWithheldUsd: 0.015, igtfAmountUsd: 0.0522,
    netPayableReductionBs: 159.72, netPayableReductionUsd: 1.5972,
    creditNoteLines: [{ ...next.purchases[1].creditNoteLines[0], quantity: 1.5, inventoryCostBs: 150, movementId: 'return-movement-2' }]
  };
  const secondMovement = { ...next.movements[1], id: 'return-movement-2', quantity: 1.5,
    totalCostBs: 150, totalCostUsd: 1.5, documentRef: 'NC-PROV-NC-002',
    correctionForMovementId: 'purchase-movement', journalEntryId: 'credit-entry-2' };
  const secondEntry = {
    ...next.journalEntries[1], id: 'credit-entry-2', entryNumber: 3,
    referenceDoc: 'NC-PROV-NC-002',
    items: [
      { accountCode: '2.1.1.01', debitBs: 159.72, creditBs: 0, debitUsd: 1.5972, creditUsd: 0 },
      { accountCode: '2.1.2.03', debitBs: 18, creditBs: 0, debitUsd: 0.18, creditUsd: 0 },
      { accountCode: '2.1.2.04', debitBs: 1.5, creditBs: 0, debitUsd: 0.015, creditUsd: 0 },
      { accountCode: '1.1.4.01', debitBs: 0, creditBs: 150, debitUsd: 0, creditUsd: 1.5 },
      { accountCode: '1.1.3.01', debitBs: 0, creditBs: 24, debitUsd: 0, creditUsd: 0.24 },
      { accountCode: '6.1.1.11', debitBs: 0, creditBs: 5.22, debitUsd: 0, creditUsd: 0.0522 }
    ]
  };
  next.purchases.push(secondNote);
  next.movements.push(secondMovement);
  next.journalEntries.push(secondEntry);
  assert.throws(() => validateAccountingSnapshot(prior, next), /devoluciones acumuladas superan/);
});


test('Production SQLite persistence rolls back atomically on audit failure and survives database reopen', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { persistAccountingSnapshot } = require('./accounting-persistence.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sicoven-credit-note-'));
  const filename = path.join(directory, 'sicoven.sqlite');
  const { prior, next } = supplierCreditFixture();
  let db;
  try {
    db = new Database(filename);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.exec(`
      CREATE TABLE app_state (
        state_key TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        details_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
        BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
      CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
        BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
    `);
    db.prepare('INSERT INTO app_state(state_key,state_json) VALUES(?,?)')
      .run('accounting', JSON.stringify(prior));

    db.exec(`CREATE TRIGGER reject_supplier_credit_audit BEFORE INSERT ON audit_events
      WHEN NEW.event_type='supplier_credit_note_posted'
      BEGIN SELECT RAISE(ABORT, 'simulated audit write failure'); END;`);
    assert.throws(() => persistAccountingSnapshot(db, next), /simulated audit write failure/);
    assert.deepEqual(
      JSON.parse(db.prepare("SELECT state_json FROM app_state WHERE state_key='accounting'").get().state_json),
      prior,
      'el fallo de auditoría debe revertir también el estado contable'
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_events').get().count, 0);

    db.exec('DROP TRIGGER reject_supplier_credit_audit');
    const saved = persistAccountingSnapshot(db, next);
    assert.equal(saved.ok, true);
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    db = null;

    db = new Database(filename);
    const reopened = JSON.parse(
      db.prepare("SELECT state_json FROM app_state WHERE state_key='accounting'").get().state_json
    );
    assert.equal(reopened.purchases.find(item => item.id === 'purchase-credit-note').documentType, '03');
    assert.equal(reopened.purchases.find(item => item.id === 'purchase-credit-note').originalPurchaseId, 'purchase-original');
    assert.equal(reopened.movements.find(item => item.id === 'return-movement').journalEntryId, 'credit-entry');
    assert.equal(reopened.journalEntries.find(item => item.id === 'credit-entry').referenceDoc, 'NC-PROV-NC-001');
    assert.equal(reopened.vatVouchers[0].correctionEntryIds[0], 'credit-entry');
    assert.equal(reopened.islrVouchers[0].correctionEntryIds[0], 'credit-entry');
    const audit = db.prepare("SELECT details_json FROM audit_events WHERE event_type='supplier_credit_note_posted'").get();
    assert.ok(audit);
    assert.equal(JSON.parse(audit.details_json).documentId, 'purchase-credit-note');
  } finally {
    if (db?.open) db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('SQLite rejects supplier credit notes when the original payable or tax journal is not reconciled', () => {
  const { prior, next } = supplierCreditFixture();
  const alteredOriginal = {
    ...prior.journalEntries[0],
    items: prior.journalEntries[0].items.map(item => item.accountCode === '2.1.1.01'
      ? { ...item, creditBs: 200, creditUsd: 2 } : item)
  };
  const alteredPrior = { ...prior, journalEntries: [alteredOriginal] };
  const alteredNext = {
    ...next,
    journalEntries: [alteredOriginal, ...next.journalEntries.filter(item => item.id !== alteredOriginal.id)]
  };
  assert.throws(() => validateAccountingSnapshot(alteredPrior, alteredNext),
    /factura original o el asiento fiscal no están conciliados/);
});

test('SQLite rejects supplier advance settlements without source credit notes and linked journal', () => {
  const invalid = {
    id: 'advance-settlement-1', companyId: 'company-1', supplierRif: 'J-12345678-9',
    kind: 'REFUND_RECEIVED', date: '2026-10-30', amountUsd: 10, amountBs: 1000,
    advanceBookValueBs: 900, cashReceivedBs: 1000, bcvRate: 100,
    sourceCreditNoteIds: ['missing-credit-note'], sourceCreditNoteAllocations: [{ creditNoteId: 'missing-credit-note', amountUsd: 10, bookValueBs: 900 }], treasuryAccountCode: '1.1.1.03',
    journalEntryId: 'missing-journal', createdAt: '2026-10-30T10:00:00.000Z'
  };
  assert.throws(() => validateAccountingSnapshot(
    emptyState(),
    { ...emptyState(), supplierAdvanceSettlements: [invalid] }
  ), /notas de crédito inexistentes/);
});

test('SQLite rejects supplier advance allocations that exceed the individual credit-note balance', () => {
  const { prior, next, note } = supplierCreditFixture();
  applySupplierAdvanceToFixture(next, note, 10);
  const makeRefund = (id, entryNumber, amountUsd, date) => {
    const cashBs = amountUsd * 100;
    const journalId = id + '-journal';
    return {
      journal: {
        id: journalId, companyId: 'company-1', entryNumber, date,
        description: 'Reembolso anticipo', type: 'ANTICIPO_PROVEEDOR', bcvRate: 100,
        items: [
          { accountCode: '1.1.1.03', debitBs: cashBs, creditBs: 0, debitUsd: amountUsd, creditUsd: 0 },
          { accountCode: '1.1.2.03', debitBs: 0, creditBs: cashBs, debitUsd: 0, creditUsd: amountUsd }
        ],
        createdAt: date + 'T10:00:00.000Z'
      },
      settlement: {
        id, companyId: 'company-1', supplierRif: 'J-12345678-9',
        kind: 'REFUND_RECEIVED', date, amountUsd, amountBs: cashBs,
        advanceBookValueBs: cashBs, cashReceivedBs: cashBs, bcvRate: 100,
        sourceCreditNoteIds: [note.id],
        sourceCreditNoteAllocations: [{ creditNoteId: note.id, amountUsd, bookValueBs: cashBs }],
        treasuryAccountCode: '1.1.1.03', journalEntryId: journalId,
        createdAt: date + 'T10:00:00.000Z'
      }
    };
  };
  const first = makeRefund('refund-1', 3, 0.06, '2026-10-20');
  const second = makeRefund('refund-2', 4, 0.05, '2026-10-21');
  const adjustedNext = {
    ...next,
    journalEntries: [...next.journalEntries, first.journal, second.journal],
    supplierAdvanceSettlements: [first.settlement, second.settlement],
    bankAccounts: [{ id: 'bank-1', companyId: 'company-1', accountCode: '1.1.1.03' }]
  };
  assert.throws(() => validateAccountingSnapshot(prior, adjustedNext),
    /liquidaciones de anticipos que exceden el saldo acreditado por notas de crédito/);
});

test('SQLite restores an individual credit-note advance allocation after its settlement is reversed', () => {
  const { prior, next, note } = supplierCreditFixture();
  applySupplierAdvanceToFixture(next, note, 10);
  const original = {
    id: 'refund-reversed-journal', companyId: 'company-1', entryNumber: 3,
    date: '2026-10-20', description: 'Reembolso luego reversado',
    type: 'ANTICIPO_PROVEEDOR', bcvRate: 100,
    reversedByEntryId: 'refund-reversal-journal', isAdjusted: true,
    items: [
      { accountCode: '1.1.1.03', debitBs: 6, creditBs: 0, debitUsd: 0.06, creditUsd: 0 },
      { accountCode: '1.1.2.03', debitBs: 0, creditBs: 6, debitUsd: 0, creditUsd: 0.06 }
    ]
  };
  const reversal = {
    id: 'refund-reversal-journal', companyId: 'company-1', entryNumber: 4,
    date: '2026-10-21', description: 'REVERSIÓN / reembolso',
    type: 'AJUSTE', bcvRate: 100, reversalOfEntryId: original.id,
    referenceDoc: 'REV-3',
    reversalReason: 'Restituir el anticipo recibido por error',
    workpaperNote: 'Se cotejó el recibo bancario y el asiento original',
    items: [
      { accountCode: '1.1.1.03', debitBs: 0, creditBs: 6, debitUsd: 0, creditUsd: 0.06 },
      { accountCode: '1.1.2.03', debitBs: 6, creditBs: 0, debitUsd: 0.06, creditUsd: 0 }
    ]
  };
  const active = {
    id: 'refund-active-settlement', companyId: 'company-1', supplierRif: 'J-12345678-9',
    kind: 'REFUND_RECEIVED', date: '2026-10-22', amountUsd: 0.05, amountBs: 5,
    advanceBookValueBs: 5, cashReceivedBs: 5, bcvRate: 100,
    sourceCreditNoteIds: [note.id],
    sourceCreditNoteAllocations: [{ creditNoteId: note.id, amountUsd: 0.05, bookValueBs: 5 }],
    treasuryAccountCode: '1.1.1.03', journalEntryId: 'refund-active-journal',
    createdAt: '2026-10-22T10:00:00.000Z'
  };
  const activeJournal = {
    id: 'refund-active-journal', companyId: 'company-1', entryNumber: 5,
    date: '2026-10-22', description: 'Reembolso posterior',
    type: 'ANTICIPO_PROVEEDOR', bcvRate: 100,
    items: [
      { accountCode: '1.1.1.03', debitBs: 5, creditBs: 0, debitUsd: 0.05, creditUsd: 0 },
      { accountCode: '1.1.2.03', debitBs: 0, creditBs: 5, debitUsd: 0, creditUsd: 0.05 }
    ]
  };
  const reversedSettlement = {
    id: 'refund-reversed-settlement', companyId: 'company-1', supplierRif: 'J-12345678-9',
    kind: 'REFUND_RECEIVED', date: '2026-10-20', amountUsd: 0.06, amountBs: 6,
    advanceBookValueBs: 6, cashReceivedBs: 6, bcvRate: 100,
    sourceCreditNoteIds: [note.id],
    sourceCreditNoteAllocations: [{ creditNoteId: note.id, amountUsd: 0.06, bookValueBs: 6 }],
    treasuryAccountCode: '1.1.1.03', journalEntryId: original.id,
    isReversed: true, reversedByJournalEntryId: reversal.id,
    createdAt: '2026-10-20T10:00:00.000Z'
  };
  const adjustedNext = {
    ...next,
    journalEntries: [...next.journalEntries, original, reversal, activeJournal],
    supplierAdvanceSettlements: [reversedSettlement, active],
    bankAccounts: [{ id: 'bank-1', companyId: 'company-1', accountCode: '1.1.1.03' }]
  };
  assert.doesNotThrow(() => validateAccountingSnapshot(prior, adjustedNext));
});

test('SQLite rejects supplier advance settlements with an unbalanced linked journal', () => {
  const { prior, next, note } = supplierCreditFixture();
  applySupplierAdvanceToFixture(next, note, 10);
  const journal = {
    id: 'advance-journal', companyId: 'company-1', entryNumber: 3, date: '2026-10-30',
    description: 'Liquidación anticipo', type: 'ANTICIPO_PROVEEDOR', bcvRate: 100,
    items: [
      { accountCode: '1.1.1.03', debitBs: 10, creditBs: 0, debitUsd: 0.1, creditUsd: 0 },
      { accountCode: '1.1.2.03', debitBs: 0, creditBs: 9.98, debitUsd: 0, creditUsd: 0.1 }
    ],
    createdAt: '2026-10-30T10:00:00.000Z'
  };
  const settlement = {
    id: 'advance-settlement-2', companyId: 'company-1', supplierRif: 'J-12345678-9',
    kind: 'REFUND_RECEIVED', date: '2026-10-30', amountUsd: 0.1, amountBs: 10,
    advanceBookValueBs: 10, cashReceivedBs: 10, bcvRate: 100,
    sourceCreditNoteIds: [note.id],
    sourceCreditNoteAllocations: [{ creditNoteId: note.id, amountUsd: 0.1, bookValueBs: 10 }],
    treasuryAccountCode: '1.1.1.03', journalEntryId: 'advance-journal',
    createdAt: '2026-10-30T10:00:00.000Z'
  };
  const adjustedNext = {
    ...next,
    journalEntries: [...next.journalEntries, journal],
    supplierAdvanceSettlements: [settlement],
    bankAccounts: [{ id: 'bank-1', companyId: 'company-1', accountCode: '1.1.1.03' }]
  };
  assert.throws(() => validateAccountingSnapshot(prior, adjustedNext),
    /asiento de anticipo descuadrado|no cuadra simultáneamente en Bs\. y USD/);
});


test('SQLite rejects supplier advance refunds posted to an unrelated account instead of the exact FX gain account', () => {
  const { prior, next, note } = supplierCreditFixture();
  applySupplierAdvanceToFixture(next, note, 10);
  const journal = {
    id: 'advance-fx-journal', companyId: 'company-1', entryNumber: 3, date: '2026-10-30',
    description: 'Reembolso anticipo con ganancia cambiaria', type: 'ANTICIPO_PROVEEDOR', bcvRate: 100,
    items: [
      { accountCode: '1.1.1.03', debitBs: 10, creditBs: 0, debitUsd: 0.1, creditUsd: 0 },
      { accountCode: '1.1.2.03', debitBs: 0, creditBs: 9, debitUsd: 0, creditUsd: 0.1 },
      { accountCode: '4.2.1.99', debitBs: 0, creditBs: 1, debitUsd: 0, creditUsd: 0 }
    ],
    createdAt: '2026-10-30T10:00:00.000Z'
  };
  const settlement = {
    id: 'advance-fx-settlement', companyId: 'company-1', supplierRif: 'J-12345678-9',
    kind: 'REFUND_RECEIVED', date: '2026-10-30', amountUsd: 0.1, amountBs: 9,
    advanceBookValueBs: 9, cashReceivedBs: 10, bcvRate: 100,
    sourceCreditNoteIds: [note.id],
    sourceCreditNoteAllocations: [{ creditNoteId: note.id, amountUsd: 0.1, bookValueBs: 9 }],
    treasuryAccountCode: '1.1.1.03', journalEntryId: journal.id,
    createdAt: '2026-10-30T10:00:00.000Z'
  };
  const adjustedNext = {
    ...next, journalEntries: [...next.journalEntries, journal],
    supplierAdvanceSettlements: [settlement],
    bankAccounts: [{ id: 'bank-1', companyId: 'company-1', accountCode: '1.1.1.03' }]
  };
  assert.throws(() => validateAccountingSnapshot(prior, adjustedNext),
    /cuenta de tesorería, efectivo recibido o diferencial cambiario no concilian exactamente/);
});


test('SQLite rejects supplier credit notes with an invalid BCV rate', () => {
  const { prior, next } = supplierCreditFixture();
  const note = next.purchases.find(item => item.id === 'purchase-credit-note');
  note.bcvRate = Number.NaN;
  assert.throws(() => validateAccountingSnapshot(prior, next), /falta factura original, proveedor, soporte, líneas de Kardex o reducción de CxP válida/);
});

test('SQLite rejects supplier credit note lines with non-numeric quantities', () => {
  const { prior, next } = supplierCreditFixture();
  const note = next.purchases.find(item => item.id === 'purchase-credit-note');
  note.creditNoteLines[0].quantity = Number.NaN;
  assert.throws(() => validateAccountingSnapshot(prior, next), /la salida física no concilia con la entrada original/);
});

test('SQLite rejects balanced supplier credit note journals with unrelated accounts', () => {
  const { prior, next } = supplierCreditFixture();
  const journal = next.journalEntries.find(item => item.id === 'credit-entry');
  journal.items.push(
    { accountCode: '9.9.9.99', debitBs: 1, creditBs: 0, debitUsd: 0, creditUsd: 0 },
    { accountCode: '9.9.9.99', debitBs: 0, creditBs: 1, debitUsd: 0, creditUsd: 0 }
  );
  assert.throws(() => validateAccountingSnapshot(prior, next), /nota de crédito: el asiento no está balanceado o no revierte CxP/);
});


test('SQLite rejects supplier credit notes whose USD totals do not match the recorded BCV rate', () => {
  const { prior, next } = supplierCreditFixture();
  const note = next.purchases.find(item => item.id === 'purchase-credit-note');
  note.totalAmountUsd += 0.05;
  assert.throws(() => validateAccountingSnapshot(prior, next), /nota de crédito: el asiento no está balanceado o no revierte CxP/);
});


test('SQLite rejects supplier return movements with a different BCV rate or USD unit cost', () => {
  for (const mutate of [
    movement => { movement.bcvRate = 200; },
    movement => { movement.unitCostUsd = 0.75; }
  ]) {
    const { prior, next } = supplierCreditFixture();
    const movement = next.movements.find(item => item.id === 'return-movement');
    mutate(movement);
    assert.throws(() => validateAccountingSnapshot(prior, next), /la salida física no concilia con la entrada original/);
  }
});

test('SQLite rejects supplier return movements with an invalid final stock balance', () => {
  const { prior, next } = supplierCreditFixture();
  const movement = next.movements.find(item => item.id === 'return-movement');
  movement.balanceQty = Number.NaN;
  assert.throws(() => validateAccountingSnapshot(prior, next), /la salida física no concilia con la entrada original/);
});

test('SQLite preserves legacy company history instead of allowing demo-ID deletion bypasses', () => {
  const prior = emptyState();
  prior.movements = [{
    id: 'movement-legacy-1', companyId: 'comp-1', productId: 'product-1',
    quantity: 1, type: 'ENTRADA', date: '2025-01-01'
  }];
  const next = emptyState();
  assert.throws(
    () => validateAccountingSnapshot(prior, next),
    /bloqueó la eliminación del registro histórico en movements/
  );
});


test('SQLite preserves the ISLR fiscal event ledger as append-only history', () => {
  const fiscalEvent = {
    id: 'islr-event-1', companyId: 'company-1', supplierRif: 'J-12345678-9',
    conceptCode: '003', fiscalDate: '2026-10-01', sequence: 1, kind: 'PAYMENT',
    allocations: [{ purchaseId: 'purchase-1', baseAmountBs: 100 }],
    basePercentage: 90, unitTaxValueBs: 43, withheldAmountBs: 0,
    journalEntryId: 'entry-1', createdAt: '2026-10-01T10:00:00.000Z'
  };
  const purchase = {
    id: 'purchase-1', companyId: 'company-1', supplierRif: 'J-12345678-9',
    documentType: '01', taxableBaseBs: 100, exemptAmountBs: 0, isCancelled: false
  };
  const secondPurchase = { ...purchase, id: 'purchase-2' };
  const prior = { ...emptyState([sourceEntry()]), purchases: [purchase, secondPurchase], islrFiscalEvents: [fiscalEvent] };
  const secondEntry = { ...sourceEntry(), id: 'entry-2', entryNumber: 2 };
  assert.doesNotThrow(() => validateAccountingSnapshot(prior, {
    ...emptyState([sourceEntry(), secondEntry]), purchases: [purchase, secondPurchase],
    islrFiscalEvents: [fiscalEvent, {
      ...fiscalEvent, id: 'islr-event-2', sequence: 2, journalEntryId: 'entry-2',
      allocations: [{ purchaseId: 'purchase-2', baseAmountBs: 100 }]
    }]
  }));
  assert.throws(() => validateAccountingSnapshot(prior, {
    ...emptyState([sourceEntry()]), purchases: [purchase, secondPurchase],
    islrFiscalEvents: []
  }), /eliminación del registro histórico en islrFiscalEvents/);
  assert.throws(() => validateAccountingSnapshot(prior, {
    ...emptyState([sourceEntry()]), purchases: [purchase, secondPurchase],
    islrFiscalEvents: [{ ...fiscalEvent, withheldAmountBs: 10 }]
  }), /modificación de un registro histórico en islrFiscalEvents/);
});

test('SQLite accepts a supplier credit note from a cash purchase as a supplier advance without creating or reducing AP', () => {
  const { prior, next, note } = supplierCreditFixture();
  const original = next.purchases.find(item => item.id === 'purchase-original');
  original.paymentTerm = 'CONTADO';
  original.paymentAccountCode = '1.1.1.01';
  original.paymentReference = 'EG-100';
  const originalEntry = next.journalEntries.find(item => item.id === 'purchase-entry');
  originalEntry.items.find(item => item.accountCode === '2.1.1.01').accountCode = '1.1.1.01';
  const treasury = { code: '1.1.1.01', name: 'Caja Principal', type: 'ACTIVO', level: 4, isMovement: true, parentCode: '1.1.1' };
  prior.accounts = [treasury];
  next.accounts = [treasury];

  note.netPayableReductionBs = 0;
  note.netPayableReductionUsd = 0;
  note.supplierAdvanceBs = 106.48;
  note.supplierAdvanceUsd = 1.0648;
  const noteEntry = next.journalEntries.find(item => item.id === 'credit-entry');
  noteEntry.items.find(item => item.accountCode === '2.1.1.01').accountCode = '1.1.2.03';
  assert.equal(originalEntry.items.some(item => String(item.accountCode).startsWith('2.1.1.')), false);
  assert.equal(noteEntry.items.some(item => String(item.accountCode).startsWith('2.1.1.')), false);
  assert.doesNotThrow(() => validateAccountingSnapshot(prior, next));
});

test('SQLite rejects a cash-purchase credit note that posts any amount to a fictitious AP auxiliary', () => {
  const { prior, next, note } = supplierCreditFixture();
  const original = next.purchases.find(item => item.id === 'purchase-original');
  original.paymentTerm = 'CONTADO';
  original.paymentAccountCode = '1.1.1.01';
  original.paymentReference = 'EG-100';
  const originalEntry = next.journalEntries.find(item => item.id === 'purchase-entry');
  originalEntry.items.find(item => item.accountCode === '2.1.1.01').accountCode = '1.1.1.01';
  const treasury = { code: '1.1.1.01', name: 'Caja Principal', type: 'ACTIVO', level: 4, isMovement: true, parentCode: '1.1.1' };
  prior.accounts = [treasury];
  next.accounts = [treasury];
  note.netPayableReductionBs = 0;
  note.netPayableReductionUsd = 0;
  note.supplierAdvanceBs = 106.48;
  note.supplierAdvanceUsd = 1.0648;
  const noteEntry = next.journalEntries.find(item => item.id === 'credit-entry');
  const advanceDebit = noteEntry.items.find(item => item.accountCode === '2.1.1.01');
  advanceDebit.accountCode = '1.1.2.03';
  advanceDebit.debitBs = 105.48;
  advanceDebit.debitUsd = 1.0548;
  noteEntry.items.push({ accountCode: '2.1.1.01', debitBs: 1, creditBs: 0, debitUsd: 0.01, creditUsd: 0 });
  assert.throws(() => validateAccountingSnapshot(prior, next), /no está balanceado|no revierte CxP|modalidad de pago/);
});
