import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasConsistentFiscalDocumentAmounts } from './fiscalDocumentAmounts';

const baseDocument = {
  totalAmountBs: 116,
  taxableBaseBs: 100,
  exemptAmountBs: 0,
  vatAmountBs: 16,
  totalAmountUsd: 2,
  taxableBaseUsd: 100 / 58,
  vatAmountUsd: 16 / 58,
  bcvRate: 58
};

test('valida factura sin IGTF en ambas monedas', () => {
  assert.equal(hasConsistentFiscalDocumentAmounts(baseDocument), true);
});

test('incluye IGTF en el total sin sumarlo a la base ni al IVA', () => {
  const document = {
    ...baseDocument,
    totalAmountBs: 119.48,
    totalAmountUsd: 119.48 / 58,
    igtfAmountBs: 3.48,
    igtfAmountUsd: 3.48 / 58
  };
  assert.equal(hasConsistentFiscalDocumentAmounts(document), true);
});

test('rechaza importes USD que no correspondan a la tasa BCV registrada', () => {
  assert.equal(hasConsistentFiscalDocumentAmounts({
    ...baseDocument,
    totalAmountUsd: 2.5
  }), false);
});

test('rechaza IGTF omitido del total o mal convertido a USD', () => {
  assert.equal(hasConsistentFiscalDocumentAmounts({
    ...baseDocument,
    totalAmountBs: 119.48,
    totalAmountUsd: 119.48 / 58,
    igtfAmountBs: 3.48,
    igtfAmountUsd: 0
  }), false);
});

test('rechaza tasa, importes negativos y valores no finitos', () => {
  assert.equal(hasConsistentFiscalDocumentAmounts({ ...baseDocument, bcvRate: 0 }), false);
  assert.equal(hasConsistentFiscalDocumentAmounts({ ...baseDocument, totalAmountBs: -1 }), false);
  assert.equal(hasConsistentFiscalDocumentAmounts({ ...baseDocument, taxableBaseUsd: Number.NaN }), false);
});
