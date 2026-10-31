import type { Account, BankAccount, JournalEntry } from './accounting';
import { buildCashFlowReport, type CashFlowReport } from './cashFlowStatement';

export type CashFlowIndirectTreatment =
  | 'NON_CASH_EXPENSE_ADD_BACK'
  | 'NON_CASH_INCOME_DEDUCT'
  | 'OPERATING_ASSET_INCREASE_DEDUCT'
  | 'OPERATING_LIABILITY_INCREASE_ADD'
  | 'EXCLUDE';

export interface CashFlowIndirectAdjustment {
  accountCode: string;
  accountName: string;
  treatment: CashFlowIndirectTreatment;
  openingBalanceBs: number;
  closingBalanceBs: number;
  changeBs: number;
  adjustmentBs: number;
  openingBalanceUsd: number;
  closingBalanceUsd: number;
  changeUsd: number;
  adjustmentUsd: number;
}

export interface CashFlowIndirectReport {
  year: number;
  netIncomeBs: number;
  netIncomeUsd: number;
  nonCashAdjustmentsBs: number;
  nonCashAdjustmentsUsd: number;
  workingCapitalAdjustmentsBs: number;
  workingCapitalAdjustmentsUsd: number;
  operatingCashFlowBs: number;
  operatingCashFlowUsd: number;
  investingCashFlowBs: number;
  investingCashFlowUsd: number;
  financingCashFlowBs: number;
  financingCashFlowUsd: number;
  netChangeBs: number;
  netChangeUsd: number;
  openingCashBs: number;
  openingCashUsd: number;
  closingCashBs: number;
  closingCashUsd: number;
  ledgerClosingCashBs: number;
  ledgerClosingCashUsd: number;
  reconciliationDifferenceBs: number;
  reconciliationDifferenceUsd: number;
  isReconciled: boolean;
  isFullyClassified: boolean;
  adjustments: CashFlowIndirectAdjustment[];
  directBasis: CashFlowReport;
}

const finite = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const round = (value: number, places: number) => {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};
const isOpening = (entry: JournalEntry, year: number) =>
  entry.type === 'APERTURA' && entry.exerciseLink?.nextPeriodStartDate?.slice(0, 4) === String(year);
const isExcludedFromIncome = (entry: JournalEntry) => entry.type === 'APERTURA' || entry.type === 'CIERRE';
const balanceMovement = (entry: JournalEntry, code: string, normal: 'DEBIT' | 'CREDIT') =>
  entry.items.filter(item => item.accountCode === code).reduce((sum, item) => ({
    bs: sum.bs + (normal === 'DEBIT'
      ? finite(item.debitBs) - finite(item.creditBs)
      : finite(item.creditBs) - finite(item.debitBs)),
    usd: sum.usd + (normal === 'DEBIT'
      ? finite(item.debitUsd) - finite(item.creditUsd)
      : finite(item.creditUsd) - finite(item.debitUsd))
  }), { bs: 0, usd: 0 });

/**
 * Indirect cash flow. Every non-cash adjustment and working-capital account must
 * carry an explicit account-level treatment. Unknown accounts are never guessed.
 * Investing and financing sections reuse the verified direct-method cash movements;
 * operating cash flow is independently reconstructed from profit and balance changes.
 */
