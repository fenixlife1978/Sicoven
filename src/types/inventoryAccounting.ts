export type InventoryCostingMethod = 'PROMEDIO_PONDERADO' | 'PEPS';
export type InventoryVatTreatment = 'GENERAL_16' | 'REDUCIDA_8' | 'EXENTO' | 'EXONERADO';
export type InventoryItemType = 'MERCANCIA' | 'MATERIA_PRIMA' | 'PRODUCTO_EN_PROCESO' | 'PRODUCTO_TERMINADO' | 'SUBPRODUCTO';

/** Cuenta de inventario por defecto según la naturaleza contable del artículo. */
export function getDefaultInventoryAccountCode(itemType?: InventoryItemType): string {
  if (itemType === 'MATERIA_PRIMA') return '1.1.4.02';
  if (itemType === 'PRODUCTO_EN_PROCESO') return '1.1.4.04';
  return '1.1.4.01';
}

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

export interface FifoMovementSnapshot {
  type: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
  quantity: number;
  unitCostBs: number;
  unitCostUsd: number;
  date: string;
  documentRef?: string;
  balanceQty: number;
}

/**
 * Reconstructs PEPS layers only from the real movement history.
 * It never invents a legacy opening layer to make the current stock balance.
 */
export function reconstructFifoLayers(
  movementsInput: FifoMovementSnapshot[],
  currentStock: number
): CostLayer[] {
  if (!Array.isArray(movementsInput) || !validNonNegative(Number(currentStock))) {
    throw new Error('El Kardex PEPS o la existencia actual no son válidos.');
  }
  const ordered = movementsInput.map((movement, index) => ({ movement, index }))
    .sort((a, b) => a.movement.date.localeCompare(b.movement.date) || a.index - b.index);
  const layers: CostLayer[] = [];
  let runningQuantity = 0;
  const consumeLayers = (quantity: number, reference: string) => {
    let remaining = quantity;
    for (const layer of layers) {
      const consumed = Math.min(layer.quantity, remaining);
      layer.quantity -= consumed;
      remaining -= consumed;
      if (remaining <= 1e-8) break;
    }
    if (remaining > 1e-8) {
      throw new Error('El historial PEPS no contiene capas suficientes para reconstruir ' + reference + '.');
    }
  };
  for (const { movement } of ordered) {
    const date = String(movement.date || '');
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00Z') : null;
    if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
      throw new Error('El historial PEPS contiene una fecha inválida.');
    }
    const quantity = Number(movement.quantity);
    const unitCostBs = Number(movement.unitCostBs);
    const unitCostUsd = Number(movement.unitCostUsd);
    const balanceQuantity = Number(movement.balanceQty);
    if (!validNonNegative(unitCostBs) || !validNonNegative(unitCostUsd) ||
        !validNonNegative(balanceQuantity) || !validNonNegative(quantity)) {
      throw new Error('El historial PEPS contiene cantidades, costos o saldos no válidos.');
    }
    if (movement.type === 'ENTRADA') {
      if (!validPositive(quantity)) throw new Error('Una entrada PEPS debe contener una cantidad positiva.');
      layers.push({ quantity, unitCostBs, unitCostUsd, date, documentRef: movement.documentRef });
      runningQuantity += quantity;
    } else if (movement.type === 'SALIDA') {
      if (!validPositive(quantity)) throw new Error('Una salida PEPS debe contener una cantidad positiva.');
      consumeLayers(quantity, movement.documentRef || date);
      runningQuantity -= quantity;
    } else if (movement.type === 'AJUSTE') {
      const delta = balanceQuantity - runningQuantity;
      if (delta > 1e-8) {
        layers.push({ quantity: delta, unitCostBs, unitCostUsd, date, documentRef: movement.documentRef });
      } else if (delta < -1e-8) {
        consumeLayers(Math.abs(delta), movement.documentRef || date);
      }
      runningQuantity = balanceQuantity;
    } else {
      throw new Error('El historial PEPS contiene un tipo de movimiento desconocido.');
    }
    if (!Number.isFinite(runningQuantity) || runningQuantity < -1e-8 ||
        Math.abs(runningQuantity - balanceQuantity) > 1e-8) {
      throw new Error('El saldo de Kardex no concilia con las capas PEPS en el documento ' + (movement.documentRef || date) + '.');
    }
  }
  if (Math.abs(runningQuantity - Number(currentStock)) > 1e-8) {
    throw new Error('Las capas PEPS reconstruidas (' + runningQuantity + ') no coinciden con la existencia actual (' + currentStock + '). No se crearán capas de costo estimadas.');
  }
  return layers.filter(layer => layer.quantity > 1e-8);
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

