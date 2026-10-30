import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateWeightedAverageCost,
  calculateWeightedAverageCostDual,
  calculateFifoIssue,
  reconstructFifoLayers,
  validateInventoryMovement,
  normalizeProductionRecipe,
  getDefaultInventoryAccountCode,
  calculateVnrWriteDown,
  calculatePeriodicCostOfSales
} from './inventoryAccounting';

describe('motor de inventario contable', () => {
  it('recalcula el costo promedio ponderado sin perder el costo previo', () => {
    const result = calculateWeightedAverageCost(10, 100, 5, 160, 80);
    assert.equal(result.quantity, 15);
    assert.equal(result.totalCostBs, 1800);
    assert.equal(result.unitCostBs, 120);
    assert.equal(result.unitCostUsd, 1.5);
  });

  it('preserves historical USD cost when the BCV rate changes', () => {
    const result = calculateWeightedAverageCostDual(10, 100, 2, 5, 160, 2.5);
    assert.equal(result.quantity, 15);
    assert.equal(result.totalCostBs, 1800);
    assert.equal(result.totalCostUsd, 32.5);
    assert.equal(result.unitCostBs, 120);
    assert.equal(result.unitCostUsd, 32.5 / 15);
  });

  it('capitalizes landed costs into the weighted average', () => {
    const result = calculateWeightedAverageCost(10, 100, 5, 180, 80);
    assert.ok(Math.abs(result.unitCostBs - (1900 / 15)) < 1e-8);
    assert.equal(result.totalCostBs, 1900);
  });

  it('reconstruye capas PEPS desde el Kardex y valida la existencia actual', () => {
    const layers = reconstructFifoLayers([
      { type: 'ENTRADA', quantity: 5, unitCostBs: 10, unitCostUsd: 1, date: '2026-01-01', balanceQty: 5 },
      { type: 'ENTRADA', quantity: 3, unitCostBs: 20, unitCostUsd: 2, date: '2026-01-02', balanceQty: 8 },
      { type: 'SALIDA', quantity: 2, unitCostBs: 10, unitCostUsd: 1, date: '2026-01-03', balanceQty: 6 }
    ], 6);
    assert.deepEqual(layers.map(layer => layer.quantity), [3, 3]);
    assert.equal(layers[0].unitCostBs, 10);
    assert.equal(layers[1].unitCostBs, 20);
  });

  it('descarga una devolución a proveedor de su capa PEPS original y no de la capa más antigua', () => {
    const layers = reconstructFifoLayers([
      { id: 'purchase-old', type: 'ENTRADA', quantity: 5, unitCostBs: 10, unitCostUsd: 1, date: '2026-01-01', documentRef: 'FAC-OLD', balanceQty: 5 },
      { id: 'purchase-target', type: 'ENTRADA', quantity: 3, unitCostBs: 20, unitCostUsd: 2, date: '2026-01-02', documentRef: 'FAC-TARGET', balanceQty: 8 },
      { id: 'supplier-return', type: 'SALIDA', concept: 'DEVOLUCION_COMPRA', correctionForMovementId: 'purchase-target',
        quantity: 1, unitCostBs: 20, unitCostUsd: 2, date: '2026-01-03', documentRef: 'NC-PROV-1', balanceQty: 7 }
    ], 7);
    assert.equal(layers.find(layer => layer.sourceMovementId === 'purchase-old')?.quantity, 5);
    assert.equal(layers.find(layer => layer.sourceMovementId === 'purchase-target')?.quantity, 2);
  });

  it('bloquea devoluciones PEPS históricas sin vínculo a la entrada original', () => {
    assert.throws(() => reconstructFifoLayers([
      { id: 'purchase-1', type: 'ENTRADA', quantity: 2, unitCostBs: 10, unitCostUsd: 1, date: '2026-01-01', documentRef: 'FAC-1', balanceQty: 2 },
      { id: 'return-1', type: 'SALIDA', concept: 'DEVOLUCION_COMPRA', quantity: 1, unitCostBs: 10, unitCostUsd: 1, date: '2026-01-02', documentRef: 'NC-1', balanceQty: 1 }
    ], 1), /no identifica la entrada original/);
  });

  it('bloquea PEPS si faltan capas de apertura o un movimiento excede las capas existentes', () => {
    assert.throws(() => reconstructFifoLayers([
      { type: 'ENTRADA', quantity: 2, unitCostBs: 10, unitCostUsd: 1, date: '2026-01-01', balanceQty: 2 }
    ], 3), /no coinciden con la existencia actual/);
    assert.throws(() => reconstructFifoLayers([
      { type: 'SALIDA', quantity: 1, unitCostBs: 10, unitCostUsd: 1, date: '2026-01-01', balanceQty: 0 }
    ], 0), /no contiene capas suficientes/);
  });

  it('bloquea PEPS cuando los saldos históricos no concilian', () => {
    assert.throws(() => reconstructFifoLayers([
      { type: 'ENTRADA', quantity: 2, unitCostBs: 10, unitCostUsd: 1, date: '2026-01-01', balanceQty: 3 }
    ], 3), /saldo de Kardex no concilia/);
  });

  it('PEPS consume primero las capas más antiguas', () => {
    const result = calculateFifoIssue([
      { quantity: 5, unitCostBs: 20, unitCostUsd: 2, date: '2026-02-01' },
      { quantity: 4, unitCostBs: 30, unitCostUsd: 3, date: '2026-01-01' }
    ], 6);
    assert.equal(result.totalCostBs, 160);
    assert.equal(result.totalCostUsd, 16);
    assert.equal(result.unitCostBs, 160 / 6);
  });

  it('rejects PEPS issues when the available layers are insufficient', () => {
    assert.throws(() => calculateFifoIssue([
      { quantity: 2, unitCostBs: 10, unitCostUsd: 1, date: '2026-01-01' }
    ], 3), /Existencia insuficiente/);
  });

  it('preserves six decimal places in the USD valuation of FIFO layers', () => {
    const result = calculateFifoIssue([
      { quantity: 1, unitCostBs: 10, unitCostUsd: 0.123456, date: '2026-01-01' },
      { quantity: 1, unitCostBs: 20, unitCostUsd: 0.234567, date: '2026-01-02' }
    ], 2);
    assert.equal(result.totalCostUsd, 0.358023);
    assert.equal(result.unitCostUsd, 0.1790115);
  });

  it('rejects malformed FIFO layers instead of silently dropping them', () => {
    assert.throws(() => calculateFifoIssue([
      { quantity: 2, unitCostBs: 10, unitCostUsd: 1, date: '2026-01-01' },
      { quantity: 1, unitCostBs: Number.NaN, unitCostUsd: 1, date: '2026-01-02' }
    ], 1), /Una capa PEPS contiene/);
  });

  it('rechaza salidas superiores a la existencia', () => {
    assert.match(validateInventoryMovement({
      date: '2026-10-25', quantity: 3, bcvRate: 100, unitCostBs: 20,
      availableQuantity: 2, type: 'SALIDA'
    }) || '', /Existencia insuficiente/);
  });

  it('rechaza una fecha calendario imposible', () => {
    assert.match(validateInventoryMovement({
      date: '2026-02-30', quantity: 1, bcvRate: 100, unitCostBs: 20,
      availableQuantity: 2, type: 'ENTRADA'
    }) || '', /fecha.*no es válida/i);
  });

  it('asigna la cuenta de inventario por defecto según el tipo de artículo', () => {
    assert.equal(getDefaultInventoryAccountCode('MERCANCIA'), '1.1.4.01');
    assert.equal(getDefaultInventoryAccountCode('MATERIA_PRIMA'), '1.1.4.02');
    assert.equal(getDefaultInventoryAccountCode('PRODUCTO_EN_PROCESO'), '1.1.4.04');
    assert.equal(getDefaultInventoryAccountCode('PRODUCTO_TERMINADO'), '1.1.4.01');
    assert.equal(getDefaultInventoryAccountCode('SUBPRODUCTO'), '1.1.4.01');
    assert.equal(getDefaultInventoryAccountCode(undefined), '1.1.4.01');
  });

  it('consolida componentes repetidos de una matriz de producción', () => {
    assert.deepEqual(normalizeProductionRecipe([
      { productId: 'raw-1', quantityPerUnit: 2 },
      { productId: 'raw-2', quantityPerUnit: 1 },
      { productId: 'raw-1', quantityPerUnit: 3 }
    ], 'finished-1'), [
      { productId: 'raw-1', quantityPerUnit: 5 },
      { productId: 'raw-2', quantityPerUnit: 1 }
    ]);
  });

  it('rechaza componentes de producción inválidos o referencias circulares directas', () => {
    assert.throws(() => normalizeProductionRecipe([{ productId: 'finished-1', quantityPerUnit: 1 }], 'finished-1'), /componentes inválidos/);
    assert.throws(() => normalizeProductionRecipe([{ productId: 'raw-1', quantityPerUnit: Number.NaN }], 'finished-1'), /componentes inválidos/);
    assert.throws(() => normalizeProductionRecipe([{ productId: 'raw-1', quantityPerUnit: 1e309 }], 'finished-1'), /componentes inválidos/);
  });

  it('calcula una provisión cuando el VNR cae por debajo del costo', () => {
    const result = calculateVnrWriteDown({
      quantity: 10, unitCostBs: 100, estimatedSellingPricePerUnitBs: 90,
      completionCostPerUnitBs: 5, sellingCostPerUnitBs: 10
    });
    assert.equal(result.carryingValueBs, 1000);
    assert.equal(result.netRealizableValueBs, 750);
    assert.equal(result.writeDownBs, 250);
    assert.equal(result.required, true);
  });

  it('calcula el costo de ventas periódico', () => {
    assert.equal(calculatePeriodicCostOfSales({
      openingInventoryBs: 10000, purchasesAndLandedCostsBs: 6000, closingInventoryBs: 4000
    }), 12000);
  });

  it('rechaza un cierre cuyo inventario final exceda los recursos disponibles', () => {
    assert.throws(() => calculatePeriodicCostOfSales({
      openingInventoryBs: 1000, purchasesAndLandedCostsBs: 200, closingInventoryBs: 1500
    }), /inventario final supera/i);
  });
});
