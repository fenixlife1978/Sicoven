import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getValidBcvRate } from './saleBcvRate';

test('acepta únicamente tasas BCV numéricas, finitas y mayores que cero', () => {
  assert.equal(getValidBcvRate(874.7321), 874.7321);
  assert.equal(getValidBcvRate('874.7321'), 874.7321);
  assert.equal(getValidBcvRate(0), null);
  assert.equal(getValidBcvRate(-1), null);
  assert.equal(getValidBcvRate(Number.NaN), null);
  assert.equal(getValidBcvRate(Number.POSITIVE_INFINITY), null);
  assert.equal(getValidBcvRate(undefined), null);
  assert.equal(getValidBcvRate(null), null);
  assert.equal(getValidBcvRate(''), null);
});
