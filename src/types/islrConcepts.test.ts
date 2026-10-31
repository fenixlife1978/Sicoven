import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ISLR_CONCEPTS,
  VALOR_UNIDAD_TRIBUTARIA_BS,
  ISLR_FORMULA_FACTOR,
  getIslrUnitTaxValueForPeriod,
  calculateIslrRetention,
  calculateIslrTariff2Ut,
  calculateAnnualIslrTariff2Retention
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

test('monthly ISLR UT uses the value in force at the start of the period', () => {
  assert.equal(getIslrUnitTaxValueForPeriod('2025-06'), 9);
  assert.equal(getIslrUnitTaxValueForPeriod('2025-07'), 43);
  assert.equal(getIslrUnitTaxValueForPeriod('2023-05'), 0.4);
  assert.equal(getIslrUnitTaxValueForPeriod('2023-06'), 9);
  assert.equal(getIslrUnitTaxValueForPeriod('2021-10'), 0.02);
  assert.equal(getIslrUnitTaxValueForPeriod('2021-09'), null);
  assert.equal(getIslrUnitTaxValueForPeriod('invalid'), null);
});

test('ISLR calculation uses the UT snapshot applicable to the period', () => {
  const june = calculateIslrRetention(10000, concept('002'), 9);
  const july = calculateIslrRetention(10000, concept('002'), 43);
  assert.equal(june.subtrahendBs, 22.5);
  assert.equal(july.subtrahendBs, 107.5);
});

test('monthly ISLR accumulation preserves the period UT for every invoice', async () => {
  const { calculateMonthlyIslrRetention } = await import('../data/islrConcepts');
  const first = calculateMonthlyIslrRetention(10000, [], concept('002'), 9);
  assert.deepEqual(first, { rate: 3, subtrahendBs: 22.5, withheldAmountBs: 277.5 });
  const second = calculateMonthlyIslrRetention(10000, [
    { baseAmountBs: 10000, subtrahendBs: first.subtrahendBs, withheldAmountBs: first.withheldAmountBs }
  ], concept('002'), 9);
  assert.deepEqual(second, { rate: 3, subtrahendBs: 0, withheldAmountBs: 300 });
});

test('code 002 applies the legal 3% formula and UT 43 sustraendo', () => {
  const result = calculateIslrRetention(10000, concept('002'));
  assert.equal(result.rate, 3);
  assert.equal(result.subtrahendBs, 107.5);
  assert.equal(result.withheldAmountBs, 192.5);
});

test('code 002 does not withhold when the payment base does not exceed 83.3334 UT', () => {
  const result = calculateIslrRetention(3583.3362, concept('002'));
  assert.equal(result.withheldAmountBs, 0);
  assert.equal(result.subtrahendBs, 0);
});


test('code 002 records the sustraendo only when the base exceeds the exact UT threshold', () => {
  const result = calculateIslrRetention(3583.34, concept('002'));
  assert.equal(result.subtrahendBs, 107.5);
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
  assert.deepEqual(first, { rate: 3, subtrahendBs: 0, withheldAmountBs: 0 });
  const second = calculateMonthlyIslrRetention(2000, [
    { baseAmountBs: 2000, subtrahendBs: first.subtrahendBs, withheldAmountBs: first.withheldAmountBs }
  ], concept('002'));
  assert.deepEqual(second, { rate: 3, subtrahendBs: 107.5, withheldAmountBs: 12.5 });
});

test('monthly ISLR accumulation rejects historical withholding that exceeds the cumulative calculation', async () => {
  const { calculateMonthlyIslrRetention } = await import('../data/islrConcepts');
  assert.throws(() => calculateMonthlyIslrRetention(100, [
    { baseAmountBs: 100, withheldAmountBs: 99, subtrahendBs: 107.5 }
  ], concept('002')), /no coinciden|no concilia/i);
});


test('ISLR T-2 applies the progressive marginal brackets at 2,000 and 3,000 UT', () => {
  assert.equal(calculateIslrTariff2Ut(0), 0);
  assert.equal(calculateIslrTariff2Ut(2000), 300);
  assert.equal(calculateIslrTariff2Ut(2500), 410);
  assert.equal(calculateIslrTariff2Ut(3000), 520);
  assert.equal(calculateIslrTariff2Ut(3500), 690);
});

