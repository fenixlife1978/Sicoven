import type { Account } from './accounting';

export interface SupplierDirectAdvance {
  id: string;
  companyId: string;
  supplierRif: string;
  supplierName: string;
  date: string;
  amountUsd: number;
  bookValueBs: number;
  bcvRate: number;
  treasuryAccountCode: string;
  paymentCurrency: 'BS' | 'USD';
  paidAmount: number;
  reference: string;
  support?: string;
  journalEntryId: string;
  createdAt: string;
  isReversed?: boolean;
  reversedByJournalEntryId?: string;
}

export interface SupplierDirectAdvanceDraft {
  supplierRif: string;
  supplierName: string;
  date: string;
  amountUsd: number;
  bcvRate: number;
  treasuryAccountCode: string;
  paymentCurrency: 'BS' | 'USD';
  paidAmount: number;
  reference: string;
  support?: string;
}

export interface SupplierDirectAdvanceAllocation {
  directAdvanceId: string;
  amountUsd: number;
  bookValueBs: number;
}

export interface SupplierDirectAdvanceConsumption {
  companyId: string;
  supplierRif: string;
  allocations: SupplierDirectAdvanceAllocation[];
  isReversed?: boolean;
}

const roundUsd = (value: number) => Math.round((value + Number.EPSILON) * 1000000) / 1000000;
const roundBs = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function validateSupplierDirectAdvanceDraft(
  draft: SupplierDirectAdvanceDraft,
  companyId: string,
  accounts: Account[]
): string | null {
  if (!draft || !companyId.trim()) return 'No se pudo identificar la empresa del anticipo.';
  const rif = String(draft.supplierRif || '').trim().toUpperCase();
  if (!rif || !String(draft.supplierName || '').trim()) return 'Debe identificar el RIF y la razón social del proveedor.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date || '')) return 'La fecha del anticipo no es válida.';
  const [year, month, day] = draft.date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return 'La fecha del anticipo no es válida.';
  if (![draft.amountUsd, draft.bcvRate, draft.paidAmount].every(Number.isFinite) ||
      draft.amountUsd <= 0 || draft.bcvRate <= 0 || draft.paidAmount <= 0) {
    return 'El importe, la tasa BCV y el desembolso deben ser mayores que cero.';
  }
  if (!['BS', 'USD'].includes(draft.paymentCurrency)) return 'La moneda del desembolso no es válida.';
  const expectedPaid = draft.paymentCurrency === 'USD' ? draft.amountUsd : roundBs(draft.amountUsd * draft.bcvRate);
  if (Math.abs(draft.paidAmount - expectedPaid) > (draft.paymentCurrency === 'USD' ? 0.005 : 0.02)) {
    return 'El importe desembolsado no concilia con el anticipo y la tasa BCV.';
  }
  if (!String(draft.reference || '').trim()) return 'La referencia del desembolso es obligatoria.';
  if (!String(draft.support || '').trim()) return 'Debe identificar el soporte o comprobante documental del desembolso.';
  const account = accounts.find(item => item.code === draft.treasuryAccountCode);
  if (!account || !account.isMovement || account.type !== 'ACTIVO' ||
      !/^1\.1\.1\./.test(account.code)) {
    return 'Seleccione una cuenta auxiliar real de Caja/Banco; no se permiten cuentas de gasto, inventario o pasivo.';
  }
  return null;
}