export function buildCashFlowIndirectReport(
  entries: JournalEntry[],
  accounts: Account[],
  bankAccounts: BankAccount[],
  companyId: string,
  year: number
): CashFlowIndirectReport {
  if (!companyId.trim() || !Number.isInteger(year) || year < 1) {
    throw new Error('La empresa y el ejercicio seleccionado deben ser válidos.');
  }
  const direct = buildCashFlowReport(entries, accounts, bankAccounts, companyId, year);
  const start = String(year).padStart(4, '0') + '-01-01';
  const end = String(year).padStart(4, '0') + '-12-31';
  const companyEntries = entries.filter(entry =>
    entry.companyId === companyId && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && entry.date <= end
  );
  const annualOpening = companyEntries.filter(entry => isOpening(entry, year)).sort((a, b) =>
    a.date.localeCompare(b.date) || a.entryNumber - b.entryNumber
  ).at(-1);
  const priorEntries = companyEntries.filter(entry => entry.date < start);
  const periodEntries = companyEntries.filter(entry =>
    entry.date >= start && entry.date <= end && !isExcludedFromIncome(entry)
  );
  const openingBasis = annualOpening ? [annualOpening] : priorEntries;
  const accountRows: CashFlowIndirectAdjustment[] = [];
  let netIncomeBs = 0;
  let netIncomeUsd = 0;
  for (const account of accounts.filter(item => item.isMovement)) {
    if (account.type === 'INGRESOS' || account.type === 'COSTOS' || account.type === 'GASTOS') {
      const movement = periodEntries.reduce((sum, entry) => {
        const value = balanceMovement(entry, account.code, account.type === 'INGRESOS' ? 'CREDIT' : 'DEBIT');
        return { bs: sum.bs + value.bs, usd: sum.usd + value.usd };
      }, { bs: 0, usd: 0 });
      netIncomeBs += movement.bs * (account.type === 'INGRESOS' ? 1 : -1);
      netIncomeUsd += movement.usd * (account.type === 'INGRESOS' ? 1 : -1);
    }
  }

  const isTreatmentCompatible = (account: Account) => {
    const treatment = account.cashFlowIndirectTreatment;
    if (!treatment || treatment === 'EXCLUDE') return true;
    if (treatment === 'NON_CASH_EXPENSE_ADD_BACK') return account.type === 'COSTOS' || account.type === 'GASTOS';
    if (treatment === 'NON_CASH_INCOME_DEDUCT') return account.type === 'INGRESOS';
    if (treatment === 'OPERATING_ASSET_INCREASE_DEDUCT') return account.type === 'ACTIVO';
    if (treatment === 'OPERATING_LIABILITY_INCREASE_ADD') return account.type === 'PASIVO';
    return false;
  };
  const invalidTreatments = accounts.some(account =>
    account.cashFlowIndirectTreatment !== undefined && !isTreatmentCompatible(account)
  );
  const classifiedAccounts = accounts.filter(account =>
    account.isMovement && account.cashFlowIndirectTreatment &&
    account.cashFlowIndirectTreatment !== 'EXCLUDE' && isTreatmentCompatible(account)
  );
  for (const account of classifiedAccounts) {
    const treatment = account.cashFlowIndirectTreatment!;
    const normal = account.type === 'PASIVO' || account.type === 'PATRIMONIO' ? 'CREDIT' : 'DEBIT';
    const opening = openingBasis.reduce((sum, entry) => {
      const value = balanceMovement(entry, account.code, normal);
      return { bs: sum.bs + value.bs, usd: sum.usd + value.usd };
    }, { bs: 0, usd: 0 });
    const periodChange = periodEntries.reduce((sum, entry) => {
      const value = balanceMovement(entry, account.code, normal);
      return { bs: sum.bs + value.bs, usd: sum.usd + value.usd };
    }, { bs: 0, usd: 0 });
    const closing = { bs: opening.bs + periodChange.bs, usd: opening.usd + periodChange.usd };
    let adjustmentBs = 0;
    let adjustmentUsd = 0;
    if (treatment === 'NON_CASH_EXPENSE_ADD_BACK') {
      adjustmentBs = periodChange.bs;
      adjustmentUsd = periodChange.usd;
    } else if (treatment === 'NON_CASH_INCOME_DEDUCT') {
      adjustmentBs = -periodChange.bs;
      adjustmentUsd = -periodChange.usd;
    } else if (treatment === 'OPERATING_ASSET_INCREASE_DEDUCT') {
      adjustmentBs = -periodChange.bs;
      adjustmentUsd = -periodChange.usd;
    } else if (treatment === 'OPERATING_LIABILITY_INCREASE_ADD') {
      adjustmentBs = periodChange.bs;
      adjustmentUsd = periodChange.usd;
    }
    accountRows.push({
      accountCode: account.code, accountName: account.name, treatment,
      openingBalanceBs: round(opening.bs, 2), closingBalanceBs: round(closing.bs, 2),
      changeBs: round(periodChange.bs, 2), adjustmentBs: round(adjustmentBs, 2),
      openingBalanceUsd: round(opening.usd, 2), closingBalanceUsd: round(closing.usd, 2),
      changeUsd: round(periodChange.usd, 2), adjustmentUsd: round(adjustmentUsd, 2)
    });
  }

  const nonCash = accountRows.filter(row =>
    row.treatment === 'NON_CASH_EXPENSE_ADD_BACK' || row.treatment === 'NON_CASH_INCOME_DEDUCT'
  );
  const workingCapital = accountRows.filter(row =>
    row.treatment === 'OPERATING_ASSET_INCREASE_DEDUCT' || row.treatment === 'OPERATING_LIABILITY_INCREASE_ADD'
  );
  const nonCashAdjustmentsBs = nonCash.reduce((sum, row) => sum + row.adjustmentBs, 0);
  const nonCashAdjustmentsUsd = nonCash.reduce((sum, row) => sum + row.adjustmentUsd, 0);
  const workingCapitalAdjustmentsBs = workingCapital.reduce((sum, row) => sum + row.adjustmentBs, 0);
  const workingCapitalAdjustmentsUsd = workingCapital.reduce((sum, row) => sum + row.adjustmentUsd, 0);
  const operatingCashFlowBs = round(netIncomeBs + nonCashAdjustmentsBs + workingCapitalAdjustmentsBs, 2);
  const operatingCashFlowUsd = round(netIncomeUsd + nonCashAdjustmentsUsd + workingCapitalAdjustmentsUsd, 2);
  const investingCashFlowBs = direct.activities.INVERSION.netBs;
  const investingCashFlowUsd = direct.activities.INVERSION.netUsd;
  const financingCashFlowBs = direct.activities.FINANCIACION.netBs;
  const financingCashFlowUsd = direct.activities.FINANCIACION.netUsd;
  const netChangeBs = round(operatingCashFlowBs + investingCashFlowBs + financingCashFlowBs, 2);
  const netChangeUsd = round(operatingCashFlowUsd + investingCashFlowUsd + financingCashFlowUsd, 2);
  const reconciliationDifferenceBs = round(direct.ledgerClosingCashBs - (direct.openingCashBs + netChangeBs), 2);
  const reconciliationDifferenceUsd = round(direct.ledgerClosingCashUsd - (direct.openingCashUsd + netChangeUsd), 2);
  const unclassifiedPnl = accounts.some(account =>
    account.isMovement && ['INGRESOS', 'COSTOS', 'GASTOS'].includes(account.type) &&
    periodEntries.some(entry => entry.items.some(item => item.accountCode === account.code)) &&
    account.cashFlowActivity !== 'OPERACION' && !(
      (account.type === 'INGRESOS' && account.cashFlowIndirectTreatment === 'NON_CASH_INCOME_DEDUCT') ||
      (['COSTOS', 'GASTOS'].includes(account.type) && account.cashFlowIndirectTreatment === 'NON_CASH_EXPENSE_ADD_BACK')
    )
  );
  const unclassifiedBalanceChanges = accounts.some(account =>
    account.isMovement && ['ACTIVO', 'PASIVO'].includes(account.type) &&
    !account.code.startsWith('1.1.1.') && account.cashFlowActivity !== 'EFECTIVO_EQUIVALENTE' &&
    account.cashFlowActivity !== 'INVERSION' && account.cashFlowActivity !== 'FINANCIACION' &&
    periodEntries.some(entry => entry.items.some(item => item.accountCode === account.code)) &&
    (!account.cashFlowIndirectTreatment || !isTreatmentCompatible(account))
  );
  const isFullyClassified = direct.isFullyClassified && !unclassifiedPnl && !unclassifiedBalanceChanges && !invalidTreatments;
  return {
    year, netIncomeBs: round(netIncomeBs, 2), netIncomeUsd: round(netIncomeUsd, 2),
    nonCashAdjustmentsBs: round(nonCashAdjustmentsBs, 2), nonCashAdjustmentsUsd: round(nonCashAdjustmentsUsd, 2),
    workingCapitalAdjustmentsBs: round(workingCapitalAdjustmentsBs, 2), workingCapitalAdjustmentsUsd: round(workingCapitalAdjustmentsUsd, 2),
    operatingCashFlowBs, operatingCashFlowUsd, investingCashFlowBs, investingCashFlowUsd,
    financingCashFlowBs, financingCashFlowUsd, netChangeBs, netChangeUsd,
    openingCashBs: direct.openingCashBs, openingCashUsd: direct.openingCashUsd,
    closingCashBs: round(direct.openingCashBs + netChangeBs, 2),
    closingCashUsd: round(direct.openingCashUsd + netChangeUsd, 2),
    ledgerClosingCashBs: direct.ledgerClosingCashBs, ledgerClosingCashUsd: direct.ledgerClosingCashUsd,
    reconciliationDifferenceBs, reconciliationDifferenceUsd,
    isReconciled: Math.abs(reconciliationDifferenceBs) <= 0.05 && Math.abs(reconciliationDifferenceUsd) <= 0.01,
    isFullyClassified, adjustments: accountRows, directBasis: direct
  };
}
