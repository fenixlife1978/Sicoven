import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterEntriesByCompany,
  getAccountBalanceNature,
  hasAccountMovement,
  isBalanceSheetBalanced,
  isTrialBalanceBalanced,
  selectHistoricalReportEntries
} from './accountingReportIntegrity';

describe('accounting report integrity', () => {
  it('isolates report entries to the selected company', () => {
    const entries = [
      { id: 'a-1', companyId: 'company-a' },
      { id: 'b-1', companyId: 'company-b' },
      { id: 'a-2', companyId: 'company-a' }
    ];
    assert.deepEqual(filterEntriesByCompany(entries, 'company-a').map(entry => entry.id), ['a-1', 'a-2']);
    assert.deepEqual(filterEntriesByCompany(entries, 'company-b').map(entry => entry.id), ['b-1']);
  });

  it('requires the statement of financial position to balance in Bs and USD', () => {
    const balanced = {
      totalAssetsBs: 1000,
      totalLiabilitiesAndEquityBs: 1000,
      totalAssetsUsd: 25,
      totalLiabilitiesAndEquityUsd: 25
    };
    assert.equal(isBalanceSheetBalanced(balanced), true);
    assert.equal(isBalanceSheetBalanced({ ...balanced, totalLiabilitiesAndEquityUsd: 24.99 }), false);
    assert.equal(isBalanceSheetBalanced({ ...balanced, totalLiabilitiesAndEquityBs: 999 }), false);
    assert.equal(isBalanceSheetBalanced({ ...balanced, totalAssetsUsd: Number.NaN }), false);
  });
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


describe('historical report period selection', () => {
  const entries = [
    { id: 'opening-2025', companyId: 'co-1', date: '2025-01-01', type: 'APERTURA' },
    { id: 'sale-2025', companyId: 'co-1', date: '2025-06-30', type: 'VENTA' },
    { id: 'closing-2025', companyId: 'co-1', date: '2025-12-31', type: 'CIERRE' },
    { id: 'opening-2026', companyId: 'co-1', date: '2026-01-01', type: 'APERTURA', exerciseLink: { nextPeriodStartDate: '2026-01-01' } },
    { id: 'sale-2026', companyId: 'co-1', date: '2026-03-15', type: 'VENTA' },
    { id: 'closing-2026', companyId: 'co-1', date: '2026-12-31', type: 'CIERRE' },
    { id: 'future-2027', companyId: 'co-1', date: '2027-01-01', type: 'MANUAL' },
    { id: 'other-company', companyId: 'co-2', date: '2025-04-01', type: 'MANUAL' }
  ];

  it('uses cumulative ledger entries through year-end for historical situation reports', () => {
    assert.deepEqual(
      selectHistoricalReportEntries(entries, 'co-1', 2026, 'SITUACION').map(entry => entry.id),
      ['opening-2026', 'sale-2026', 'closing-2026']
    );
  });

  it('keeps the prior exercise cumulative but resets at the next annual opening', () => {
    assert.deepEqual(
      selectHistoricalReportEntries(entries, 'co-1', 2025, 'SITUACION').map(entry => entry.id),
      ['opening-2025', 'sale-2025', 'closing-2025']
    );
    const selected2026 = selectHistoricalReportEntries(entries, 'co-1', 2026, 'SITUACION');
    assert.equal(selected2026.some(entry => entry.id === 'sale-2025'), false);
    assert.equal(selected2026.some(entry => entry.id === 'opening-2026'), true);
  });

  it('uses only selected-year operating entries for historical income statements', () => {
    assert.deepEqual(
      selectHistoricalReportEntries(entries, 'co-1', 2026, 'RESULTADOS').map(entry => entry.id),
      ['opening-2026', 'sale-2026']
    );
  });

  it('rejects invalid years and isolates companies', () => {
    assert.deepEqual(selectHistoricalReportEntries(entries, 'co-2', 2026, 'SITUACION').map(entry => entry.id), ['other-company']);
    assert.deepEqual(selectHistoricalReportEntries(entries, 'co-3', 2026, 'SITUACION'), []);
    assert.deepEqual(selectHistoricalReportEntries(entries, 'co-1', 0, 'SITUACION'), []);
  });
});
