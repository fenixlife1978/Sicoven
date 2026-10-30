import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePurchaseSettlementMode } from './purchaseSettlement';

test('bloquea contado mientras no exista conciliación con caja/banco', () => {
  assert.match(validatePurchaseSettlementMode('CONTADO') || '', /cuenta de caja\/banco/);
});

test('permite crédito para su circuito de CxP', () => {
  assert.equal(validatePurchaseSettlementMode('CREDITO'), null);
});

test('mantiene compatibilidad con registros históricos sin condición explícita', () => {
  assert.equal(validatePurchaseSettlementMode(undefined), null);
});
