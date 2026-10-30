import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateWeightedAverageCost,
  calculateFifoIssue,
  validateInventoryMovement,
  normalizeProductionRecipe,
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

  it('capitalizes landed costs into the weighted average', () => {
    const result = calculateWeightedAverageCost(10, 100, 5, 180, 80);
    assert.ok(Math.abs(result.unitCostBs - (1900 / 15)) < 1e-8);
    assert.equal(result.totalCostBs, 1900);
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
