import type { Account, InventoryMovement, InventoryProduct, JournalEntry, JournalEntryItem } from './accounting';

/**
 * Builds an immutable contra-entry by swapping debit/credit in both currencies.
 * For prior-period adjustments, P&L accounts are mapped to an explicitly selected
 * movement equity account; balance-sheet accounts retain their original accounts.
 */
export function buildReversalItems(
  source: JournalEntry,
  accounts: Account[],
  priorPeriodAdjustment = false,
  retainedEarningsAccountCode?: string
): JournalEntryItem[] {
  if (!source || !Array.isArray(source.items) || source.items.length < 2) {
    throw new Error('El asiento original no contiene suficientes líneas para una reversión.');
  }
  const totals = source.items.reduce((sum, item) => {
    const values = [item.debitBs, item.creditBs, item.debitUsd, item.creditUsd].map(Number);
    if (values.some(value => !Number.isFinite(value) || value < 0) ||
        (Number(item.debitBs) > 0 && Number(item.creditBs) > 0) ||
        (Number(item.debitUsd) > 0 && Number(item.creditUsd) > 0)) {
      throw new Error('El asiento original contiene líneas inválidas; no puede generarse una reversión certificada.');
    }
    sum.debitBs += Number(item.debitBs);
    sum.creditBs += Number(item.creditBs);
    sum.debitUsd += Number(item.debitUsd);
    sum.creditUsd += Number(item.creditUsd);
    return sum;
  }, { debitBs: 0, creditBs: 0, debitUsd: 0, creditUsd: 0 });
  if (Math.abs(totals.debitBs - totals.creditBs) >= 0.01 ||
      Math.abs(totals.debitUsd - totals.creditUsd) >= 0.01 ||
      totals.debitBs <= 0 || totals.debitUsd <= 0) {
    throw new Error('El asiento original no cuadra simultáneamente en Bs. y USD; requiere conciliación antes de reversarlo.');
  }
  const accountByCode = new Map(accounts.map(account => [account.code, account]));
  const retained = priorPeriodAdjustment
    ? accounts.find(account => account.code === retainedEarningsAccountCode &&
      account.type === 'PATRIMONIO' && account.isMovement)
    : undefined;
  if (priorPeriodAdjustment && !retained) {
    throw new Error('Para AIA seleccione una cuenta de patrimonio de movimiento destinada a resultados acumulados.');
  }
  return source.items.map(item => {
    const sourceAccount = accountByCode.get(item.accountCode);
    if (!sourceAccount) throw new Error('No se encuentra la cuenta contable ' + item.accountCode + ' del asiento original.');
    if (!sourceAccount.isMovement) throw new Error('La cuenta ' + item.accountCode + ' no admite movimientos; no puede recibir una reversión.');
    const remap = priorPeriodAdjustment && ['INGRESOS', 'COSTOS', 'GASTOS'].includes(sourceAccount.type);
    const target = remap ? retained! : sourceAccount;
    return {
      accountCode: target.code,
      accountName: target.name,
      debitBs: item.creditBs,
      creditBs: item.debitBs,
      debitUsd: item.creditUsd,
      creditUsd: item.debitUsd,
      description: remap
        ? 'AIA · ' + (item.description || item.accountName)
        : 'Reversión · ' + (item.description || item.accountName)
    };
  });
}


export interface SaleInventoryReturnReadiness {
  ready: boolean;
  reason?: string;
  originalMovementCount: number;
  returnedMovementCount: number;
}

/**
 * A full sale reversal may proceed only after every stock issue tied to that
 * invoice has a complete customer-return movement and a balanced inventory/COGS
 * entry. Partial returns remain blocked because this routine reverses the full
 * invoice, not a partial credit note.
 */
