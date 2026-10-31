import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Account, BankAccount, JournalEntry } from './accounting';
import { buildCashFlowIndirectReport } from './cashFlowIndirectStatement';

const accounts: Account[] = [
  { code: '1.1.1.01', name: 'Caja', type: 'ACTIVO', level: 4, isMovement: true, cashFlowActivity: 'EFECTIVO_EQUIVALENTE' },
  { code: '1.1.2.01', name: 'Cuentas por cobrar', type: 'ACTIVO', level: 4, isMovement: true, cashFlowIndirectTreatment: 'OPERATING_ASSET_INCREASE_DEDUCT' },
  { code: '1.2.1', name: 'Depreciación acumulada', type: 'ACTIVO', level: 4, isMovement: true, cashFlowActivity: 'INVERSION' },
  { code: '2.1.1.01', name: 'Cuentas por pagar', type: 'PASIVO', level: 4, isMovement: true, cashFlowIndirectTreatment: 'OPERATING_LIABILITY_INCREASE_ADD' },
  { code: '5.1.1', name: 'Gasto depreciación', type: 'GASTOS', level: 4, isMovement: true, cashFlowIndirectTreatment: 'NON_CASH_EXPENSE_ADD_BACK' },
  { code: '4.1.1', name: 'Ingresos operacionales', type: 'INGRESOS', level: 4, isMovement: true, cashFlowActivity: 'OPERACION' },
  { code: '5.1.2', name: 'Gastos operacionales', type: 'GASTOS', level: 4, isMovement: true, cashFlowActivity: 'OPERACION' },
  { code: '3.1.1', name: 'Capital social', type: 'PATRIMONIO', level: 4, isMovement: true, cashFlowActivity: 'FINANCIACION' }
];
const banks: BankAccount[] = [];
const line = (accountCode: string, debitBs: number, creditBs: number, debitUsd: number, creditUsd: number) =>
  ({ accountCode, accountName: accountCode, debitBs, creditBs, debitUsd, creditUsd });
const entry = (id: string, date: string, items: JournalEntry['items'], type: JournalEntry['type'] = 'MANUAL', exerciseLink?: JournalEntry['exerciseLink']): JournalEntry =>
  ({ id, companyId: 'co-1', entryNumber: 1, date, description: id, type, bcvRate: 1, items, createdAt: date, exerciseLink });

describe('cash flow indirect method', () => {
  it('reconciles profit plus depreciation and working-capital changes in both currencies', () => {
    const entries = [
      entry('opening', '2026-01-01', [
        line('1.1.1.01', 100, 0, 10, 0),
        line('1.1.2.01', 20, 0, 2, 0),
        line('2.1.1.01', 0, 10, 0, 1),
        line('3.1.1', 0, 110, 0, 11)
      ], 'APERTURA', { priorPeriodStartDate: '2025-01-01', priorPeriodEndDate: '2025-12-31', nextPeriodStartDate: '2026-01-01' }),
      entry('sale-credit', '2026-02-01', [
        line('1.1.2.01', 50, 0, 5, 0),
        line('4.1.1', 0, 50, 0, 5)
      ]),
      entry('cash-sale', '2026-02-02', [
        line('1.1.1.01', 100, 0, 10, 0),
        line('4.1.1', 0, 100, 0, 10)
      ]),
      entry('depreciation', '2026-03-01', [
        line('5.1.1', 30, 0, 3, 0),
        line('1.2.1', 0, 30, 0, 3)
      ]),
      entry('payable-increase', '2026-04-01', [
        line('5.1.2', 20, 0, 2, 0),
        line('2.1.1.01', 0, 20, 0, 2)
      ]),
      entry('cash-expense', '2026-05-01', [
        line('5.1.2', 10, 0, 1, 0),
        line('1.1.1.01', 0, 10, 0, 1)
      ])
    ];
    const report = buildCashFlowIndirectReport(entries, accounts, banks, 'co-1', 2026);
    assert.equal(report.netIncomeBs, 90);
    assert.equal(report.nonCashAdjustmentsBs, 30);
    assert.equal(report.workingCapitalAdjustmentsBs, -50 + 20);
    assert.equal(report.operatingCashFlowBs, 90);
    assert.equal(report.operatingCashFlowUsd, 9);
    assert.equal(report.isReconciled, true);
  });

  it('isolates companies and refuses invalid periods', () => {
    const other = entry('other', '2026-01-01', [line('1.1.1.01', 0, 100, 0, 10)]);
    other.companyId = 'co-2';
    assert.equal(buildCashFlowIndirectReport([other], accounts, banks, 'co-1', 2026).netIncomeBs, 0);
    assert.throws(() => buildCashFlowIndirectReport([], accounts, banks, '', 2026));
  });

  it('does not silently mark unknown income and balance accounts as classified', () => {
    const incomplete = accounts.map(account => account.code === '4.1.1'
      ? { ...account, cashFlowActivity: undefined, cashFlowIndirectTreatment: undefined }
      : account);
    const report = buildCashFlowIndirectReport([
      entry('sale', '2026-01-01', [line('1.1.1.01', 10, 0, 1, 0), line('4.1.1', 0, 10, 0, 1)])
    ], incomplete, banks, 'co-1', 2026);
    assert.equal(report.isFullyClassified, false);
  });
});
