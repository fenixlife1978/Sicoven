import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateJournalEntryAccounts } from './journalEntryValidation';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../data/defaultChartOfAccounts';

describe('journal entry account validation', () => {
  it('accepts existing movement accounts', () => {
    const movement = DEFAULT_CHART_OF_ACCOUNTS.find(account => account.isMovement);
    assert.ok(movement);
    assert.doesNotThrow(() => validateJournalEntryAccounts([{ accountCode: movement!.code }], DEFAULT_CHART_OF_ACCOUNTS));
  });

  it('rejects account codes absent from the chart', () => {
    assert.throws(
      () => validateJournalEntryAccounts([{ accountCode: '9.9.9.99' }], DEFAULT_CHART_OF_ACCOUNTS),
      /no existe en el plan de cuentas/
    );
  });

  it('rejects grouping accounts that cannot receive postings', () => {
    const grouping = DEFAULT_CHART_OF_ACCOUNTS.find(account => !account.isMovement);
    assert.ok(grouping);
    assert.throws(
      () => validateJournalEntryAccounts([{ accountCode: grouping!.code }], DEFAULT_CHART_OF_ACCOUNTS),
      /es agrupadora/
    );
  });

  it('rejects blank account codes', () => {
    assert.throws(
      () => validateJournalEntryAccounts([{ accountCode: '  ' }], DEFAULT_CHART_OF_ACCOUNTS),
      /no existe en el plan de cuentas/
    );
  });
});
