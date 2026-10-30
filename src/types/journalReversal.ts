import type { Account, BankAccount, BankStatementMovement, InventoryMovement, InventoryProduct, JournalEntry, JournalEntryItem } from './accounting';

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
    (movement.journalEntryId === source.id || invoiceRefs.has(normalize(movement.documentRef)))
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
    const originalCostEntry = original.journalEntryId
      ? journalEntries.find(item => item.id === original.journalEntryId && item.companyId === companyId)
      : undefined;
    if (!originalCostEntry || originalCostEntry.type !== 'INVENTARIO' ||
        originalCostEntry.date !== original.date || originalCostEntry.referenceDoc !== original.documentRef ||
        originalCostEntry.items.length !== 2 ||
        originalCostEntry.items.some(item => item.accountCode !== inventoryCode && item.accountCode !== costCode)) {
      return blocked('La salida original de ' + original.productCode + ' no tiene un asiento de costo/inventario verificable.');
    }
    const originalCostTotals = originalCostEntry.items.reduce((sum, item) => ({
      debitBs: sum.debitBs + Number(item.debitBs || 0),
      creditBs: sum.creditBs + Number(item.creditBs || 0),
      debitUsd: sum.debitUsd + Number(item.debitUsd || 0),
      creditUsd: sum.creditUsd + Number(item.creditUsd || 0),
      inventoryCreditBs: sum.inventoryCreditBs + (item.accountCode === inventoryCode ? Number(item.creditBs || 0) : 0),
      costDebitBs: sum.costDebitBs + (item.accountCode === costCode ? Number(item.debitBs || 0) : 0),
      inventoryCreditUsd: sum.inventoryCreditUsd + (item.accountCode === inventoryCode ? Number(item.creditUsd || 0) : 0),
      costDebitUsd: sum.costDebitUsd + (item.accountCode === costCode ? Number(item.debitUsd || 0) : 0)
    }), { debitBs: 0, creditBs: 0, debitUsd: 0, creditUsd: 0,
      inventoryCreditBs: 0, costDebitBs: 0, inventoryCreditUsd: 0, costDebitUsd: 0 });
    if (Math.abs(originalCostTotals.debitBs - originalCostTotals.creditBs) >= 0.01 ||
        Math.abs(originalCostTotals.debitUsd - originalCostTotals.creditUsd) >= 0.01 ||
        Math.abs(originalCostTotals.inventoryCreditBs - Number(original.totalCostBs)) > 0.02 ||
        Math.abs(originalCostTotals.costDebitBs - Number(original.totalCostBs)) > 0.02 ||
        Math.abs(originalCostTotals.inventoryCreditUsd - Number(original.totalCostUsd)) > 0.02 ||
        Math.abs(originalCostTotals.costDebitUsd - Number(original.totalCostUsd)) > 0.02) {
      return blocked('El asiento original de costo no coincide con el valor histórico del Kardex para ' + original.productCode + '.');
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
      item.productId !== original.productId || item.type !== 'ENTRADA' ||
      item.concept !== 'DEVOLUCION_CLIENTE' || !item.journalEntryId ||
      !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 ||
      !Number.isFinite(Number(item.totalCostBs)) || Number(item.totalCostBs) <= 0 ||
      !Number.isFinite(Number(item.totalCostUsd)) || Number(item.totalCostUsd) <= 0 ||
      item.date < original.date
    )) {
      return blocked('La devolución de ' + original.productCode + ' no tiene movimientos de entrada válidos y fechados después de la venta.');
    }
    const returnedCostBs = corrections.reduce((sum, item) => sum + Number(item.totalCostBs), 0);
    const returnedCostUsd = corrections.reduce((sum, item) => sum + Number(item.totalCostUsd), 0);
    if (Math.abs(returnedCostBs - Number(original.totalCostBs)) > 0.02 ||
        Math.abs(returnedCostUsd - Number(original.totalCostUsd)) > 0.02) {
      return blocked('El costo devuelto de ' + original.productCode + ' no coincide con el costo original del Kardex.');
    }
    for (const correction of corrections) {
      const entry = journalEntries.find(item => item.id === correction.journalEntryId && item.companyId === companyId);
      if (!entry || entry.type !== 'INVENTARIO' || entry.date !== correction.date ||
          entry.referenceDoc !== correction.documentRef || entry.items.length !== 2 ||
          entry.items.some(item => item.accountCode !== inventoryCode && item.accountCode !== costCode)) {
        return blocked('La devolución ' + correction.documentRef + ' no tiene un asiento exclusivo de inventario/costo vinculado.');
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


export interface BankStatementReversalPair {
  originalStatementId: string;
  reversalStatementId: string;
  bankAccountId: string;
}

export interface BankStatementReversalReadiness {
  ready: boolean;
  reason?: string;
  pairs: BankStatementReversalPair[];
}

/**
 * A previously reconciled bank line can only be reversed when the imported bank
 * statement also contains its exact opposite transaction. The caller links the
 * contra-entry and both statement rows in the same SQLite snapshot.
 */
export function validateBankStatementReversal(input: {
  companyId: string;
  source: JournalEntry;
  reversalItems: JournalEntryItem[];
  bankAccounts: BankAccount[];
  statementMovements: BankStatementMovement[];
}): BankStatementReversalReadiness {
  const { companyId, source, reversalItems, bankAccounts, statementMovements } = input;
  const originalRows = statementMovements.filter(row =>
    row.companyId === companyId &&
    (row.reconciledWithJournalEntryId === source.id ||
      row.reconciledJournalEntryIds?.includes(source.id))
  );
  if (!originalRows.length) return { ready: true, pairs: [] };
  const originalBankAccountIds = originalRows.map(row => row.bankAccountId);
  if (new Set(originalBankAccountIds).size !== originalBankAccountIds.length) {
    return { ready: false, reason: 'El mismo asiento aparece conciliado históricamente con varias filas de una misma cuenta bancaria; requiere conciliación manual antes de reversar.', pairs: [] };
  }
  const pairs: BankStatementReversalPair[] = [];
  const usedOppositeIds = new Set<string>();
  const usedAccountCodes = new Set<string>();
  for (const original of originalRows) {
    if ((original.isReconciled && original.reconciledWithJournalEntryId !== source.id) ||
        (original.reconciledWithJournalEntryId && original.reconciledWithJournalEntryId !== source.id)) {
      return { ready: false, reason: 'El movimiento bancario ' + original.reference + ' fue vinculado posteriormente a otro asiento; requiere resolver esa conciliación antes de reversar.', pairs: [] };
    }
    const bank = bankAccounts.find(item => item.id === original.bankAccountId && item.companyId === companyId);
    if (!bank) return { ready: false, reason: 'No se encuentra la cuenta bancaria del movimiento histórico ' + original.id + '.', pairs: [] };
    if (usedAccountCodes.has(bank.accountCode)) {
      return { ready: false, reason: 'Varias cuentas bancarias comparten el mismo código contable; no es posible certificar una reversión automática.', pairs: [] };
    }
    usedAccountCodes.add(bank.accountCode);
    const isUsd = bank.currency === 'USD';
    const originalAmount = isUsd ? Number(original.amountUsd) : Number(original.amountBs);
    const tolerance = isUsd ? 0.000001 : 0.05;
    const sourceDebit = source.items.filter(item => item.accountCode === bank.accountCode)
      .reduce((sum, item) => sum + Number(isUsd ? item.debitUsd : item.debitBs), 0);
    const sourceCredit = source.items.filter(item => item.accountCode === bank.accountCode)
      .reduce((sum, item) => sum + Number(isUsd ? item.creditUsd : item.creditBs), 0);
    const originalMatches = original.type === 'CREDIT'
      ? Math.abs(sourceDebit - originalAmount) < tolerance && sourceCredit < tolerance
      : Math.abs(sourceCredit - originalAmount) < tolerance && sourceDebit < tolerance;
    if (!originalMatches) {
      return { ready: false, reason: 'El asiento original ya no coincide con el importe/naturaleza del extracto bancario ' + original.reference + '.', pairs: [] };
    }
    const oppositeType = original.type === 'CREDIT' ? 'DEBIT' : 'CREDIT';
    const candidates = statementMovements.filter(row => {
      if (row.id === original.id || usedOppositeIds.has(row.id) ||
          row.companyId !== companyId || row.bankAccountId !== original.bankAccountId ||
          row.type !== oppositeType || row.date < original.date ||
          row.isReconciled || row.reconciledWithJournalEntryId ||
          (row.reconciledJournalEntryIds?.length || 0) > 0) return false;
      const amount = isUsd ? Number(row.amountUsd) : Number(row.amountBs);
      return Math.abs(amount - originalAmount) < tolerance;
    });
    if (candidates.length !== 1) {
      return {
        ready: false,
        reason: candidates.length === 0
          ? 'Falta importar el movimiento bancario inverso exacto para la referencia ' + original.reference + '.'
          : 'Hay más de un posible movimiento bancario inverso para ' + original.reference + '; desambigüe el extracto antes de reversar.',
        pairs: []
      };
    }
    const opposite = candidates[0];
    const expectsDebit = opposite.type === 'CREDIT';
    const reversalDebit = reversalItems.filter(item => item.accountCode === bank.accountCode)
      .reduce((sum, item) => sum + Number(isUsd ? item.debitUsd : item.debitBs), 0);
    const reversalCredit = reversalItems.filter(item => item.accountCode === bank.accountCode)
      .reduce((sum, item) => sum + Number(isUsd ? item.creditUsd : item.creditBs), 0);
    const reversalMatches = expectsDebit
      ? Math.abs(reversalDebit - originalAmount) < tolerance && reversalCredit < tolerance
      : Math.abs(reversalCredit - originalAmount) < tolerance && reversalDebit < tolerance;
    if (!reversalMatches) {
      return { ready: false, reason: 'El contra-asiento propuesto no compensa exactamente la línea de la cuenta bancaria ' + bank.bankName + '.', pairs: [] };
    }
    usedOppositeIds.add(opposite.id);
    pairs.push({
      originalStatementId: original.id,
      reversalStatementId: opposite.id,
      bankAccountId: original.bankAccountId
    });
  }
  return { ready: true, pairs };
}
