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

test('rechaza una cuenta USD cuando el formulario registra el efectivo recibido en Bs', () => {
  // El contexto solo entrega códigos de auxiliares BS a este formulario.
  assert.match(validateSupplierAdvanceSettlementDraft(
    { ...base, treasuryAccountCode: '1.1.1.07.01' }, 30, undefined, ['1.1.1.06.01']
  ) || '', /cuenta real de caja o banco/);
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


test('rechaza notas fuente duplicadas antes de producir asignaciones ambiguas', () => {
  assert.throws(() => allocateSupplierAdvanceCreditNotes([
    { id: 'nc-1', amountUsd: 10, bookValueBs: 900 },
    { id: 'nc-1', amountUsd: 10, bookValueBs: 900 }
  ], [], 'company-1', 'J-12345678-9', 5), /identificadores vacíos o duplicados/);
});

test('rechaza historial cuya distribución no coincide con el importe liquidado', () => {
  const invalid = {
    id: 'settlement-invalid', companyId: 'company-1', supplierRif: 'J-12345678-9',
    supplierName: 'Proveedor', sourceCreditNoteIds: ['nc-1'],
    sourceCreditNoteAllocations: [{ creditNoteId: 'nc-1', amountUsd: 4, bookValueBs: 360 }],
    kind: 'REFUND_RECEIVED' as const, date: '2026-10-29', amountUsd: 5, amountBs: 360,
    advanceBookValueBs: 360, bcvRate: 100, journalEntryId: 'entry-1',
    createdAt: '2026-10-29T10:00:00.000Z'
  };
  assert.throws(() => allocateSupplierAdvanceCreditNotes(
    [{ id: 'nc-1', amountUsd: 10, bookValueBs: 900 }],
    [invalid], 'company-1', 'J-12345678-9', 1
  ), /no es conciliable/);
});

test('rechaza historial que consume más saldo que la nota fuente', () => {
  const overdrawn = {
    id: 'settlement-overdrawn', companyId: 'company-1', supplierRif: 'J-12345678-9',
    supplierName: 'Proveedor', sourceCreditNoteIds: ['nc-1'],
    sourceCreditNoteAllocations: [{ creditNoteId: 'nc-1', amountUsd: 11, bookValueBs: 990 }],
    kind: 'REFUND_RECEIVED' as const, date: '2026-10-29', amountUsd: 11, amountBs: 990,
    advanceBookValueBs: 990, bcvRate: 100, journalEntryId: 'entry-1',
    createdAt: '2026-10-29T10:00:00.000Z'
  };
  assert.throws(() => allocateSupplierAdvanceCreditNotes(
    [{ id: 'nc-1', amountUsd: 10, bookValueBs: 900 }],
    [overdrawn], 'company-1', 'J-12345678-9', 1
  ), /exceden el saldo/);
});

test('mantiene aisladas las asignaciones históricas por empresa y proveedor', () => {
  const otherCompany = {
    id: 'settlement-other-company', companyId: 'company-2', supplierRif: 'J-12345678-9',
    supplierName: 'Proveedor', sourceCreditNoteIds: ['nc-1'],
    sourceCreditNoteAllocations: [{ creditNoteId: 'nc-1', amountUsd: 8, bookValueBs: 720 }],
    kind: 'REFUND_RECEIVED' as const, date: '2026-10-29', amountUsd: 8, amountBs: 720,
    advanceBookValueBs: 720, bcvRate: 100, journalEntryId: 'entry-2',
    createdAt: '2026-10-29T10:00:00.000Z'
  };
  const otherSupplier = {
    ...otherCompany, id: 'settlement-other-supplier', companyId: 'company-1',
    supplierRif: 'J-99999999-9'
  };
  assert.deepEqual(allocateSupplierAdvanceCreditNotes(
    [{ id: 'nc-1', amountUsd: 10, bookValueBs: 900 }],
    [otherCompany, otherSupplier], 'company-1', 'J-12345678-9', 10
  ), [{ creditNoteId: 'nc-1', amountUsd: 10, bookValueBs: 900 }]);
});

test('preserva seis decimales USD al distribuir un anticipo de Bs. 106.48 a tasa 100', () => {
  const allocations = allocateSupplierAdvanceCreditNotes(
    [{ id: 'nc-precise', amountUsd: 1.0648, bookValueBs: 106.48 }],
    [], 'company-1', 'J-12345678-9', 1.0648
  );
  assert.deepEqual(allocations, [
    { creditNoteId: 'nc-precise', amountUsd: 1.0648, bookValueBs: 106.48 }
  ]);
  assert.equal(validateSupplierAdvanceCreditNoteAllocations(allocations, ['nc-precise'], 1.0648, 106.48), null);
});
