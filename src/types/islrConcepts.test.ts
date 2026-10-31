import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ISLR_CONCEPTS,
  VALOR_UNIDAD_TRIBUTARIA_BS,
  ISLR_FORMULA_FACTOR,
  calculateIslrRetention
} from '../data/islrConcepts';

const concept = (code: string) => {
  const found = ISLR_CONCEPTS.find(item => item.code === code);
  assert.ok(found, `missing concept ${code}`);
  return found;
};

test('catalogue exposes only verified fixed-rate codes and has no duplicate identifiers', () => {
  const codes = ISLR_CONCEPTS.map(item => item.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.deepEqual(codes, ['002', '003', '004', '010', '011', '012', '013']);
  assert.equal(VALOR_UNIDAD_TRIBUTARIA_BS, 43);
  assert.equal(ISLR_FORMULA_FACTOR, 83.3334);
});

test('code 002 applies the legal 3% formula and UT 43 sustraendo', () => {
  const result = calculateIslrRetention(10000, concept('002'));
  assert.equal(result.rate, 3);
  assert.equal(result.subtrahendBs, 107.5);
  assert.equal(result.withheldAmountBs, 192.5);
});

test('code 002 does not withhold when the payment base does not exceed 83.3334 UT', () => {
  const result = calculateIslrRetention(3583.34, concept('002'));
  assert.equal(result.withheldAmountBs, 0);
});

test('code 003 applies 34% to 90% of the non-resident professional fee', () => {
  const result = calculateIslrRetention(10000, concept('003'));
  assert.equal(result.subtrahendBs, 0);
  assert.equal(result.withheldAmountBs, 3060);
});

test('code 004 applies 5% to the full base for a domiciled legal entity', () => {
  const result = calculateIslrRetention(10000, concept('004'));
  assert.equal(result.withheldAmountBs, 500);
});

test('codes 010 and 012 apply the resident-natural-person sustraendo', () => {
  for (const code of ['010', '012']) {
    const result = calculateIslrRetention(10000, concept(code));
    assert.equal(result.subtrahendBs, 107.5);
    assert.equal(result.withheldAmountBs, 192.5);
  }
});

test('codes 011 and 013 apply the non-resident 34% rate over 90% base', () => {
  for (const code of ['011', '013']) {
    const result = calculateIslrRetention(10000, concept(code));
    assert.equal(result.withheldAmountBs, 3060);
  }
});

test('rejects invalid bases and malformed concept parameters', () => {
  assert.throws(() => calculateIslrRetention(Number.NaN, concept('002')), /base de cálculo/);
  assert.throws(() => calculateIslrRetention(-1, concept('002')), /base de cálculo/);
  assert.throws(() => calculateIslrRetention(100, { ...concept('002'), basePercentage: 101 }), /parámetros/);
});


test('monthly ISLR accumulation applies the sustraendo only once across invoices', async () => {
  const { calculateMonthlyIslrRetention } = await import('../data/islrConcepts');
  const first = calculateMonthlyIslrRetention(10000, [], concept('002'));
  assert.deepEqual(first, { rate: 3, subtrahendBs: 107.5, withheldAmountBs: 192.5 });
  const second = calculateMonthlyIslrRetention(10000, [
    { baseAmountBs: 10000, subtrahendBs: first.subtrahendBs, withheldAmountBs: first.withheldAmountBs }
  ], concept('002'));
  assert.deepEqual(second, { rate: 3, subtrahendBs: 0, withheldAmountBs: 300 });
});

test('monthly ISLR accumulation carries the threshold across invoices without repeating the sustraendo', async () => {
  const { calculateMonthlyIslrRetention } = await import('../data/islrConcepts');
  const first = calculateMonthlyIslrRetention(2000, [], concept('002'));
  assert.deepEqual(first, { rate: 3, subtrahendBs: 107.5, withheldAmountBs: 0 });
  const second = calculateMonthlyIslrRetention(2000, [
    { baseAmountBs: 2000, subtrahendBs: first.subtrahendBs, withheldAmountBs: first.withheldAmountBs }
  ], concept('002'));
  assert.deepEqual(second, { rate: 3, subtrahendBs: 0, withheldAmountBs: 12.5 });
});

test('monthly ISLR accumulation rejects historical withholding that exceeds the cumulative calculation', async () => {
  const { calculateMonthlyIslrRetention } = await import('../data/islrConcepts');
  assert.throws(() => calculateMonthlyIslrRetention(100, [
    { baseAmountBs: 100, withheldAmountBs: 99, subtrahendBs: 107.5 }
  ], concept('002')), /no concilia/i);
});
