import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Account, BankAccount, JournalEntry } from './accounting';
import { buildCashFlowReport } from './cashFlowStatement';

const accounts: Account[] = [
  { code: '1.1.1.01', name: 'Caja principal', type: 'ACTIVO', level: 4, isMovement: true, cashFlowActivity: 'EFECTIVO_EQUIVALENTE' },
  { code: '4.1', name: 'Ingresos operacionales', type: 'INGRESOS', level: 2, isMovement: true, cashFlowActivity: 'OPERACION' },
  { code: '5.1', name: 'Gastos operacionales', type: 'GASTOS', level: 2, isMovement: true, cashFlowActivity: 'OPERACION' },
  { code: '3.1', name: 'Capital social', type: 'PATRIMONIO', level: 2, isMovement: true, cashFlowActivity: 'FINANCIACION' },
  { code: '1.2', name: 'Propiedad, planta y equipo', type: 'ACTIVO', level: 2, isMovement: true, cashFlowActivity: 'INVERSION' }
];
const banks: BankAccount[] = [
  { id: 'bank-1', companyId: 'co-1', accountCode: '1.1.1.03', bankName: 'Banco A', accountNumber: '12345678901234567890', currency: 'BS', initialBalanceBs: 0, initialBalanceUsd: 0 },
  { id: 'bank-2', companyId: 'co-1', accountCode: '1.1.1.04', bankName: 'Banco B', accountNumber: '12345678901234567891', currency: 'BS', initialBalanceBs: 0, initialBalanceUsd: 0 }
];
const entry = (id: string, date: string, type: JournalEntry['type'], items: JournalEntry['items'], exerciseLink?: JournalEntry['exerciseLink']): JournalEntry => ({
  id, companyId: 'co-1', entryNumber: Number(id.replace(/\D/g, '')) || 1,
  date, description: id, type, bcvRate: 1, items, createdAt: date, exerciseLink
});
const line = (accountCode: string, accountName: string, debitBs: number, creditBs: number, debitUsd: number, creditUsd: number) => ({
  accountCode, accountName, debitBs, creditBs, debitUsd, creditUsd
});

describe('cash flow statement', () => {
  it('classifies operating receipts and payments and reconciles cash in both currencies', () => {
    const entries = [
      entry('opening-2025', '2025-01-01', 'APERTURA', [line('1.1.1.01', 'Caja principal', 50, 0, 5, 0)]),
      entry('receipt-1', '2026-02-01', 'VENTA', [
        line('1.1.1.01', 'Caja principal', 100, 0, 10, 0),
        line('4.1', 'Ingresos operacionales', 0, 100, 0, 10)
      ]),
      entry('payment-1', '2026-03-01', 'MANUAL', [
        line('5.1', 'Gastos operacionales', 40, 0, 4, 0),
        line('1.1.1.01', 'Caja principal', 0, 40, 0, 4)
      ])
    ];
    const report = buildCashFlowReport(entries, accounts, banks, 'co-1', 2026);
    assert.equal(report.openingCashBs, 50);
    assert.equal(report.netChangeBs, 60);
    assert.equal(report.closingCashBs, 110);
    assert.equal(report.activities.OPERACION.receiptsBs, 100);
    assert.equal(report.activities.OPERACION.paymentsBs, 40);
    assert.equal(report.activities.OPERACION.netBs, 60);
    assert.equal(report.isFullyClassified, true);
    assert.equal(report.isReconciled, true);
  });

  it('does not classify transfers between company cash accounts as operating flows', () => {
    const entries = [
      entry('transfer-1', '2026-02-01', 'MANUAL', [
        line('1.1.1.03', 'Banco A', 0, 25, 0, 2.5),
        line('1.1.1.04', 'Banco B', 25, 0, 2.5, 0)
      ])
    ];
    const report = buildCashFlowReport(entries, accounts, banks, 'co-1', 2026);
    assert.equal(report.netChangeBs, 0);
    assert.equal(report.activities.OPERACION.netBs, 0);
    assert.equal(report.isReconciled, true);
  });

  it('marks cash movements with unclassified counterpart accounts instead of inventing activity', () => {
    const entries = [
      entry('unclassified-1', '2026-02-01', 'MANUAL', [
        line('1.1.1.01', 'Caja principal', 0, 30, 0, 3),
        line('3.1', 'Capital social', 30, 0, 3, 0)
      ])
    ];
    const unclassifiedAccounts = accounts.map(account => account.code === '3.1' ? { ...account, cashFlowActivity: undefined } : account);
    const report = buildCashFlowReport(entries, unclassifiedAccounts, banks, 'co-1', 2026);
    assert.equal(report.unclassifiedNetBs, -30);
    assert.equal(report.activities.SIN_CLASIFICAR.paymentsBs, 30);
    assert.equal(report.isFullyClassified, false);
    assert.equal(report.isReconciled, true);
  });

  it('does not mark offsetting unclassified receipts and payments as complete', () => {
    const entries = [
      entry('unclassified-in', '2026-02-01', 'MANUAL', [
        line('1.1.1.01', 'Caja principal', 0, 0, 0, 0),
        line('3.1', 'Capital social', 0, 25, 0, 2.5)
      ]),
      entry('unclassified-out', '2026-03-01', 'MANUAL', [
        line('1.1.1.01', 'Caja principal', 25, 0, 2.5, 0),
        line('3.1', 'Capital social', 0, 25, 0, 2.5)
      ])
    ];
    const report = buildCashFlowReport(entries, accounts.map(account => account.code === '3.1' ? { ...account, cashFlowActivity: undefined } : account), banks, 'co-1', 2026);
    assert.equal(report.unclassifiedNetBs, 0);
    assert.equal(report.activities.SIN_CLASIFICAR.receiptsBs + report.activities.SIN_CLASIFICAR.paymentsBs, 50);
    assert.equal(report.isFullyClassified, false);
  });

  it('treats a linked annual opening as opening cash, not as a period cash flow', () => {
    const entries = [
      entry('annual-opening-2026', '2026-01-01', 'APERTURA', [
        line('1.1.1.01', 'Caja principal', 500, 0, 50, 0),
        line('3.1', 'Capital social', 0, 500, 0, 50)
      ], { priorPeriodStartDate: '2025-01-01', priorPeriodEndDate: '2025-12-31', nextPeriodStartDate: '2026-01-01' })
    ];
    const report = buildCashFlowReport(entries, accounts, banks, 'co-1', 2026);
    assert.equal(report.openingCashBs, 500);
    assert.equal(report.netChangeBs, 0);
    assert.equal(report.closingCashBs, 500);
    assert.equal(report.activities.FINANCIACION.netBs, 0);
    assert.equal(report.isReconciled, true);
  });

  it('isolates companies and rejects invalid report periods', () => {
    assert.throws(() => buildCashFlowReport([], accounts, banks, '', 2026));
    assert.throws(() => buildCashFlowReport([], accounts, banks, 'co-1', 0));
    const other = entry('other-1', '2026-01-01', 'MANUAL', [line('1.1.1.01', 'Caja principal', 0, 50, 0, 5)]);
    other.companyId = 'co-2';
    assert.equal(buildCashFlowReport([other], accounts, banks, 'co-1', 2026).closingCashBs, 0);
  });
});
