import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateSupplierAdvanceCreditNotes, validateSupplierAdvanceCreditNoteAllocations, validateSupplierAdvanceSettlementDraft } from './supplierAdvanceSettlement';

const base = {
  supplierRif: 'J-12345678-9', date: '2026-10-30', amountUsd: 20,
  amountBs: 2000, bcvRate: 100, kind: 'REFUND_RECEIVED' as const,
  treasuryAccountCode: '1.1.1.03'
};

test('acepta reembolso únicamente con cuenta de tesorería identificada', () => {
  assert.equal(validateSupplierAdvanceSettlementDraft(base, 30, undefined, ['1.1.1.03']), null);
});

test('rechaza reembolso sin cuenta real de caja o banco', () => {
  assert.match(validateSupplierAdvanceSettlementDraft({ ...base, treasuryAccountCode: undefined }, 30, undefined, []) || '', /cuenta real de caja o banco/);
});

test('acepta aplicación a compra del mismo proveedor sin movimiento de tesorería', () => {
  const draft = { ...base, kind: 'APPLIED_TO_PURCHASE' as const, targetPurchaseId: 'purchase-2', treasuryAccountCode: undefined };
  assert.equal(validateSupplierAdvanceSettlementDraft(draft, 30, 'j-12345678-9'), null);
});

test('rechaza aplicación a otro proveedor y aplicación con cuenta de banco', () => {
  const draft = { ...base, kind: 'APPLIED_TO_PURCHASE' as const, targetPurchaseId: 'purchase-2' };
  assert.match(validateSupplierAdvanceSettlementDraft(draft, 30, 'J-99999999-9') || '', /mismo proveedor/);
  assert.match(validateSupplierAdvanceSettlementDraft(draft, 30, 'J-12345678-9') || '', /no debe generar movimiento/);
});

test('rechaza importe superior al saldo y permite que el efectivo difiera del valor histórico', () => {
  assert.match(validateSupplierAdvanceSettlementDraft(base, 10, undefined, ['1.1.1.03']) || '', /supera el saldo/);
  assert.equal(validateSupplierAdvanceSettlementDraft({ ...base, amountBs: 1900 }, 30, undefined, ['1.1.1.03']), null);
  assert.match(validateSupplierAdvanceSettlementDraft({ ...base, cashReceivedBs: 0 }, 30, undefined, ['1.1.1.03']) || '', /efectivamente recibido/);
});


test('distribuye una liquidación FIFO entre varias notas y conserva valores históricos', () => {
  const sources = [
    { id: 'nc-1', amountUsd: 10, bookValueBs: 800 },
    { id: 'nc-2', amountUsd: 15, bookValueBs: 1500 }
  ];
  const allocations = allocateSupplierAdvanceCreditNotes(sources, [], 'company-1', 'J-12345678-9', 12);
  assert.deepEqual(allocations, [
    { creditNoteId: 'nc-1', amountUsd: 10, bookValueBs: 800 },
    { creditNoteId: 'nc-2', amountUsd: 2, bookValueBs: 200 }
  ]);
  assert.equal(validateSupplierAdvanceCreditNoteAllocations(allocations, ['nc-1', 'nc-2'], 12, 1000), null);
});

test('descuenta asignaciones previas por nota y restaura saldo cuando la liquidación fue reversada', () => {
  const sources = [{ id: 'nc-1', amountUsd: 10, bookValueBs: 900 }];
  const prior = {
    id: 'settlement-1', companyId: 'company-1', supplierRif: 'J-12345678-9',
    supplierName: 'Proveedor', sourceCreditNoteIds: ['nc-1'],
    sourceCreditNoteAllocations: [{ creditNoteId: 'nc-1', amountUsd: 4, bookValueBs: 360 }],
    kind: 'REFUND_RECEIVED' as const, date: '2026-10-29', amountUsd: 4, amountBs: 360,
    bcvRate: 100, journalEntryId: 'entry-1', createdAt: '2026-10-29T10:00:00.000Z'
  };
  assert.deepEqual(allocateSupplierAdvanceCreditNotes(sources, [prior], 'company-1', 'J-12345678-9', 6), [
    { creditNoteId: 'nc-1', amountUsd: 6, bookValueBs: 540 }
  ]);
  assert.deepEqual(allocateSupplierAdvanceCreditNotes(sources, [{ ...prior, isReversed: true }], 'company-1', 'J-12345678-9', 10), [
    { creditNoteId: 'nc-1', amountUsd: 10, bookValueBs: 900 }
  ]);
});

test('rechaza distribución que no cuadra, fuentes duplicadas y liquidaciones legacy ambiguas', () => {
  assert.match(validateSupplierAdvanceCreditNoteAllocations(
    [{ creditNoteId: 'nc-1', amountUsd: 4, bookValueBs: 400 }], ['nc-1'], 5, 400
  ) || '', /no coincide/);
  assert.match(validateSupplierAdvanceCreditNoteAllocations(
    [{ creditNoteId: 'nc-1', amountUsd: 2, bookValueBs: 200 }, { creditNoteId: 'nc-1', amountUsd: 3, bookValueBs: 300 }],
    ['nc-1', 'nc-1'], 5, 500
  ) || '', /duplicados/);
  const legacy = {
    id: 'legacy', companyId: 'company-1', supplierRif: 'J-12345678-9',
    supplierName: 'Proveedor', sourceCreditNoteIds: ['nc-1'], kind: 'REFUND_RECEIVED' as const,
    date: '2026-10-29', amountUsd: 1, amountBs: 100, bcvRate: 100,
    journalEntryId: 'entry-legacy', createdAt: '2026-10-29T10:00:00.000Z'
  };
  assert.throws(() => allocateSupplierAdvanceCreditNotes(
    [{ id: 'nc-1', amountUsd: 10, bookValueBs: 1000 }], [legacy], 'company-1', 'J-12345678-9', 1
  ), /sin distribución por nota/);
});
