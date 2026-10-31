import type { Account, BankAccount, CashFlowActivity, JournalEntry } from './accounting';

export type CashFlowSection = 'OPERACION' | 'INVERSION' | 'FINANCIACION' | 'SIN_CLASIFICAR';

export interface CashFlowTotals {
  receiptsBs: number;
  paymentsBs: number;
  netBs: number;
  receiptsUsd: number;
  paymentsUsd: number;
  netUsd: number;
}

export interface CashFlowClassificationCandidate {
  accountCode: string;
  accountName: string;
  activity?: CashFlowActivity;
}

export interface CashFlowLine {
  entryId: string;
  entryNumber: number;
  date: string;
  description: string;
  referenceDoc?: string;
  accountCode: string;
  accountName: string;
  activity: CashFlowSection;
  receiptsBs: number;
  paymentsBs: number;
  receiptsUsd: number;
  paymentsUsd: number;
}

export interface CashFlowReport {
  year: number;
  openingCashBs: number;
  openingCashUsd: number;
  netChangeBs: number;
  netChangeUsd: number;
  closingCashBs: number;
  closingCashUsd: number;
  ledgerClosingCashBs: number;
  ledgerClosingCashUsd: number;
  reconciliationDifferenceBs: number;
  reconciliationDifferenceUsd: number;
  activities: Record<CashFlowSection, CashFlowTotals>;
  lines: CashFlowLine[];
  classificationCandidates: CashFlowClassificationCandidate[];
  unclassifiedNetBs: number;
  unclassifiedNetUsd: number;
  isFullyClassified: boolean;
  isReconciled: boolean;
}

const amount = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const zeroTotals = (): CashFlowTotals => ({
  receiptsBs: 0, paymentsBs: 0, netBs: 0,
  receiptsUsd: 0, paymentsUsd: 0, netUsd: 0
});
const isAnnualOpening = (entry: JournalEntry, year: number) =>
  entry.type === 'APERTURA' && entry.exerciseLink?.nextPeriodStartDate?.slice(0, 4) === String(year);
const counterpartAmount = (
  item: JournalEntry['items'][number],
  side: 'credit' | 'debit',
  currency: 'bs' | 'usd'
): number => {
  if (currency === 'bs') return side === 'credit' ? amount(item.creditBs) : amount(item.debitBs);
  return side === 'credit' ? amount(item.creditUsd) : amount(item.debitUsd);
};
const cashNet = (entry: JournalEntry, cashCodes: Set<string>) =>
  entry.items.reduce((sum, item) => cashCodes.has(item.accountCode)
    ? {
        bs: sum.bs + amount(item.debitBs) - amount(item.creditBs),
        usd: sum.usd + amount(item.debitUsd) - amount(item.creditUsd)
      }
    : sum, { bs: 0, usd: 0 });

/**
 * Direct-method cash flow from posted cash/bank journal lines.
 * Non-cash transactions are excluded. Transfers between cash equivalents net to zero.
 * Every external cash movement must be classified by its counterpart account; otherwise
 * the amount is shown as unclassified and the report cannot be marked complete.
 */
