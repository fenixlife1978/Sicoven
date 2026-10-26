export type InventoryCostingMethod = 'PROMEDIO_PONDERADO' | 'PEPS';
export type InventoryVatTreatment = 'GENERAL_16' | 'REDUCIDA_8' | 'EXENTO' | 'EXONERADO';
export type InventoryItemType = 'MERCANCIA' | 'MATERIA_PRIMA' | 'PRODUCTO_EN_PROCESO' | 'PRODUCTO_TERMINADO' | 'SUBPRODUCTO';

export interface CostLayer {
  quantity: number;
  unitCostBs: number;
  unitCostUsd: number;
  date?: string;
  documentRef?: string;
}

export interface InventoryCostResult {
  quantity: number;
  totalCostBs: number;
  totalCostUsd: number;
  unitCostBs: number;
  unitCostUsd: number;
}

const cents = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const usdPrecision = (value: number): number => Math.round((value + Number.EPSILON) * 1000000) / 1000000;
const validPositive = (value: number): boolean => Number.isFinite(value) && value > 0;
const validNonNegative = (value: number): boolean => Number.isFinite(value) && value >= 0;

/** Recalcula costo promedio ponderado, sin redondear cantidades intermedias. */
export function calculateWeightedAverageCost(
  existingQuantity: number,
  existingUnitCostBs: number,
  incomingQuantity: number,
  incomingUnitCostBs: number,
  exchangeRate: number
): InventoryCostResult {
  if (!validNonNegative(existingQuantity) || !validNonNegative(existingUnitCostBs) ||
      !validPositive(incomingQuantity) || !validNonNegative(incomingUnitCostBs) ||
      !validPositive(exchangeRate)) {
    throw new Error('Cantidades, costos o tasa BCV inválidos para recalcular el costo promedio.');
  }
  const quantity = existingQuantity + incomingQuantity;
  const totalCostBs = cents(existingQuantity * existingUnitCostBs + incomingQuantity * incomingUnitCostBs);
  const unitCostBs = quantity > 0 ? totalCostBs / quantity : 0;
  const unitCostUsd = unitCostBs / exchangeRate;
  return {
    quantity,
    totalCostBs,
    totalCostUsd: usdPrecision(totalCostBs / exchangeRate),
    unitCostBs,
    unitCostUsd
  };
}

/** Calcula una salida PEPS consumiendo las capas más antiguas primero. */
export function calculateFifoIssue(layersInput: CostLayer[], quantityToIssue: number): InventoryCostResult {
  if (!validPositive(quantityToIssue)) throw new Error('La cantidad de salida debe ser mayor que cero.');
  const layers = layersInput
    .map(layer => ({ ...layer }))
    .filter(layer => validPositive(layer.quantity) && validNonNegative(layer.unitCostBs) && validNonNegative(layer.unitCostUsd))
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.documentRef || '').localeCompare(b.documentRef || ''));
  const available = layers.reduce((sum, layer) => sum + layer.quantity, 0);
  if (quantityToIssue - available > 1e-8) {
    throw new Error(`Existencia insuficiente para PEPS: disponibles ${available}, solicitadas ${quantityToIssue}.`);
  }
  let remaining = quantityToIssue;
  let totalBs = 0;
  let totalUsd = 0;
  for (const layer of layers) {
    if (remaining <= 1e-8) break;
    const consumed = Math.min(remaining, layer.quantity);
    totalBs += consumed * layer.unitCostBs;
    totalUsd += consumed * layer.unitCostUsd;
    remaining -= consumed;
  }
  const totalCostBs = cents(totalBs);
  const totalCostUsd = cents(totalUsd);
  return {
    quantity: quantityToIssue,
    totalCostBs,
    totalCostUsd,
    unitCostBs: totalCostBs / quantityToIssue,
    unitCostUsd: totalCostUsd / quantityToIssue
  };
}

/** Valida los datos comunes antes de aceptar un movimiento del libro de inventario. */
export function validateInventoryMovement(input: {
  date: string;
  quantity: number;
  bcvRate: number;
  unitCostBs: number;
  availableQuantity: number;
  type: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
}): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date)) ||
      new Date(input.date + 'T00:00:00Z').toISOString().slice(0, 10) !== input.date) {
    return 'La fecha del movimiento no es válida.';
  }
  if (!validPositive(input.quantity)) return 'La cantidad debe ser mayor que cero.';
  if (!validPositive(input.bcvRate)) return 'La tasa BCV histórica debe ser mayor que cero.';
  if (!validNonNegative(input.unitCostBs)) return 'El costo unitario no puede ser negativo.';
  if (!validNonNegative(input.availableQuantity)) return 'La existencia disponible no es válida.';
  if (input.type === 'SALIDA' && input.quantity - input.availableQuantity > 1e-8) {
    return `Existencia insuficiente: disponibles ${input.availableQuantity}, solicitadas ${input.quantity}.`;
  }
  return null;
}

/** NIC 2: el importe en libros no debe superar el valor neto realizable. */
export function calculateVnrWriteDown(input: {
  quantity: number;
  unitCostBs: number;
  estimatedSellingPricePerUnitBs: number;
  completionCostPerUnitBs: number;
  sellingCostPerUnitBs: number;
}): { carryingValueBs: number; netRealizableValueBs: number; writeDownBs: number; required: boolean } {
  const values = Object.values(input);
  if (values.some(value => !Number.isFinite(value) || value < 0)) {
    throw new Error('Los valores para la prueba VNR deben ser números finitos no negativos.');
  }
  const carryingValueBs = cents(input.quantity * input.unitCostBs);
  const netRealizableUnit = Math.max(0, input.estimatedSellingPricePerUnitBs -
    input.completionCostPerUnitBs - input.sellingCostPerUnitBs);
  const netRealizableValueBs = cents(input.quantity * netRealizableUnit);
  const writeDownBs = cents(Math.max(0, carryingValueBs - netRealizableValueBs));
  return { carryingValueBs, netRealizableValueBs, writeDownBs, required: writeDownBs > 0 };
}

/** Fórmula periódica de costo de ventas para revisión/cierre del período. */
export function calculatePeriodicCostOfSales(input: {
  openingInventoryBs: number;
  purchasesAndLandedCostsBs: number;
  closingInventoryBs: number;
}): number {
  const { openingInventoryBs, purchasesAndLandedCostsBs, closingInventoryBs } = input;
  if ([openingInventoryBs, purchasesAndLandedCostsBs, closingInventoryBs].some(v => !Number.isFinite(v) || v < 0)) {
    throw new Error('Los importes del cierre deben ser números finitos no negativos.');
  }
  const result = cents(openingInventoryBs + purchasesAndLandedCostsBs - closingInventoryBs);
  if (result < 0) throw new Error('El inventario final supera el inventario inicial más las compras y costos del período.');
  return result;
}
