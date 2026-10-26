import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateWeightedAverageCost,
  calculateFifoIssue,
  validateInventoryMovement,
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
