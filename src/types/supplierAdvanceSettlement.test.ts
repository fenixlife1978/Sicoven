import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSupplierAdvanceSettlementDraft } from './supplierAdvanceSettlement';

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
