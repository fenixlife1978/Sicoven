import type { Account, JournalEntryItem } from './accounting';

/**
 * Prevents posting to missing or grouping accounts before the entry reaches
 * application state or SQLite persistence. Historical entries are not rewritten.
 */
export function validateJournalEntryAccounts(
  items: Pick<JournalEntryItem, 'accountCode'>[],
  accounts: Account[]
): void {
  for (const line of items) {
    const code = String(line.accountCode || '').trim();
    const account = accounts.find(candidate => candidate.code === code);
    if (!account) {
      throw new Error('La cuenta ' + (code || '(sin código)') + ' no existe en el plan de cuentas.');
    }
    if (!account.isMovement) {
      throw new Error('La cuenta ' + code + ' es agrupadora y no admite movimientos contables.');
    }
  }
}
