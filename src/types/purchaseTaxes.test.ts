import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePurchaseIgtf } from './purchaseTaxes';

test('calcula el 3% cuando se confirma una operación elegible', () => {
  assert.deepEqual(calculatePurchaseIgtf(1000, 'ZELLE', true), { applicable: true, rate: 3, amountBs: 30 });
});
test('no aplica IGTF automáticamente solo por seleccionar medio extranjero', () => {
  assert.deepEqual(calculatePurchaseIgtf(1000, 'INTERNATIONAL_TRANSFER', false), { applicable: false, rate: 0, amountBs: 0 });
});
test('no aplica IGTF a medios nacionales ni a bases inválidas', () => {
  assert.equal(calculatePurchaseIgtf(1000, 'BS', true).amountBs, 0);
  assert.equal(calculatePurchaseIgtf(0, 'CRYPTO', true).amountBs, 0);
  assert.equal(calculatePurchaseIgtf(-1, 'FOREIGN_CASH', true).amountBs, 0);
});
test('redondea a dos decimales y valida la tasa', () => {
  assert.equal(calculatePurchaseIgtf(123.45, 'FOREIGN_CASH', true).amountBs, 3.7);
  assert.equal(calculatePurchaseIgtf(100, 'ZELLE', true, 0).amountBs, 0);
});

test('acepta únicamente medios no nacionales con confirmación explícita', () => {
  for (const method of ['FOREIGN_CASH', 'ZELLE', 'INTERNATIONAL_TRANSFER', 'CRYPTO'] as const) {
    assert.equal(calculatePurchaseIgtf(100, method, true).amountBs, 3);
    assert.equal(calculatePurchaseIgtf(100, method, false).amountBs, 0);
  }
  assert.equal(calculatePurchaseIgtf(100, 'BS', true).applicable, false);
});

test('redondea el IGTF al céntimo y rechaza importes o tasas no finitos', () => {
  assert.equal(calculatePurchaseIgtf(123.45, 'ZELLE', true).amountBs, 3.70);
  assert.equal(calculatePurchaseIgtf(100, 'ZELLE', true, Number.NaN).amountBs, 0);
  assert.equal(calculatePurchaseIgtf(100, 'ZELLE', true, Number.POSITIVE_INFINITY).amountBs, 0);
  assert.equal(calculatePurchaseIgtf(Number.NaN, 'ZELLE', true).amountBs, 0);
  assert.equal(calculatePurchaseIgtf(Number.POSITIVE_INFINITY, 'ZELLE', true).amountBs, 0);
});

test('no anticipa IGTF en una factura a crédito aunque se confirme un medio extranjero', () => {
  for (const method of ['FOREIGN_CASH', 'ZELLE', 'INTERNATIONAL_TRANSFER', 'CRYPTO'] as const) {
    assert.deepEqual(calculatePurchaseIgtf(1000, method, true, 3, 'CREDITO'), { applicable: false, rate: 0, amountBs: 0 });
  }
});
