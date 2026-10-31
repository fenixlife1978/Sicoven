export interface TrialBalanceTotals {
  totalDebitBs: number;
  totalCreditBs: number;
  debitBalancesBs: number;
  creditBalancesBs: number;
  totalDebitUsd: number;
  totalCreditUsd: number;
  debitBalancesUsd: number;
  creditBalancesUsd: number;
}

export interface AccountMovementTotals {
  debitBs: number;
  creditBs: number;
  debitUsd: number;
  creditUsd: number;
}

export type BalanceNature = 'DEUDOR' | 'ACREEDOR';

export interface BalanceSheetTotals {
  totalAssetsBs: number;
  totalLiabilitiesAndEquityBs: number;
  totalAssetsUsd: number;
  totalLiabilitiesAndEquityUsd: number;
}

/** Keep report calculations isolated to the selected company's ledger. */
export function filterEntriesByCompany<T extends { companyId: string }>(
  entries: T[],
  companyId: string
): T[] {
  return entries.filter(entry => entry.companyId === companyId);
}

/** The statement of financial position must reconcile independently in both currencies. */
export function isBalanceSheetBalanced(
  totals: BalanceSheetTotals,
  toleranceBs = 0.05,
  toleranceUsd = 0.000005
): boolean {
  if (!Number.isFinite(toleranceBs) || toleranceBs < 0 ||
      !Number.isFinite(toleranceUsd) || toleranceUsd < 0) return false;
  const values = Object.values(totals);
  if (values.some(value => !Number.isFinite(value))) return false;
  return (
    Math.abs(totals.totalAssetsBs - totals.totalLiabilitiesAndEquityBs) < toleranceBs &&
    Math.abs(totals.totalAssetsUsd - totals.totalLiabilitiesAndEquityUsd) < toleranceUsd
  );
}

/** An account is active if it has movement in either presentation currency. */
export function hasAccountMovement(totals: AccountMovementTotals): boolean {
  return [
    totals.debitBs,
    totals.creditBs,
    totals.debitUsd,
    totals.creditUsd
  ].some(value => Number.isFinite(value) && value > 0);
}

/** Trial balance must reconcile in both Bs and USD, including net balances. */
export function isTrialBalanceBalanced(totals: TrialBalanceTotals, tolerance = 0.05): boolean {
  if (!Number.isFinite(tolerance) || tolerance < 0) return false;
  const values = Object.values(totals);
  if (values.some(value => !Number.isFinite(value) || value < 0)) return false;
  return (
    Math.abs(totals.totalDebitBs - totals.totalCreditBs) < tolerance &&
    Math.abs(totals.debitBalancesBs - totals.creditBalancesBs) < tolerance &&
    Math.abs(totals.totalDebitUsd - totals.totalCreditUsd) < tolerance &&
    Math.abs(totals.debitBalancesUsd - totals.creditBalancesUsd) < tolerance
  );
}

/** Nature label follows the account's normal balance, not the raw debit-credit sign. */
export function getAccountBalanceNature(
  balance: number,
  isDebitNature: boolean
): BalanceNature {
  if (!Number.isFinite(balance) || balance === 0) {
    return isDebitNature ? 'DEUDOR' : 'ACREEDOR';
  }
  const isNormalBalance = balance > 0;
  return isNormalBalance === isDebitNature ? 'DEUDOR' : 'ACREEDOR';
}
