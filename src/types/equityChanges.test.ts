import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Account, JournalEntry } from './accounting';
import { buildEquityChangesReport } from './equityChanges';

const accounts: Account[] = [
  { code: '3.1', name: 'Capital social', type: 'PATRIMONIO', level: 2, isMovement: true },
  { code: '3.2', name: 'Resultados acumulados', type: 'PATRIMONIO', level: 2, isMovement: true },
  { code: '4.1', name: 'Ingresos', type: 'INGRESOS', level: 2, isMovement: true },
  { code: '5.1', name: 'Gastos', type: 'GASTOS', level: 2, isMovement: true },
  { code: '1.1', name: 'Banco', type: 'ACTIVO', level: 2, isMovement: true }
];

const entry = (id: string, date: string, type: JournalEntry['type'], items: JournalEntry['items'], exerciseLink?: JournalEntry['exerciseLink']): JournalEntry => ({
  id, companyId: 'co-1', entryNumber: Number(id.replace(/\D/g, '')) || 1,
  date, description: id, type, bcvRate: 1, items, createdAt: date, exerciseLink
});

describe('equity changes report', () => {
  it('reconciles opening equity, posted movements and a transferred result in both currencies', () => {
    const entries = [
      entry('opening-2026', '2026-01-01', 'APERTURA', [
        { accountCode: '3.1', accountName: 'Capital social', debitBs: 0, creditBs: 1000, debitUsd: 0, creditUsd: 100 }
      ], { priorPeriodStartDate: '2025-01-01', priorPeriodEndDate: '2025-12-31', nextPeriodStartDate: '2026-01-01' }),
      entry('capital-1', '2026-03-01', 'MANUAL', [
        { accountCode: '3.1', accountName: 'Capital social', debitBs: 0, creditBs: 200, debitUsd: 0, creditUsd: 20 }
      ]),
      entry('closing-1', '2026-12-31', 'CIERRE', [
        { accountCode: '4.1', accountName: 'Ingresos', debitBs: 500, creditBs: 0, debitUsd: 50, creditUsd: 0 },
        { accountCode: '5.1', accountName: 'Gastos', debitBs: 0, creditBs: 100, debitUsd: 0, creditUsd: 10 },
        { accountCode: '3.2', accountName: 'Resultados acumulados', debitBs: 0, creditBs: 400, debitUsd: 0, creditUsd: 40 }
      ])
    ] as JournalEntry[];
    const report = buildEquityChangesReport(entries, accounts, 'co-1', 2026);
    assert.equal(report.openingTotalBs, 1000);
    assert.equal(report.movementTotalBs, 600);
    assert.equal(report.closingTotalBs, 1600);
    assert.equal(report.closingTotalUsd, 160);
    assert.equal(report.resultTransferredToEquity, true);
    assert.equal(report.periodResultBs, 0);
    assert.equal(report.movements.length, 2);
  });

  it('adds unclosed current-year result once and keeps an in-year bank opening as a movement', () => {
    const entries = [
      entry('prior-1', '2025-05-01', 'MANUAL', [
        { accountCode: '4.1', accountName: 'Ingresos', debitBs: 0, creditBs: 300, debitUsd: 0, creditUsd: 30 },
        { accountCode: '5.1', accountName: 'Gastos', debitBs: 50, creditBs: 0, debitUsd: 5, creditUsd: 0 }
      ]),
      entry('bank-opening-1', '2026-02-01', 'APERTURA', [
        { accountCode: '3.1', accountName: 'Capital social', debitBs: 0, creditBs: 50, debitUsd: 0, creditUsd: 5 }
      ]),
      entry('income-1', '2026-04-01', 'VENTA', [
        { accountCode: '4.1', accountName: 'Ingresos', debitBs: 0, creditBs: 500, debitUsd: 0, creditUsd: 50 }
      ]),
      entry('expense-1', '2026-05-01', 'MANUAL', [
        { accountCode: '5.1', accountName: 'Gastos', debitBs: 100, creditBs: 0, debitUsd: 10, creditUsd: 0 }
      ])
    ];
    const report = buildEquityChangesReport(entries, accounts, 'co-1', 2026);
    assert.equal(report.openingTotalBs, 250);
    assert.equal(report.periodResultBs, 400);
    assert.equal(report.movementTotalBs, 450);
    assert.equal(report.closingTotalBs, 700);
    assert.equal(report.resultTransferredToEquity, false);
  });

  it('isolates companies and rejects invalid report periods', () => {
    assert.throws(() => buildEquityChangesReport([], accounts, '', 2026));
    assert.throws(() => buildEquityChangesReport([], accounts, 'co-1', 0));
    const other = entry('other-1', '2026-01-01', 'MANUAL', [
      { accountCode: '3.1', accountName: 'Capital social', debitBs: 0, creditBs: 999, debitUsd: 0, creditUsd: 99 }
    ]);
    other.companyId = 'co-2';
    assert.equal(buildEquityChangesReport([other], accounts, 'co-1', 2026).closingTotalBs, 0);
  });
});