test('ISLR T-2 is progressive rather than applying one flat rate to the whole base', () => {
  const atBoundary = calculateIslrTariff2Ut(3000);
  const aboveBoundary = calculateIslrTariff2Ut(3001);
  assert.ok(Math.abs((aboveBoundary - atBoundary) - 0.34) < 1e-9);
  assert.throws(() => calculateIslrTariff2Ut(-1), /base anual/);
  assert.throws(() => calculateIslrTariff2Ut(Number.NaN), /base anual/);
});


test('annual T-2 applies 90% base and incremental withholding using operation-date UT snapshots', () => {
  const first = calculateAnnualIslrTariff2Retention(100000, [], '2025-06-10', 9, 90);
  const firstTaxableUt = 90000 / 9;
  assert.equal(first.cumulativeTaxableBaseUt, firstTaxableUt);
  assert.equal(first.cumulativeWithheldBs, Math.round(calculateIslrTariff2Ut(firstTaxableUt) * 9 * 100) / 100);

  const second = calculateAnnualIslrTariff2Retention(50000, [
    { paymentDate: '2025-06-10', baseAmountBs: 100000, withheldAmountBs: first.withheldAmountBs, unitTaxValueBs: 9 }
  ], '2025-06-20', 9, 90);
  assert.equal(second.withheldAmountBs, second.cumulativeWithheldBs - first.withheldAmountBs);
});

test('annual T-2 does not recalculate prior operations using a later UT', () => {
  const first = calculateAnnualIslrTariff2Retention(100000, [], '2025-06-10', 9, 90);
  const nextAtDifferentUt = calculateAnnualIslrTariff2Retention(50000, [
    { paymentDate: '2025-06-10', baseAmountBs: 100000, withheldAmountBs: first.withheldAmountBs, unitTaxValueBs: 9 }
  ], '2025-07-10', 43, 90);
  const expectedCurrentTax = calculateIslrTariff2Ut((150000 * 0.9) / 43) * 43;
  assert.equal(nextAtDifferentUt.cumulativeWithheldBs, Math.round(expectedCurrentTax * 100) / 100);
  assert.equal(nextAtDifferentUt.withheldAmountBs,
    Math.max(0, Math.round((expectedCurrentTax - first.withheldAmountBs) * 100) / 100));
});

test('annual T-2 allows multiple ordered payment events on the same date', () => {
  const first = calculateAnnualIslrTariff2Retention(100000, [], '2025-06-10', 9, 90);
  const second = calculateAnnualIslrTariff2Retention(50000, [
    { paymentDate: '2025-06-10', baseAmountBs: 100000, withheldAmountBs: first.withheldAmountBs, unitTaxValueBs: 9 }
  ], '2025-06-10', 9, 90);
  assert.equal(second.withheldAmountBs, second.cumulativeWithheldBs - first.withheldAmountBs);
});

test('annual T-2 validates each historical withholding against its own date and UT', () => {
  const first = calculateAnnualIslrTariff2Retention(100000, [], '2025-06-10', 9, 90);
  assert.throws(() => calculateAnnualIslrTariff2Retention(1000, [
    { paymentDate: '2025-06-10', baseAmountBs: 100000, withheldAmountBs: first.withheldAmountBs + 1, unitTaxValueBs: 9 }
  ], '2025-07-10', 43, 90), /no concilian/);
});

test('annual T-2 rejects invalid dates, another fiscal year, missing UT snapshots, and invalid percentages', () => {
  assert.throws(() => calculateAnnualIslrTariff2Retention(10000, [], '2025-06-10', 0, 90), /UT vigente/);
  assert.throws(() => calculateAnnualIslrTariff2Retention(10000, [], '2025-02-30', 43, 90), /fecha efectiva/);
  assert.throws(() => calculateAnnualIslrTariff2Retention(10000, [
    { paymentDate: '2024-12-20', baseAmountBs: 10000, withheldAmountBs: 0, unitTaxValueBs: 43 }
  ], '2025-01-10', 43, 90), /mismo ejercicio/);
  assert.throws(() => calculateAnnualIslrTariff2Retention(10000, [
    { paymentDate: '2025-06-10', baseAmountBs: 10000, withheldAmountBs: 0, unitTaxValueBs: 0 }
  ], '2025-07-10', 43, 90), /snapshot de UT/);
  assert.throws(() => calculateAnnualIslrTariff2Retention(10000, [], '2025-07-10', 43, 101), /porcentaje/);
});
