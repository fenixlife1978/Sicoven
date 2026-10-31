import type { Account, JournalEntry, JournalEntryItem } from './accounting';

export interface OpeningEntryBuildInput {
  companyId: string;
  periodStartDate: string;
  periodEndDate: string;
  openingDate: string;
  accounts: Account[];
  journalEntries: JournalEntry[];
  retainedEarningsAccountCode?: string;
}

const isIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const roundBs = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const roundUsd = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
type Totals = { debitBs: number; creditBs: number; debitUsd: number; creditUsd: number };
const emptyTotals = (): Totals => ({ debitBs: 0, creditBs: 0, debitUsd: 0, creditUsd: 0 });

/** Prepares an APERTURA draft only; it never persists or posts accounting data. */
export function buildOpeningEntryItems(input: OpeningEntryBuildInput): JournalEntryItem[] {
  const { companyId, periodEndDate, openingDate, accounts, journalEntries } = input;
  if (!companyId.trim()) throw new Error('Debe indicar la empresa del ejercicio.');
  if (!isIsoDate(input.periodStartDate) || !isIsoDate(periodEndDate) || !isIsoDate(openingDate) ||
      input.periodStartDate > periodEndDate || openingDate <= periodEndDate) {
    throw new Error('Las fechas de cierre y apertura deben ser válidas y mantener el orden cronológico.');
  }

  const accountByCode = new Map<string, Account>();
  for (const account of accounts) {
    if (accountByCode.has(account.code)) throw new Error('El catálogo contiene códigos de cuenta duplicados.');
    accountByCode.set(account.code, account);
  }
  if (journalEntries.some(entry => entry.companyId === companyId &&
      entry.type === 'APERTURA' && entry.date === openingDate)) {
    throw new Error('Ya existe un asiento de apertura para esta empresa y fecha.');
  }

  const balances = new Map<string, Totals>();
  const profitLoss = { bs: 0, usd: 0 };
  const priorEntries = journalEntries.filter(entry =>
    entry.companyId === companyId && entry.date <= periodEndDate
  );

  for (const entry of priorEntries) {
    const totals = emptyTotals();
    if (!Array.isArray(entry.items) || entry.items.length < 2) {
      throw new Error('El asiento #' + entry.entryNumber + ' no contiene líneas contables suficientes.');
    }
    for (const line of entry.items) {
      const account = accountByCode.get(line.accountCode);
      if (!account || !account.isMovement) {
        throw new Error('El asiento #' + entry.entryNumber + ' utiliza una cuenta inexistente o no imputable: ' + line.accountCode + '.');
      }
      const values = [line.debitBs, line.creditBs, line.debitUsd, line.creditUsd].map(Number);
      if (values.some(value => !Number.isFinite(value) || value < 0) ||
          (Number(line.debitBs) > 0 && Number(line.creditBs) > 0) ||
          (Number(line.debitUsd) > 0 && Number(line.creditUsd) > 0)) {
        throw new Error('El asiento #' + entry.entryNumber + ' contiene importes inválidos.');
      }
      totals.debitBs += Number(line.debitBs);
      totals.creditBs += Number(line.creditBs);
      totals.debitUsd += Number(line.debitUsd);
      totals.creditUsd += Number(line.creditUsd);

      if (account.type === 'INGRESOS') {
        if (entry.date >= input.periodStartDate) {
          profitLoss.bs += Number(line.creditBs) - Number(line.debitBs);
          profitLoss.usd += Number(line.creditUsd) - Number(line.debitUsd);
        }
      } else if (account.type === 'COSTOS' || account.type === 'GASTOS') {
        if (entry.date >= input.periodStartDate) {
          profitLoss.bs += Number(line.debitBs) - Number(line.creditBs);
          profitLoss.usd += Number(line.debitUsd) - Number(line.creditUsd);
        }
      } else {
        const current = balances.get(account.code) || emptyTotals();
        current.debitBs += Number(line.debitBs);
        current.creditBs += Number(line.creditBs);
        current.debitUsd += Number(line.debitUsd);
        current.creditUsd += Number(line.creditUsd);
        balances.set(account.code, current);
      }
    }
    if (Math.abs(totals.debitBs - totals.creditBs) > 0.02 ||
        Math.abs(totals.debitUsd - totals.creditUsd) > 0.0001) {
      throw new Error('El asiento #' + entry.entryNumber + ' no cuadra en ambas monedas; no se puede preparar la apertura.');
    }
  }

  const resultBs = roundBs(profitLoss.bs);
  const resultUsd = roundUsd(profitLoss.usd);
  if (Math.abs(resultBs) > 0.01 || Math.abs(resultUsd) > 0.000001) {
    const retained = input.retainedEarningsAccountCode
      ? accountByCode.get(input.retainedEarningsAccountCode)
      : undefined;
    if (!retained || retained.type !== 'PATRIMONIO' || !retained.isMovement) {
      throw new Error('Seleccione una cuenta imputable de patrimonio para trasladar el resultado acumulado del ejercicio.');
    }
    const current = balances.get(retained.code) || emptyTotals();
    if (resultBs >= 0) current.creditBs += resultBs;
    else current.debitBs += Math.abs(resultBs);
    if (resultUsd >= 0) current.creditUsd += resultUsd;
    else current.debitUsd += Math.abs(resultUsd);
    balances.set(retained.code, current);
  }

  const items: JournalEntryItem[] = [];
  for (const [code, totals] of balances) {
    const account = accountByCode.get(code)!;
    const netBs = totals.debitBs - totals.creditBs;
    const netUsd = totals.debitUsd - totals.creditUsd;
    // The signed ledger balance already determines the side: debit minus credit.
    // Do not invert credit-nature accounts; their negative net is a credit balance.
    const debitBs = roundBs(Math.max(0, netBs));
    const creditBs = roundBs(Math.max(0, -netBs));
    const debitUsd = roundUsd(Math.max(0, netUsd));
    const creditUsd = roundUsd(Math.max(0, -netUsd));
    if (debitBs || creditBs || debitUsd || creditUsd) {
      items.push({
        accountCode: code, accountName: account.name, debitBs, creditBs, debitUsd, creditUsd,
        description: 'Saldo de apertura trasladado al ' + openingDate
      });
    }
  }
  if (items.length < 2) throw new Error('No existen saldos de balance suficientes para generar un asiento de apertura.');
  const total = items.reduce((sum, item) => ({
    debitBs: sum.debitBs + item.debitBs, creditBs: sum.creditBs + item.creditBs,
    debitUsd: sum.debitUsd + item.debitUsd, creditUsd: sum.creditUsd + item.creditUsd
  }), emptyTotals());
  if (Math.abs(total.debitBs - total.creditBs) > 0.02 ||
      Math.abs(total.debitUsd - total.creditUsd) > 0.0001) {
    throw new Error('Los saldos históricos no cuadran en ambas monedas. Regularice el balance antes de abrir el ejercicio.');
  }
  return items;
}