export function validateSaleInventoryReturnReconciliation(input: {
  companyId: string;
  invoiceNumber: string;
  source: JournalEntry;
  movements: InventoryMovement[];
  products: InventoryProduct[];
  journalEntries: JournalEntry[];
}): SaleInventoryReturnReadiness {
  const { companyId, invoiceNumber, source, movements, products, journalEntries } = input;
  const normalize = (value: string) => String(value || '').trim().toUpperCase();
  const invoiceRefs = new Set([normalize(invoiceNumber), normalize('FAC-' + invoiceNumber)]);
  const originals = movements.filter(movement =>
    movement.companyId === companyId && !movement.correctionForMovementId &&
    (movement.journalEntryId === source.id ||
      (invoiceRefs.has(normalize(movement.documentRef)) && movement.type === 'SALIDA' && movement.concept === 'VENTA'))
  );
  const blocked = (reason: string): SaleInventoryReturnReadiness => ({
    ready: false, reason, originalMovementCount: originals.length, returnedMovementCount: 0
  });
  if (!originals.length) {
    return { ready: true, originalMovementCount: 0, returnedMovementCount: 0 };
  }
  let returnedMovementCount = 0;
  for (const original of originals) {
    if (original.type !== 'SALIDA' || original.concept !== 'VENTA') {
      return blocked('El asiento tiene movimientos de inventario que no son salidas originales de esta venta; requieren conciliación manual especializada.');
    }
    const product = products.find(item => item.id === original.productId && item.companyId === companyId);
    if (!product) return blocked('No se encuentra el artículo asociado al movimiento original ' + original.id + '.');
    const inventoryCode = product.inventoryAccountCode || '1.1.4.01';
    const costCode = product.costOfSalesAccountCode || '5.1.1.01';
    if (source.items.some(item =>
      (item.accountCode === inventoryCode || item.accountCode === costCode) &&
      (Number(item.debitBs || 0) + Number(item.creditBs || 0) +
       Number(item.debitUsd || 0) + Number(item.creditUsd || 0)) > 0.01
    )) {
      return blocked('El asiento original ya contiene costo de ventas o inventario; revertirlo además de las devoluciones duplicaría el efecto del Kardex.');
    }
    const corrections = movements.filter(item =>
      item.companyId === companyId && item.correctionForMovementId === original.id
    );
    const returnedQuantity = corrections.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    if (!Number.isFinite(returnedQuantity) ||
        Math.abs(returnedQuantity - Number(original.quantity)) > 1e-8) {
      return blocked('La salida ' + original.documentRef + ' del artículo ' + original.productCode +
        ' no está devuelta en su totalidad. Devuelto: ' + returnedQuantity + ' de ' + original.quantity + '.');
    }
    if (!corrections.length || corrections.some(item =>
      item.type !== 'ENTRADA' || item.concept !== 'DEVOLUCION_CLIENTE' ||
      !item.journalEntryId || item.date < original.date
    )) {
      return blocked('La devolución de ' + original.productCode + ' no tiene movimientos de entrada válidos y fechados después de la venta.');
    }
    for (const correction of corrections) {
      const entry = journalEntries.find(item => item.id === correction.journalEntryId && item.companyId === companyId);
      if (!entry || entry.type !== 'INVENTARIO' || entry.referenceDoc !== correction.documentRef) {
        return blocked('La devolución ' + correction.documentRef + ' no tiene su asiento de inventario vinculado.');
      }
      const totals = entry.items.reduce((sum, item) => ({
        debitBs: sum.debitBs + Number(item.debitBs || 0),
        creditBs: sum.creditBs + Number(item.creditBs || 0),
        debitUsd: sum.debitUsd + Number(item.debitUsd || 0),
        creditUsd: sum.creditUsd + Number(item.creditUsd || 0),
        inventoryDebitBs: sum.inventoryDebitBs + (item.accountCode === inventoryCode ? Number(item.debitBs || 0) : 0),
        costCreditBs: sum.costCreditBs + (item.accountCode === costCode ? Number(item.creditBs || 0) : 0),
        inventoryDebitUsd: sum.inventoryDebitUsd + (item.accountCode === inventoryCode ? Number(item.debitUsd || 0) : 0),
        costCreditUsd: sum.costCreditUsd + (item.accountCode === costCode ? Number(item.creditUsd || 0) : 0)
      }), { debitBs: 0, creditBs: 0, debitUsd: 0, creditUsd: 0,
        inventoryDebitBs: 0, costCreditBs: 0, inventoryDebitUsd: 0, costCreditUsd: 0 });
      if (Math.abs(totals.debitBs - totals.creditBs) >= 0.01 ||
          Math.abs(totals.debitUsd - totals.creditUsd) >= 0.01 ||
          Math.abs(totals.inventoryDebitBs - Number(correction.totalCostBs)) > 0.02 ||
          Math.abs(totals.costCreditBs - Number(correction.totalCostBs)) > 0.02 ||
          Math.abs(totals.inventoryDebitUsd - Number(correction.totalCostUsd)) > 0.02 ||
          Math.abs(totals.costCreditUsd - Number(correction.totalCostUsd)) > 0.02) {
        return blocked('El asiento ' + entry.entryNumber + ' de la devolución no concilia Debe/Haber, inventario y costo de ventas.');
      }
    }
    returnedMovementCount += corrections.length;
  }
  return { ready: true, originalMovementCount: originals.length, returnedMovementCount };
}
