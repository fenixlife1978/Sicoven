import test from 'node:test';
import assert from 'node:assert/strict';
import type { InventoryMovement, InventoryProduct, PurchaseRecord } from './accounting';
import { calculatePurchaseCreditNote, type PurchaseCreditNoteDraftLine } from './purchaseCreditNote';

const purchase: PurchaseRecord = {
  id: 'pur-1', companyId: 'co-1', opNumber: 1, invoiceDate: '2026-10-01',
  supplierRif: 'J-12345678-9', supplierName: 'Proveedor', invoiceNumber: '100',
  controlNumber: '00-100', documentType: '01', totalAmountBs: 238.96,
  exemptAmountBs: 0, taxableBaseBs: 200, taxRate: 16, vatAmountBs: 32,
  retentionRate: 75, vatWithheldBs: 24, islrWithheldBs: 2,
  bcvRate: 100, totalAmountUsd: 2.3896, taxableBaseUsd: 2,
  vatAmountUsd: 0.32, vatWithheldUsd: 0.24, islrWithheldUsd: 0.02,
  paymentTerm: 'CREDITO', inventoryLines: [{ productId: 'p-1', quantity: 2, unitCostBs: 100 }]
};
const product: InventoryProduct = {
  id: 'p-1', companyId: 'co-1', code: 'P-1', name: 'Producto',
  category: 'Mercancía', unit: 'UND', minStock: 0, currentStock: 2,
  salesPriceBs: 150, salesPriceUsd: 1.5, avgCostBs: 100, avgCostUsd: 1,
  lastCostBs: 100, lastCostUsd: 1, vatTreatment: 'GENERAL_16',
  costingMethod: 'PROMEDIO_PONDERADO'
};
const originalMovement: InventoryMovement = {
  id: 'mov-1', companyId: 'co-1', productId: 'p-1', productName: 'Producto',
  productCode: 'P-1', date: '2026-10-01', type: 'ENTRADA', concept: 'COMPRA',
  documentRef: 'FAC-100', quantity: 2, unitCostBs: 100, unitCostUsd: 1,
  totalCostBs: 200, totalCostUsd: 2, balanceQty: 2, balanceTotalBs: 200,
  balanceTotalUsd: 2, bcvRate: 100, counterpartyRif: 'J-12345678-9'
};
const draft = (options: {
  quantity?: number; previouslyReturnedQuantity?: number; currentStock?: number;
  currentAverageCostBs?: number; product?: InventoryProduct; closedThroughDate?: string;
  purchase?: PurchaseRecord; lines?: PurchaseCreditNoteDraftLine[];
} = {}) => ({
  purchase: options.purchase || purchase, products: [options.product || product],
  lines: options.lines || [{
    product: options.product || product, originalMovement,
    quantity: options.quantity ?? 1, previouslyReturnedQuantity: options.previouslyReturnedQuantity ?? 0,
    currentStock: options.currentStock ?? 2, currentAverageCostBs: options.currentAverageCostBs ?? 100
  }],
  returnDate: '2026-10-10', creditNoteNumber: 'NC-001',
  controlNumber: '00-NC-001', reason: 'Mercancía defectuosa devuelta',
  closedThroughDate: options.closedThroughDate
});

test('calcula nota de crédito parcial y revierte proporcionalmente IVA, retenciones e IGTF', () => {
  const result = calculatePurchaseCreditNote(draft());
  assert.equal(result.inventoryCostBs, 100);
  assert.equal(result.taxableBaseBs, 100);
  assert.equal(result.vatAmountBs, 16);
  assert.equal(result.vatWithheldBs, 12);
  assert.equal(result.islrWithheldBs, 1);
  assert.equal(result.igtfAmountBs, 3.48);
  assert.equal(result.totalAmountBs, 119.48);
  assert.equal(result.netPayableReductionBs, 106.48);
  assert.equal(result.netPayableReductionUsd, 1.0648);
  assert.equal(result.lines.length, 1);
});

test('calcula una nota con varias líneas de artículos y suma sus bases fiscales', () => {
  const secondProduct = { ...product, id: 'p-2', code: 'P-2', name: 'Producto 2' };
  const secondMovement = { ...originalMovement, id: 'mov-2', productId: 'p-2', productCode: 'P-2', productName: 'Producto 2' };
  const multiPurchase = { ...purchase, inventoryLines: [
    { productId: 'p-1', quantity: 2, unitCostBs: 100 },
    { productId: 'p-2', quantity: 2, unitCostBs: 100 }
  ], taxableBaseBs: 400, vatAmountBs: 64, totalAmountBs: 477.92,
  totalAmountUsd: 4.7792, taxableBaseUsd: 4, vatAmountUsd: 0.64, vatWithheldBs: 48, vatWithheldUsd: 0.48,
  islrWithheldBs: 4, islrWithheldUsd: 0.04, igtfAmountBs: 13.92, igtfAmountUsd: 0.1392 };
  const result = calculatePurchaseCreditNote({
    ...draft({ purchase: multiPurchase }),
    products: [product, secondProduct],
    lines: [
      { product, originalMovement, quantity: 1, previouslyReturnedQuantity: 0, currentStock: 2, currentAverageCostBs: 100 },
      { product: secondProduct, originalMovement: secondMovement, quantity: 1, previouslyReturnedQuantity: 0, currentStock: 2, currentAverageCostBs: 100 }
    ]
  });
  assert.equal(result.lines.length, 2);
  assert.equal(result.inventoryCostBs, 200);
  assert.equal(result.vatAmountBs, 32);
  assert.equal(result.netPayableReductionBs, 212.96);
});

test('bloquea devolución superior a existencia o cantidad original disponible', () => {
  assert.throws(() => calculatePurchaseCreditNote(draft({ currentStock: 0.5 })), /existencia actual/);
  assert.throws(() => calculatePurchaseCreditNote(draft({ previouslyReturnedQuantity: 1.5 })), /supera la cantidad facturada/);
});

test('bloquea PEPS, costo promedio divergente y fecha en período cerrado', () => {
  assert.throws(() => calculatePurchaseCreditNote(draft({
    product: { ...product, costingMethod: 'PEPS' }
  })), /PEPS requiere/);
  assert.throws(() => calculatePurchaseCreditNote(draft({ currentAverageCostBs: 95 })), /costo promedio actual difiere/);
  assert.throws(() => calculatePurchaseCreditNote(draft({ closedThroughDate: '2026-10-10' })), /período contable cerrado/);
});

test('bloquea si el tratamiento fiscal de las líneas no concilia con la factura', () => {
  assert.throws(() => calculatePurchaseCreditNote(draft({
    purchase: { ...purchase, exemptAmountBs: 20, taxableBaseBs: 180 }
  })), /clasificación fiscal/);
});
