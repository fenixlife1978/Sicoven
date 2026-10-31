import type { SupplierAdvanceSettlement } from './supplierAdvanceSettlement';
import type { PurchaseRecord } from './accounting';
import type { SupplierDirectAdvance } from './supplierDirectAdvance';

export interface SupplierAdvanceBalance {
  supplierRif: string;
  supplierName: string;
  totalCreditBs: number;
  totalCreditUsd: number;
  outstandingBs: number;
  outstandingUsd: number;
  creditNoteCount: number;
  directAdvanceCount: number;
}

const moneyBs = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const moneyUsd = (value: number) => Math.round((value + Number.EPSILON) * 1000000) / 1000000;

/** Sums only active supplier credit notes; reversed/cancelled notes cannot fund a later settlement. */
export function calculateSupplierAdvanceBalance(
  supplierRif: string,
  purchases: PurchaseRecord[],
  directAdvances: SupplierDirectAdvance[] = []
): SupplierAdvanceBalance {
  const normalizedRif = String(supplierRif || '').trim().toUpperCase();
  if (!normalizedRif) throw new Error('Debe identificar el RIF del proveedor.');
  const notes = purchases.filter(item =>
    item.documentType === '03' &&
    !item.isCancelled &&
    String(item.supplierRif || '').trim().toUpperCase() === normalizedRif
  );
  const direct = directAdvances.filter(item => !item.isReversed &&
    String(item.supplierRif || '').trim().toUpperCase() === normalizedRif);
  const totalDirectBs = moneyBs(direct.reduce((sum, item) => sum + Number(item.bookValueBs || 0), 0));
  const totalDirectUsd = moneyUsd(direct.reduce((sum, item) => sum + Number(item.amountUsd || 0), 0));
  const totalCreditUsd = moneyUsd(notes.reduce((sum, item) => sum + Number(item.supplierAdvanceUsd || 0), 0) + totalDirectUsd);
  const totalCreditBs = moneyBs(notes.reduce((sum, item) => sum + Number(item.supplierAdvanceBs || 0), 0) + totalDirectBs);
  return {
    supplierRif: normalizedRif,
    supplierName: notes[0]?.supplierName || direct[0]?.supplierName || '',
    totalCreditBs,
    totalCreditUsd,
    outstandingBs: totalCreditBs,
    outstandingUsd: totalCreditUsd,
    creditNoteCount: notes.length,
    directAdvanceCount: direct.length
  };
}

/** Computes remaining advances after active refunds/applications; reversed settlements restore the balance. */
export function calculateOutstandingSupplierAdvance(
  supplierRif: string,
  purchases: PurchaseRecord[],
  settlements: SupplierAdvanceSettlement[],
  companyId: string,
  directAdvances: SupplierDirectAdvance[] = []
): SupplierAdvanceBalance {
  const balance = calculateSupplierAdvanceBalance(
    supplierRif,
    purchases.filter(item => item.companyId === companyId),
    directAdvances.filter(item => item.companyId === companyId)
  );
  const rif = String(supplierRif || '').trim().toUpperCase();
  const active = settlements.filter(item =>
    item.companyId === companyId &&
    !item.isReversed &&
    String(item.supplierRif || '').trim().toUpperCase() === rif
  );
  const usedUsd = active.reduce((sum, item) => sum + Number(item.amountUsd || 0), 0);
  const usedBs = active.reduce((sum, item) => sum + Number(item.advanceBookValueBs ?? item.amountBs ?? 0), 0);
  const outstandingUsd = moneyUsd(balance.totalCreditUsd - usedUsd);
  const outstandingBs = moneyBs(balance.totalCreditBs - usedBs);
  if (outstandingUsd < -0.005 || outstandingBs < -0.02) {
    throw new Error('Las liquidaciones históricas exceden los anticipos registrados. Se requiere conciliación antes de continuar.');
  }
  return { ...balance, outstandingUsd: Math.max(0, outstandingUsd), outstandingBs: Math.max(0, outstandingBs) };
}

/** A refund or a future-invoice application may never exceed the available supplier advance. */
export function validateSupplierAdvanceSettlement(
  availableUsd: number,
  requestedUsd: number,
  supplierRif: string,
  targetSupplierRif?: string
): string | null {
  if (!Number.isFinite(availableUsd) || availableUsd < 0 ||
      !Number.isFinite(requestedUsd) || requestedUsd <= 0) {
    return 'El saldo disponible y el importe a liquidar deben ser válidos; el importe debe ser mayor que cero.';
  }
  if (requestedUsd > availableUsd + 0.000005) return 'La liquidación supera el saldo a favor disponible del proveedor.';
  const source = String(supplierRif || '').trim().toUpperCase();
  if (!source) return 'La liquidación no tiene un proveedor de origen identificado.';
  if (targetSupplierRif != null && String(targetSupplierRif).trim().toUpperCase() !== source) {
    return 'El saldo a favor solo puede aplicarse a facturas del mismo proveedor (RIF).';
  }
  return null;
}
