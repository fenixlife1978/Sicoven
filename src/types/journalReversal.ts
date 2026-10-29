import type { Account, JournalEntry, JournalEntryItem } from './accounting';

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
