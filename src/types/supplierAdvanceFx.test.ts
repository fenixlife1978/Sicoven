import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSupplierAdvanceFxSettlement } from './supplierAdvanceFx';

test('calcula valor histórico proporcional y ganancia cambiaria en reembolso', () => {
  assert.deepEqual(calculateSupplierAdvanceFxSettlement(100, 3600, 25, 1000), {
    amountUsd: 25, advanceBookValueBs: 900, settlementValueBs: 1000, exchangeDifferenceBs: 100
  });
});

test('calcula pérdida cambiaria cuando el reembolso vale menos que el anticipo histórico', () => {
  assert.equal(calculateSupplierAdvanceFxSettlement(100, 3600, 25, 800).exchangeDifferenceBs, -100);
});

test('redondea el valor histórico proporcional a céntimos', () => {
  assert.equal(calculateSupplierAdvanceFxSettlement(3, 100, 1, 40).advanceBookValueBs, 33.33);
});

test('rechaza una liquidación superior al saldo disponible', () => {
  assert.throws(() => calculateSupplierAdvanceFxSettlement(10, 500, 11, 550), /supera el saldo/);
});
