import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateSupplierCredit } from './supplierCreditAllocation';

test('aplica una nota de crédito al saldo de CxP sin crear anticipo', () => {
  const result = allocateSupplierCredit(40, 4000, 60, 100);
  assert.equal(result.appliedToPayableUsd, 40);
  assert.equal(result.appliedToPayableBs, 4000);
  assert.equal(result.supplierAdvanceUsd, 0);
  assert.equal(result.supplierAdvanceBs, 0);
});

test('separa el excedente de la nota como anticipo a favor del comprador', () => {
  const result = allocateSupplierCredit(80, 8000, 50, 100);
  assert.equal(result.appliedToPayableUsd, 50);
  assert.equal(result.appliedToPayableBs, 5000);
  assert.equal(result.supplierAdvanceUsd, 30);
  assert.equal(result.supplierAdvanceBs, 3000);
});

test('rechaza importes o tasas inválidos', () => {
  assert.throws(() => allocateSupplierCredit(-1, 100, 50, 100), /importes, saldo o tasa inválidos/);
  assert.throws(() => allocateSupplierCredit(10, 1000, 5, 0), /importes, saldo o tasa inválidos/);
  assert.throws(() => allocateSupplierCredit(10, 900, 5, 100), /no concilia entre Bs. y USD/);
});
