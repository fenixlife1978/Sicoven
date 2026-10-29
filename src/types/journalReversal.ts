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