/** Recalcula el costo promedio ponderado preservando por separado la valoración histórica en Bs. y USD. */
export function calculateWeightedAverageCostDual(
  existingQuantity: number,
  existingUnitCostBs: number,
  existingUnitCostUsd: number,
  incomingQuantity: number,
  incomingUnitCostBs: number,
  incomingUnitCostUsd: number
): InventoryCostResult {
  if (!validNonNegative(existingQuantity) || !validNonNegative(existingUnitCostBs) ||
      !validNonNegative(existingUnitCostUsd) || !validPositive(incomingQuantity) ||
      !validNonNegative(incomingUnitCostBs) || !validNonNegative(incomingUnitCostUsd)) {
    throw new Error('Cantidades o costos históricos Bs./USD inválidos para recalcular el costo promedio.');
  }
  const quantity = existingQuantity + incomingQuantity;
  const totalCostBs = cents(existingQuantity * existingUnitCostBs + incomingQuantity * incomingUnitCostBs);
  const totalCostUsd = usdPrecision(existingQuantity * existingUnitCostUsd + incomingQuantity * incomingUnitCostUsd);
  if (!Number.isFinite(quantity) || !Number.isFinite(totalCostBs) || !Number.isFinite(totalCostUsd)) {
    throw new Error('La valoración ponderada dual produjo un importe no finito.');
  }
  return {
    quantity, totalCostBs, totalCostUsd,
    unitCostBs: quantity > 0 ? totalCostBs / quantity : 0,
    unitCostUsd: quantity > 0 ? totalCostUsd / quantity : 0
  };
}

/** Calcula una salida PEPS consumiendo las capas más antiguas primero. */
export function calculateFifoIssue(layersInput: CostLayer[], quantityToIssue: number): InventoryCostResult {
  if (!validPositive(quantityToIssue)) throw new Error('La cantidad de salida debe ser mayor que cero.');
  if (!Array.isArray(layersInput)) throw new Error('El Kardex PEPS no contiene capas de costo válidas.');
  const layers = layersInput.map(layer => {
    const quantity = Number(layer?.quantity);
    const unitCostBs = Number(layer?.unitCostBs);
    const unitCostUsd = Number(layer?.unitCostUsd);
    if (!validNonNegative(quantity) || !validNonNegative(unitCostBs) || !validNonNegative(unitCostUsd) ||
        (layer.date != null && typeof layer.date !== 'string')) {
      throw new Error('Una capa PEPS contiene cantidad, costo o fecha no válida; no se puede descartar silenciosamente.');
    }
    return { ...layer, quantity, unitCostBs, unitCostUsd };
  }).filter(layer => layer.quantity > 0)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const available = layers.reduce((sum, layer) => sum + layer.quantity, 0);
  if (!Number.isFinite(available)) throw new Error('La existencia acumulada de las capas PEPS no es finita.');
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
  if (remaining > 1e-8 || !Number.isFinite(totalBs) || !Number.isFinite(totalUsd)) {
    throw new Error('No se pudo conciliar el consumo PEPS con las capas disponibles.');
  }
  const totalCostBs = cents(totalBs);
  const totalCostUsd = usdPrecision(totalUsd);
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

/** Normaliza la matriz BOM y consolida componentes repetidos antes de consumir existencias. */
export function normalizeProductionRecipe(
  recipeInput: Array<{ productId: string; quantityPerUnit: number }>,
  finishedProductId: string
): Array<{ productId: string; quantityPerUnit: number }> {
  if (!Array.isArray(recipeInput) || recipeInput.length === 0) {
    throw new Error('Configure primero la matriz insumo-producto del artículo.');
  }
  const quantities = new Map<string, number>();
  for (const line of recipeInput) {
    const productId = String(line?.productId || '').trim();
    const quantity = Number(line?.quantityPerUnit);
    if (!productId || productId === finishedProductId || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('La matriz contiene componentes inválidos, cantidades no positivas o una referencia circular directa.');
    }
    const accumulated = (quantities.get(productId) || 0) + quantity;
    if (!Number.isFinite(accumulated) || accumulated <= 0) {
      throw new Error('La cantidad acumulada de un componente de producción no es válida.');
    }
    quantities.set(productId, accumulated);
  }
  return [...quantities.entries()].map(([productId, quantityPerUnit]) => ({ productId, quantityPerUnit }));
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
