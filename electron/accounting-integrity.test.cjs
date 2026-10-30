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
  bankStatementMovements: [], vatVouchers: [], islrVouchers: [], products: [], companies: [], accounts: []
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
    taxableBaseBs: 200, exemptAmountBs: 0, bcvRate: 100, journalEntryId: 'purchase-entry',
    inventoryLines: [{ productId: 'p-1', quantity: 2, unitCostBs: 100 }]
  };
  const entry = {
    id: 'purchase-entry', companyId: 'company-1', entryNumber: 1,
    date: '2026-10-10', description: 'Compra', type: 'COMPRA', bcvRate: 100,
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
    taxableBaseBs: 200, exemptAmountBs: 0, bcvRate: 100, journalEntryId: 'purchase-entry',
    inventoryLines: [{ productId: 'p-1', quantity: 2, unitCostBs: 100 }]
  };
  const entry = {
    id: 'purchase-entry', companyId: 'company-1', entryNumber: 1,
    date: '2026-10-10', description: 'Compra', type: 'COMPRA', bcvRate: 100,
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
    quantity: 2, unitCostBs: 100, totalCostBs: 200, totalCostUsd: 2, bcvRate: 100
  };
  assert.doesNotThrow(() => validateAccountingSnapshot(
    emptyState(),
    { ...emptyState([entry]), purchases: [purchase], movements: [movement] }
  ));
});

test('SQLite rejects a purchase when the inventory debit differs from its Kardex total', () => {
  const purchase = {
    id: 'purchase-new', companyId: 'company-1', invoiceDate: '2026-10-10',
    supplierRif: 'J-12345678-9', invoiceNumber: '100', documentType: '01',
    taxableBaseBs: 200, exemptAmountBs: 0, bcvRate: 100, journalEntryId: 'purchase-entry',
    inventoryLines: [{ productId: 'p-1', quantity: 2, unitCostBs: 100 }]
  };
  const entry = {
    id: 'purchase-entry', companyId: 'company-1', entryNumber: 1,
    date: '2026-10-10', description: 'Compra', type: 'COMPRA', bcvRate: 100,
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
    quantity: 2, unitCostBs: 100, totalCostBs: 200, totalCostUsd: 2, bcvRate: 100
  };
  assert.throws(() => validateAccountingSnapshot(
    emptyState(),
    { ...emptyState([entry]), purchases: [purchase], movements: [movement] }
  ), /asiento no reconoce en Bs\. y USD/);
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

test('one-time cleanup of legacy demo companies is permitted', () => {
  const demoEntry = { ...sourceEntry(), id: 'demo-entry', companyId: 'comp-1' };
  assert.doesNotThrow(() => validateAccountingSnapshot(
    emptyState([demoEntry]), emptyState([])
  ));
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
    documentRef: 'NC-PROV-NC-001', quantity: 1, unitCostBs: 100,
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
  const prior = { ...emptyState([originalEntry]), purchases: [originalPurchase],
    movements: [originalMovement], products: [{ ...product, currentStock: 2 }] };
  const next = { ...emptyState([originalEntry, noteEntry]), purchases: [originalPurchase, note],
    movements: [originalMovement, returnMovement], products: [product] };
  return { prior, next, note, returnMovement };
};

test('SQLite accepts a supplier credit note only with linked stock return, balanced journal, taxes and AP reduction', () => {
  const { prior, next } = supplierCreditFixture();
  assert.doesNotThrow(() => validateAccountingSnapshot(prior, next));
});

test('SQLite rejects supplier credit note without the linked physical return', () => {
  const { prior, next } = supplierCreditFixture();
  next.movements = next.movements.filter(item => item.id !== 'return-movement');
  assert.throws(() => validateAccountingSnapshot(prior, next), /cada línea de nota de crédito debe tener exactamente su salida/);
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