export function buildCashFlowReport(
  entries: JournalEntry[],
  accounts: Account[],
  bankAccounts: BankAccount[],
  companyId: string,
  year: number
): CashFlowReport {
  if (!companyId.trim() || !Number.isInteger(year) || year < 1) {
    throw new Error('La empresa y el ejercicio seleccionado deben ser válidos.');
  }
  const start = String(year).padStart(4, '0') + '-01-01';
  const end = String(year).padStart(4, '0') + '-12-31';
  const companyEntries = entries
    .filter(entry => entry.companyId === companyId && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && entry.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.entryNumber - b.entryNumber);
  const accountsByCode = new Map(accounts.map(account => [account.code, account] as const));
  const cashCodes = new Set([
    ...bankAccounts.filter(bank => bank.companyId === companyId).map(bank => bank.accountCode),
    ...accounts.filter(account => account.isMovement && (
      account.cashFlowActivity === 'EFECTIVO_EQUIVALENTE' ||
      account.code.startsWith('1.1.1.')
    )).map(account => account.code)
  ]);
  const annualOpenings = companyEntries.filter(entry => isAnnualOpening(entry, year));
  const annualOpening = annualOpenings.at(-1);
  // A linked annual opening already carries the prior year's closing balance.
  // Never add it on top of the historical movements that it replaces.
  const opening = annualOpening
    ? cashNet(annualOpening, cashCodes)
    : companyEntries.filter(entry => entry.date < start).reduce((sum, entry) => {
        const net = cashNet(entry, cashCodes);
        return { bs: sum.bs + net.bs, usd: sum.usd + net.usd };
      }, { bs: 0, usd: 0 });

  const activities: Record<CashFlowSection, CashFlowTotals> = {
    OPERACION: zeroTotals(),
    INVERSION: zeroTotals(),
    FINANCIACION: zeroTotals(),
    SIN_CLASIFICAR: zeroTotals()
  };
  const lines: CashFlowLine[] = [];
  const addLine = (line: CashFlowLine) => {
    const existing = lines.find(item =>
      item.entryId === line.entryId && item.accountCode === line.accountCode && item.activity === line.activity
    );
    if (existing) {
      existing.receiptsBs += line.receiptsBs;
      existing.paymentsBs += line.paymentsBs;
      existing.receiptsUsd += line.receiptsUsd;
      existing.paymentsUsd += line.paymentsUsd;
      return;
    }
    lines.push(line);
  };
  const candidates = new Map<string, CashFlowClassificationCandidate>();
  let netChangeBs = 0, netChangeUsd = 0;
  let unclassifiedNetBs = 0, unclassifiedNetUsd = 0;
  const toleranceBs = 0.05, toleranceUsd = 0.000005;

  const recordUnclassified = (net: number, currency: 'bs' | 'usd') => {
    if (currency === 'bs') {
      if (net > toleranceBs) activities.SIN_CLASIFICAR.receiptsBs += net;
      else if (net < -toleranceBs) activities.SIN_CLASIFICAR.paymentsBs += Math.abs(net);
      activities.SIN_CLASIFICAR.netBs += net;
      unclassifiedNetBs += net;
    } else {
      if (net > toleranceUsd) activities.SIN_CLASIFICAR.receiptsUsd += net;
      else if (net < -toleranceUsd) activities.SIN_CLASIFICAR.paymentsUsd += Math.abs(net);
      activities.SIN_CLASIFICAR.netUsd += net;
      unclassifiedNetUsd += net;
    }
  };

  const classifyCurrency = (
    entry: JournalEntry,
    net: number,
    currency: 'bs' | 'usd',
    tolerance: number
  ) => {
    if (Math.abs(net) <= tolerance) return;
    const side: 'credit' | 'debit' = net > 0 ? 'credit' : 'debit';
    const counterpartLines = entry.items.filter(item =>
      !cashCodes.has(item.accountCode) && counterpartAmount(item, side, currency) > 0
    );
    const counterpartTotal = counterpartLines.reduce((sum, item) =>
      sum + counterpartAmount(item, side, currency), 0
    );
    if (Math.abs(counterpartTotal - Math.abs(net)) > tolerance || counterpartLines.length === 0) {
      recordUnclassified(net, currency);
      addLine({
        entryId: entry.id, entryNumber: entry.entryNumber, date: entry.date,
        description: 'Movimiento de efectivo sin contrapartida conciliada: ' + entry.description,
        referenceDoc: entry.referenceDoc, accountCode: 'NO-CLASIFICADO',
        accountName: 'Contrapartida no conciliada', activity: 'SIN_CLASIFICAR',
        receiptsBs: currency === 'bs' && net > 0 ? net : 0,
        paymentsBs: currency === 'bs' && net < 0 ? Math.abs(net) : 0,
        receiptsUsd: currency === 'usd' && net > 0 ? net : 0,
        paymentsUsd: currency === 'usd' && net < 0 ? Math.abs(net) : 0
      });
      return;
    }
    for (const item of counterpartLines) {
      const account = accountsByCode.get(item.accountCode);
      const activity = account?.cashFlowActivity;
      const section: CashFlowSection =
        activity === 'OPERACION' || activity === 'INVERSION' || activity === 'FINANCIACION'
          ? activity
          : 'SIN_CLASIFICAR';
      const value = counterpartAmount(item, side, currency);
      if (section === 'SIN_CLASIFICAR') {
        const signedValue = net > 0 ? value : -value;
        recordUnclassified(signedValue, currency);
        addLine({
          entryId: entry.id, entryNumber: entry.entryNumber, date: entry.date,
          description: item.description || entry.description, referenceDoc: entry.referenceDoc,
          accountCode: item.accountCode, accountName: account?.name || item.accountName,
          activity: 'SIN_CLASIFICAR',
          receiptsBs: currency === 'bs' && signedValue > 0 ? value : 0,
          paymentsBs: currency === 'bs' && signedValue < 0 ? value : 0,
          receiptsUsd: currency === 'usd' && signedValue > 0 ? value : 0,
          paymentsUsd: currency === 'usd' && signedValue < 0 ? value : 0
        });
        candidates.set(item.accountCode, { accountCode: item.accountCode, accountName: account?.name || item.accountName, activity });
        continue;
      }
      const totals = activities[section];
      if (currency === 'bs') {
        if (net > 0) totals.receiptsBs += value;
        else totals.paymentsBs += value;
        totals.netBs += net > 0 ? value : -value;
      } else {
        if (net > 0) totals.receiptsUsd += value;
        else totals.paymentsUsd += value;
        totals.netUsd += net > 0 ? value : -value;
      }
      addLine({
        entryId: entry.id, entryNumber: entry.entryNumber, date: entry.date,
        description: item.description || entry.description, referenceDoc: entry.referenceDoc,
        accountCode: item.accountCode, accountName: account?.name || item.accountName,
        activity: section,
        receiptsBs: currency === 'bs' && net > 0 ? value : 0,
        paymentsBs: currency === 'bs' && net < 0 ? value : 0,
        receiptsUsd: currency === 'usd' && net > 0 ? value : 0,
        paymentsUsd: currency === 'usd' && net < 0 ? value : 0
      });
      candidates.set(item.accountCode, { accountCode: item.accountCode, accountName: account?.name || item.accountName, activity });
    }
  };

  const periodEntries = companyEntries.filter(entry => entry.date >= start && !isAnnualOpening(entry, year));
  for (const entry of periodEntries) {
    const net = cashNet(entry, cashCodes);
    netChangeBs += net.bs;
    netChangeUsd += net.usd;
    if (Math.abs(net.bs) <= toleranceBs && Math.abs(net.usd) <= toleranceUsd) continue;
    classifyCurrency(entry, net.bs, 'bs', toleranceBs);
    classifyCurrency(entry, net.usd, 'usd', toleranceUsd);
    for (const item of entry.items) {
      if (cashCodes.has(item.accountCode)) continue;
      const account = accountsByCode.get(item.accountCode);
      if (!account) continue;
      if (item.creditBs || item.debitBs || item.creditUsd || item.debitUsd) {
        candidates.set(item.accountCode, { accountCode: item.accountCode, accountName: account.name, activity: account.cashFlowActivity });
      }
    }
  }

  // Reconcile against the same opening basis: a linked annual opening supersedes
  // the prior-year ledger movements for this year's opening balance.
  const ledgerEntries = annualOpening ? [annualOpening, ...periodEntries] : companyEntries;
  const ledgerClosing = ledgerEntries.reduce((sum, entry) => {
    const net = cashNet(entry, cashCodes);
    return { bs: sum.bs + net.bs, usd: sum.usd + net.usd };
  }, { bs: 0, usd: 0 });
  const closingCashBs = opening.bs + netChangeBs;
  const closingCashUsd = opening.usd + netChangeUsd;
  const reconciliationDifferenceBs = ledgerClosing.bs - closingCashBs;
  const reconciliationDifferenceUsd = ledgerClosing.usd - closingCashUsd;
  const isReconciled = Math.abs(reconciliationDifferenceBs) <= toleranceBs &&
    Math.abs(reconciliationDifferenceUsd) <= toleranceUsd;
  const unclassifiedTotals = activities.SIN_CLASIFICAR;
  const isFullyClassified =
    unclassifiedTotals.receiptsBs <= toleranceBs &&
    unclassifiedTotals.paymentsBs <= toleranceBs &&
    unclassifiedTotals.receiptsUsd <= toleranceUsd &&
    unclassifiedTotals.paymentsUsd <= toleranceUsd;
  return {
    year, openingCashBs: opening.bs, openingCashUsd: opening.usd,
    netChangeBs, netChangeUsd, closingCashBs, closingCashUsd,
    ledgerClosingCashBs: ledgerClosing.bs, ledgerClosingCashUsd: ledgerClosing.usd,
    reconciliationDifferenceBs, reconciliationDifferenceUsd,
    activities, lines,
    classificationCandidates: [...candidates.values()].sort((a, b) => a.accountCode.localeCompare(b.accountCode, undefined, { numeric: true })),
    unclassifiedNetBs, unclassifiedNetUsd, isFullyClassified, isReconciled
  };
}
