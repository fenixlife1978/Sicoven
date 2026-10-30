import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSupplierAdvanceBalance, validateSupplierAdvanceSettlement } from './supplierAdvance';
import type { PurchaseRecord } from './accounting';

const note = (overrides: Partial<PurchaseRecord> = {}): PurchaseRecord => ({
  id: 'nc-1', companyId: 'company-1', opNumber: 1, invoiceDate: '2026-10-30',
  supplierRif: 'J-12345678-9', supplierName: 'Proveedor A', invoiceNumber: 'NC-1',
  controlNumber: '00-1', documentType: '03', totalAmountBs: 0, exemptAmountBs: 0,
  taxableBaseBs: 0, taxRate: 0, vatAmountBs: 0, retentionRate: 0, vatWithheldBs: 0,
  islrRate: 0, islrWithheldBs: 0, bcvRate: 100, totalAmountUsd: 0,
  taxableBaseUsd: 0, vatAmountUsd: 0, vatWithheldUsd: 0, islrWithheldUsd: 0,
  igtfApplicable: false, igtfRate: 0, igtfAmountBs: 0, igtfAmountUsd: 0,
  paymentTerm: 'CREDITO', paymentMethod: 'BS', journalEntryId: 'entry-1',
  originalPurchaseId: 'purchase-1', supplierAdvanceBs: 3000, supplierAdvanceUsd: 30,
  ...overrides
});

test('calcula el saldo por RIF y excluye notas reversadas', () => {
  const balance = calculateSupplierAdvanceBalance('j-12345678-9', [
    note(), note({ id: 'nc-2', supplierAdvanceBs: 2000, supplierAdvanceUsd: 20 }),
    note({ id: 'nc-3', isCancelled: true, supplierAdvanceBs: 9000, supplierAdvanceUsd: 90 }),
    note({ id: 'nc-4', supplierRif: 'J-99999999-9', supplierAdvanceBs: 7000, supplierAdvanceUsd: 70 })
  ]);
  assert.equal(balance.totalCreditBs, 5000);
  assert.equal(balance.totalCreditUsd, 50);
  assert.equal(balance.creditNoteCount, 2);
});

test('impide liquidar por encima del saldo disponible', () => {
  assert.match(validateSupplierAdvanceSettlement(30, 31, 'J-12345678-9') || '', /supera el saldo/);
});

test('impide aplicar el saldo a otro proveedor', () => {
  assert.match(validateSupplierAdvanceSettlement(30, 10, 'J-12345678-9', 'J-99999999-9') || '', /mismo proveedor/);
});

test('permite una liquidación parcial válida', () => {
  assert.equal(validateSupplierAdvanceSettlement(30, 10, 'J-12345678-9', 'J-12345678-9'), null);
});
