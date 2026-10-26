import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidIsoDate, importNumber, validateOpeningInventoryRow, validateMovementImportRow } from './inventoryImport';

describe('validación de importaciones de inventario', () => {
  it('valida fechas reales y rechaza formatos ambiguos', () => {
    assert.equal(isValidIsoDate('2024-02-29'), true);
    assert.equal(isValidIsoDate('2026-02-29'), false);
    assert.equal(isValidIsoDate('25/10/2026'), false);
  });
  it('rechaza NaN, infinito y valores negativos', () => {
    assert.throws(() => importNumber({ qty: 'abc' }, 'qty', 'Cantidad'), /número válido/);
    assert.throws(() => importNumber({ qty: '-1' }, 'qty', 'Cantidad'), /negativo/);
    assert.throws(() => importNumber({ qty: 'Infinity' }, 'qty', 'Cantidad'), /número válido/);
  });
  it('requiere una tasa BCV positiva y fecha válida en inventario inicial', () => {
    const base = { code: 'A1', name: 'Artículo', currentstock: '2', avgcostbs: '10', openingdate: '2026-10-25', openingbcvrate: '100' };
    assert.equal(validateOpeningInventoryRow(base, 2, 100).currentStock, 2);
    assert.throws(() => validateOpeningInventoryRow({ ...base, openingbcvrate: '0' }, 2, 100), /mayor que cero/);
    assert.throws(() => validateOpeningInventoryRow({ ...base, openingdate: '2026-02-30' }, 2, 100), /fecha real/);
    assert.throws(() => validateOpeningInventoryRow({ ...base, currentstock: '-2' }, 2, 100), /negativo/);
    assert.throws(() => validateOpeningInventoryRow({ ...base, avgcostbs: '0' }, 2, 100), /mayor que cero cuando hay existencias/);
    assert.throws(() => validateOpeningInventoryRow({ ...base, costingmethod: 'OTRO' }, 2, 100), /costingMethod inválido/);
  });
  it('valida campos y cantidades de movimientos antes de importarlos', () => {
    const base = { date: '2026-10-25', type: 'ENTRADA', concept: 'COMPRA', productcode: 'A1', quantity: '2', unitcostbs: '10', bcvrate: '100', documentref: 'FAC-1' };
    assert.equal(validateMovementImportRow(base, 2).quantity, 2);
    assert.throws(() => validateMovementImportRow({ ...base, quantity: '0' }, 2), /mayor que cero/);
    assert.throws(() => validateMovementImportRow({ ...base, date: '2026-02-30' }, 2), /fecha real/);
    assert.throws(() => validateMovementImportRow({ ...base, bcvrate: '0' }, 2), /mayor que cero/);
    assert.throws(() => validateMovementImportRow({ ...base, documentref: '' }, 2), /documentRef es obligatorio/);
    assert.throws(() => validateMovementImportRow({ ...base, type: 'AJUSTE' }, 2), /balanceQty: valor obligatorio/);
    assert.equal(validateMovementImportRow({ ...base, type: 'AJUSTE', balanceqty: '0' }, 2).balanceQty, 0);
  });
});
