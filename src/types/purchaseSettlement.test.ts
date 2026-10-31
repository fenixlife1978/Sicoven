import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePurchaseSettlementMode, validatePurchasePaymentDate } from './purchaseSettlement';

test('bloquea contado mientras no exista conciliación con caja/banco', () => {
  assert.match(validatePurchaseSettlementMode('CONTADO') || '', /cuenta de caja\/banco/);
});

test('permite crédito para su circuito de CxP', () => {
  assert.equal(validatePurchaseSettlementMode('CREDITO'), null);
});

test('mantiene compatibilidad con registros históricos sin condición explícita', () => {
  assert.equal(validatePurchaseSettlementMode(undefined), null);
});


test('blocks a supplier payable settlement dated before account-credit recognition', () => {
  assert.match(validatePurchasePaymentDate('2026-10-09', '2026-10-10') || '', /anticipo a proveedor/);
});

test('allows supplier payable settlements on or after account-credit recognition', () => {
  assert.equal(validatePurchasePaymentDate('2026-10-10', '2026-10-10'), null);
  assert.equal(validatePurchasePaymentDate('2026-10-11', '2026-10-10'), null);
});

test('rejects malformed dates for supplier payable settlement chronology', () => {
  assert.match(validatePurchasePaymentDate('2026-02-30', '2026-02-28') || '', /fecha.*no es válida/);
});
