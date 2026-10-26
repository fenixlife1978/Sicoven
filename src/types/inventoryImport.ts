export type ImportRow = Record<string, string | undefined>;

export const isValidIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export const importNumber = (
  row: ImportRow,
  key: string,
  label: string,
  options: { min?: number; strictlyPositive?: boolean; optional?: boolean } = {}
): number => {
  const raw = row[key];
  if ((raw === undefined || raw.trim() === '') && options.optional) return 0;
  if (raw === undefined || raw.trim() === '') throw new Error(label + ': valor obligatorio.');
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(label + ': debe ser un número válido.');
  if (options.strictlyPositive ? value <= 0 : value < (options.min ?? 0)) {
    throw new Error(label + (options.strictlyPositive ? ': debe ser mayor que cero.' : ': no puede ser negativo.'));
  }
  return value;
};

export const validateOpeningInventoryRow = (row: ImportRow, line: number, defaultRate: number) => {
  const prefix = 'Fila ' + line + ': ';
  if (!row.code?.trim() || !row.name?.trim()) throw new Error(prefix + 'falta code o name.');
  const currentStock = importNumber(row, 'currentstock', prefix + 'currentStock');
  const avgCostBs = importNumber(row, 'avgcostbs', prefix + 'avgCostBs');
  if (currentStock > 0 && avgCostBs <= 0) throw new Error(prefix + 'avgCostBs debe ser mayor que cero cuando hay existencias.');
  const minStock = importNumber(row, 'minstock', prefix + 'minStock', { optional: true });
  const salesPriceBs = importNumber(row, 'salespricebs', prefix + 'salesPriceBs', { optional: true });
  const salesPriceUsd = importNumber(row, 'salespriceusd', prefix + 'salesPriceUsd', { optional: true });
  const openingBcvRate = row.openingbcvrate?.trim()
    ? importNumber(row, 'openingbcvrate', prefix + 'openingBcvRate', { strictlyPositive: true })
    : defaultRate;
  if (!Number.isFinite(openingBcvRate) || openingBcvRate <= 0) {
    throw new Error(prefix + 'openingBcvRate debe ser mayor que cero; indique la tasa BCV histórica.');
  }
  const openingDate = row.openingdate?.trim() || new Date().toISOString().slice(0, 10);
  if (!isValidIsoDate(openingDate)) throw new Error(prefix + 'openingDate debe ser una fecha real con formato AAAA-MM-DD.');
  const costingMethod = row.costingmethod || 'PROMEDIO_PONDERADO';
  if (!['PEPS', 'PROMEDIO_PONDERADO'].includes(costingMethod)) throw new Error(prefix + 'costingMethod inválido.');
  const vatTreatment = row.vattreatment || 'GENERAL_16';
  if (!['GENERAL_16', 'REDUCIDA_8', 'EXENTO', 'EXONERADO'].includes(vatTreatment)) throw new Error(prefix + 'vatTreatment inválido.');
  const itemType = row.itemtype || 'MERCANCIA';
  if (!['MERCANCIA', 'MATERIA_PRIMA', 'PRODUCTO_EN_PROCESO', 'PRODUCTO_TERMINADO', 'SUBPRODUCTO'].includes(itemType)) throw new Error(prefix + 'itemType inválido.');
  return { currentStock, avgCostBs, minStock, salesPriceBs, salesPriceUsd, openingBcvRate, openingDate, costingMethod, vatTreatment, itemType };
};

export const validateMovementImportRow = (row: ImportRow, line: number) => {
  const prefix = 'Fila ' + line + ': ';
  const date = row.date?.trim() || '';
  if (!isValidIsoDate(date)) throw new Error(prefix + 'date debe ser una fecha real con formato AAAA-MM-DD.');
  const type = row.type?.trim().toUpperCase() || '';
  if (!['ENTRADA', 'SALIDA', 'AJUSTE'].includes(type)) throw new Error(prefix + 'type debe ser ENTRADA, SALIDA o AJUSTE.');
  if (!row.concept?.trim()) throw new Error(prefix + 'concept es obligatorio.');
  if (!row.documentref?.trim()) throw new Error(prefix + 'documentRef es obligatorio.');
  const quantity = importNumber(row, 'quantity', prefix + 'quantity', { strictlyPositive: true });
  const unitCostBs = importNumber(row, 'unitcostbs', prefix + 'unitCostBs');
  const bcvRate = importNumber(row, 'bcvrate', prefix + 'bcvRate', { strictlyPositive: true });
  const additionalLandedCostsBs = importNumber(row, 'additionallandedcostsbs', prefix + 'additionalLandedCostsBs', { optional: true });
  const balanceQty = type === 'AJUSTE' ? importNumber(row, 'balanceqty', prefix + 'balanceQty') : 0;
  return { date, type: type as 'ENTRADA' | 'SALIDA' | 'AJUSTE', quantity, unitCostBs, bcvRate, additionalLandedCostsBs, balanceQty };
};