/** Remaining direct advances are isolated by company and supplier, with reversals restoring availability. */
export function calculateOutstandingDirectSupplierAdvance(
  companyId: string,
  supplierRif: string,
  advances: SupplierDirectAdvance[],
  consumptions: SupplierDirectAdvanceConsumption[]
): { totalUsd: number; totalBookValueBs: number; outstandingUsd: number; outstandingBookValueBs: number } {
  const rif = String(supplierRif || '').trim().toUpperCase();
  if (!companyId || !rif) throw new Error('La empresa y el RIF del proveedor son obligatorios.');
  const sources = advances.filter(item => item.companyId === companyId && !item.isReversed &&
    String(item.supplierRif || '').trim().toUpperCase() === rif);
  const totalUsd = roundUsd(sources.reduce((sum, item) => sum + Number(item.amountUsd), 0));
  const totalBookValueBs = roundBs(sources.reduce((sum, item) => sum + Number(item.bookValueBs), 0));
  const active = consumptions.filter(item => item.companyId === companyId && !item.isReversed &&
    String(item.supplierRif || '').trim().toUpperCase() === rif);
  const usedUsd = roundUsd(active.flatMap(item => item.allocations || []).reduce((sum, item) => sum + Number(item.amountUsd), 0));
  const usedBs = roundBs(active.flatMap(item => item.allocations || []).reduce((sum, item) => sum + Number(item.bookValueBs), 0));
  if (usedUsd > totalUsd + 0.000005 || usedBs > totalBookValueBs + 0.02) {
    throw new Error('Las aplicaciones y reembolsos superan los anticipos directos vigentes; se requiere conciliación.');
  }
  return {
    totalUsd, totalBookValueBs,
    outstandingUsd: roundUsd(Math.max(0, totalUsd - usedUsd)),
    outstandingBookValueBs: roundBs(Math.max(0, totalBookValueBs - usedBs))
  };
}

/** FIFO allocation preserves each direct disbursement's historical carrying value. */
export function allocateDirectSupplierAdvance(
  sources: SupplierDirectAdvance[],
  consumptions: SupplierDirectAdvanceConsumption[],
  companyId: string,
  supplierRif: string,
  requestedUsd: number
): SupplierDirectAdvanceAllocation[] {
  if (!Number.isFinite(requestedUsd) || requestedUsd <= 0) throw new Error('El importe a aplicar debe ser mayor que cero.');
  const rif = String(supplierRif || '').trim().toUpperCase();
  const eligible = sources.filter(item => item.companyId === companyId && !item.isReversed &&
    String(item.supplierRif || '').trim().toUpperCase() === rif)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const used = new Map<string, { usd: number; bs: number }>();
  for (const consumption of consumptions) {
    if (consumption.companyId !== companyId || consumption.isReversed ||
        String(consumption.supplierRif || '').trim().toUpperCase() !== rif) continue;
    for (const allocation of consumption.allocations || []) {
      const current = used.get(allocation.directAdvanceId) || { usd: 0, bs: 0 };
      current.usd = roundUsd(current.usd + Number(allocation.amountUsd));
      current.bs = roundBs(current.bs + Number(allocation.bookValueBs));
      used.set(allocation.directAdvanceId, current);
    }
  }
  let remaining = roundUsd(requestedUsd);
  const result: SupplierDirectAdvanceAllocation[] = [];
  for (const source of eligible) {
    if (remaining <= 0.000005) break;
    if (!Number.isFinite(source.amountUsd) || source.amountUsd <= 0 ||
        !Number.isFinite(source.bookValueBs) || source.bookValueBs <= 0) {
      throw new Error('Existe un anticipo directo con importes históricos inválidos.');
    }
    const consumed = used.get(source.id) || { usd: 0, bs: 0 };
    const availableUsd = roundUsd(source.amountUsd - consumed.usd);
    const availableBs = roundBs(source.bookValueBs - consumed.bs);
    if (availableUsd < -0.000005 || availableBs < -0.02) {
      throw new Error('Las liquidaciones exceden el anticipo directo ' + source.id + '.');
    }
    if (availableUsd <= 0.000005) continue;
    const takeUsd = Math.min(remaining, availableUsd);
    const takeBs = takeUsd >= availableUsd - 0.000005
      ? Math.max(0, availableBs)
      : roundBs(availableBs * takeUsd / availableUsd);
    result.push({ directAdvanceId: source.id, amountUsd: roundUsd(takeUsd), bookValueBs: takeBs });
    remaining = roundUsd(remaining - takeUsd);
  }
  if (remaining > 0.000005) throw new Error('La operación supera el saldo disponible de anticipos directos del proveedor.');
  return result;
}
