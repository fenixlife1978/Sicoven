import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSaleSettlementMode } from './saleSettlement';

test('bloquea ventas de contado mientras no exista conciliación con caja/banco', () => {
  assert.match(validateSaleSettlementMode('CONTADO') || '', /cuenta de caja\/banco/);
});

test('permite ventas a crédito para su circuito de CxC', () => {
  assert.equal(validateSaleSettlementMode('CREDITO'), null);
});

test('mantiene compatibilidad con registros históricos sin condición explícita', () => {
  assert.equal(validateSaleSettlementMode(undefined), null);
});
