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

test('usa el valor histórico exacto de la distribución FIFO cuando las notas tienen tasas distintas', () => {
  // 10 USD de la primera nota (800 Bs) + 2 USD de la segunda (200 Bs).
  // El valor correcto consumido es 1.000 Bs, no el promedio global (1.104 Bs).
  const fifoBookValueBs = 800 + 200;
  const result = calculateSupplierAdvanceFxSettlement(12, fifoBookValueBs, 12, 1200);
  assert.deepEqual(result, {
    amountUsd: 12,
    advanceBookValueBs: 1000,
    settlementValueBs: 1200,
    exchangeDifferenceBs: 200
  });
});

test('preserves six-decimal USD amounts such as Bs. 106.48 at a BCV rate of 100', () => {
  assert.deepEqual(calculateSupplierAdvanceFxSettlement(1.0648, 106.48, 1.0648, 106.48), {
    amountUsd: 1.0648, advanceBookValueBs: 106.48,
    settlementValueBs: 106.48, exchangeDifferenceBs: 0
  });
});
