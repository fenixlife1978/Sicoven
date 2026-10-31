import type { Account, JournalEntry } from './accounting';

export type FinancialDisclosureKind =
  | 'ACCOUNTING_POLICY'
  | 'ESTIMATE'
  | 'COMMITMENT'
  | 'CONTINGENCY'
  | 'RELATED_PARTY'
  | 'SUBSEQUENT_EVENT'
  | 'OTHER';

export interface FinancialDisclosure {
  id: string;
  companyId: string;
  fiscalYear: number;
  noteNumber: number;
  title: string;
  kind: FinancialDisclosureKind;
  body: string;
  status: 'DRAFT' | 'REVIEWED';
  sourceEntryIds: string[];
  sourceAccountCodes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DisclosureAccountMovement {
  accountCode: string;
  accountName: string;
  debitBs: number;
  creditBs: number;
  debitUsd: number;
  creditUsd: number;
  balanceBs: number;
  balanceUsd: number;
  entryIds: string[];
}

export function validateFinancialDisclosure(
  value: unknown,
  companyIds?: Set<string>
): string | null {
  if (!value || typeof value !== 'object') return 'La nota financiera no es un objeto válido.';
  const item = value as Partial<FinancialDisclosure>;
  if (typeof item.id !== 'string' || !item.id.trim()) return 'La nota debe tener identificador.';
  if (typeof item.companyId !== 'string' || !item.companyId.trim()) return 'La nota debe estar vinculada a una empresa.';
  if (companyIds && !companyIds.has(item.companyId)) return 'La nota referencia una empresa inexistente.';
  if (!Number.isInteger(item.fiscalYear) || Number(item.fiscalYear) < 1900 || Number(item.fiscalYear) > 9999) return 'El ejercicio de la nota no es válido.';
  if (!Number.isInteger(item.noteNumber) || Number(item.noteNumber) < 1) return 'El número de nota debe ser positivo.';
  if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 180) return 'El título es obligatorio y no puede superar 180 caracteres.';
  const kinds: FinancialDisclosureKind[] = ['ACCOUNTING_POLICY','ESTIMATE','COMMITMENT','CONTINGENCY','RELATED_PARTY','SUBSEQUENT_EVENT','OTHER'];
  if (!kinds.includes(item.kind as FinancialDisclosureKind)) return 'La categoría de la nota no es válida.';
  if (typeof item.body !== 'string' || !item.body.trim() || item.body.length > 12000) return 'El contenido es obligatorio y no puede superar 12.000 caracteres.';
  if (item.status !== 'DRAFT' && item.status !== 'REVIEWED') return 'El estado de revisión no es válido.';
  if (!Array.isArray(item.sourceEntryIds) || item.sourceEntryIds.some(id => typeof id !== 'string')) return 'Las referencias a asientos no son válidas.';
  if (!Array.isArray(item.sourceAccountCodes) || item.sourceAccountCodes.some(code => typeof code !== 'string')) return 'Las referencias a cuentas no son válidas.';
  if (typeof item.createdAt !== 'string' || typeof item.updatedAt !== 'string') return 'Faltan las fechas de auditoría de la nota.';
  return null;
}

/** Importes agregados desde asientos contabilizados; Bs. y USD nunca se convierten entre sí. */
export function buildDisclosureAccountMovements(
  entries: JournalEntry[],
  accounts: Account[],
  companyId: string,
  fiscalYear: number
): DisclosureAccountMovement[] {
  if (!companyId.trim()) throw new Error('La empresa del anexo cuantitativo no es válida.');
  if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 9999) {
    throw new Error('El ejercicio del anexo cuantitativo no es válido.');
  }

  const start = `${fiscalYear}-01-01`;
  const end = `${fiscalYear}-12-31`;
  const scoped = entries.filter(entry =>
    entry.companyId === companyId && entry.date >= start && entry.date <= end && entry.type !== 'CIERRE'
  );
  const accountTypes = new Map(accounts.map(account => [account.code, account.type]));
  const byCode = new Map<string, DisclosureAccountMovement>();
  for (const entry of scoped) {
    for (const line of entry.items) {
      if (!line.accountCode || !accountTypes.has(line.accountCode)) {
        throw new Error(`El asiento ${entry.id} contiene una cuenta inexistente en el anexo cuantitativo.`);
      }
      const amounts = [
        ['debitBs', line.debitBs], ['creditBs', line.creditBs],
        ['debitUsd', line.debitUsd], ['creditUsd', line.creditUsd]
      ] as const;
      for (const [field, amount] of amounts) {
        if (!Number.isFinite(amount) || amount < 0) {
          throw new Error(`El asiento ${entry.id}, cuenta ${line.accountCode}: ${field} debe ser un importe finito y no negativo.`);
        }
      }
      const row = byCode.get(line.accountCode) || {
        accountCode: line.accountCode,
        accountName: line.accountName,
        debitBs: 0, creditBs: 0, debitUsd: 0, creditUsd: 0,
        balanceBs: 0, balanceUsd: 0, entryIds: []
      };
      row.debitBs += line.debitBs;
      row.creditBs += line.creditBs;
      row.debitUsd += line.debitUsd;
      row.creditUsd += line.creditUsd;
      if (!row.entryIds.includes(entry.id)) row.entryIds.push(entry.id);
      byCode.set(line.accountCode, row);
    }
  }
  for (const row of byCode.values()) {
    const type = accountTypes.get(row.accountCode);
    const creditNormal = type === 'INGRESOS' || type === 'PASIVO' || type === 'PATRIMONIO';
    row.balanceBs = creditNormal ? row.creditBs - row.debitBs : row.debitBs - row.creditBs;
    row.balanceUsd = creditNormal ? row.creditUsd - row.debitUsd : row.debitUsd - row.creditUsd;
  }
  return [...byCode.values()].filter(row =>
    Math.abs(row.debitBs) > 0.004 || Math.abs(row.creditBs) > 0.004 ||
    Math.abs(row.debitUsd) > 0.000004 || Math.abs(row.creditUsd) > 0.000004
  ).sort((a,b) => a.accountCode.localeCompare(b.accountCode, undefined, { numeric: true }));
}
