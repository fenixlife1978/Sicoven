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
  description: 'REVERSIÓN / Corrección documentada', type: 'AJUSTE', bcvRate: 100,
  items: [line(0, 100, 0, 1), line(100, 0, 1, 0)],
  createdAt: '2026-10-02T10:00:00.000Z', reversalOfEntryId: 'entry-1',
  reversalReason: 'Corrección documentada de error', workpaperNote: 'Papel de trabajo y soporte revisado'
});
const emptyState = (journalEntries = []) => ({
  journalEntries, purchases: [], sales: [], movements: [], creditSettlements: [],
  bankStatementMovements: [], vatVouchers: [], islrVouchers: []
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

test('SQLite keeps inventory movements append-only', () => {
  const movement = { id: 'mov-1', companyId: 'company-1', productId: 'p-1', quantity: 2, totalCostBs: 200 };
  assert.throws(() => validateAccountingSnapshot(
    { ...emptyState(), movements: [movement] },
    { ...emptyState(), movements: [] }
  ), /eliminación del registro histórico en movements/);
});

test('SQLite allows reversal metadata on a settlement but not edits to its amount', () => {
  const settlement = { id: 's-1', companyId: 'company-1', documentId: 'purchase-1', amountUsd: 10, amountBs: 1000, isReversed: false };
  const reversed = { ...settlement, isReversed: true, reversedByJournalEntryId: 'entry-2' };
  assert.doesNotThrow(() => validateAccountingSnapshot(
    { ...emptyState(), creditSettlements: [settlement] },
    { ...emptyState(), creditSettlements: [reversed] }
  ));
  assert.throws(() => validateAccountingSnapshot(
    { ...emptyState(), creditSettlements: [settlement] },
    { ...emptyState(), creditSettlements: [{ ...reversed, amountUsd: 11 }] }
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
