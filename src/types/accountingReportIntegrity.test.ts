import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getAccountBalanceNature,
  hasAccountMovement,
  isTrialBalanceBalanced
} from './accountingReportIntegrity';

describe('accounting report integrity', () => {
  it('includes an account with USD-only movement in report totals', () => {
    assert.equal(hasAccountMovement({ debitBs: 0, creditBs: 0, debitUsd: 12, creditUsd: 0 }), true);
  });

  it('excludes accounts without movement in either currency', () => {
    assert.equal(hasAccountMovement({ debitBs: 0, creditBs: 0, debitUsd: 0, creditUsd: 0 }), false);
  });

  it('requires trial balance totals to reconcile in Bs and USD', () => {
    const balanced = {
      totalDebitBs: 100, totalCreditBs: 100,
      debitBalancesBs: 40, creditBalancesBs: 40,
      totalDebitUsd: 10, totalCreditUsd: 10,
      debitBalancesUsd: 4, creditBalancesUsd: 4
    };
    assert.equal(isTrialBalanceBalanced(balanced), true);
    assert.equal(isTrialBalanceBalanced({ ...balanced, totalCreditUsd: 9.5 }), false);
    assert.equal(isTrialBalanceBalanced({ ...balanced, creditBalancesUsd: 3.9 }), false);
  });

  it('rejects non-finite or negative report totals', () => {
    const totals = {
      totalDebitBs: 100, totalCreditBs: 100,
      debitBalancesBs: 40, creditBalancesBs: 40,
      totalDebitUsd: 10, totalCreditUsd: 10,
      debitBalancesUsd: 4, creditBalancesUsd: 4
    };
    assert.equal(isTrialBalanceBalanced({ ...totals, totalDebitUsd: Number.NaN }), false);
    assert.equal(isTrialBalanceBalanced({ ...totals, totalDebitBs: -1 }), false);
  });

  it('labels debit and credit nature according to normal account balance', () => {
    assert.equal(getAccountBalanceNature(25, true), 'DEUDOR');
    assert.equal(getAccountBalanceNature(-25, true), 'ACREEDOR');
    assert.equal(getAccountBalanceNature(25, false), 'ACREEDOR');
    assert.equal(getAccountBalanceNature(-25, false), 'DEUDOR');
  });
});
