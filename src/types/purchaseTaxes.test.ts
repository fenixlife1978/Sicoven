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
