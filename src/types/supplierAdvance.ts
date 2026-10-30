import type { PurchaseRecord } from './accounting';

export interface SupplierAdvanceBalance {
  supplierRif: string;
  supplierName: string;
  totalCreditBs: number;
  totalCreditUsd: number;
  outstandingBs: number;
  outstandingUsd: number;
  creditNoteCount: number;
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Sums only active supplier credit notes; reversed/cancelled notes cannot fund a later settlement. */
export function calculateSupplierAdvanceBalance(
  supplierRif: string,
  purchases: PurchaseRecord[]
): SupplierAdvanceBalance {
  const normalizedRif = String(supplierRif || '').trim().toUpperCase();
  if (!normalizedRif) throw new Error('Debe identificar el RIF del proveedor.');
  const notes = purchases.filter(item =>
    item.documentType === '03' &&
    !item.isCancelled &&
    String(item.supplierRif || '').trim().toUpperCase() === normalizedRif
  );
  const totalCreditBs = money(notes.reduce((sum, item) => sum + Number(item.supplierAdvanceBs || 0), 0));
  const totalCreditUsd = money(notes.reduce((sum, item) => sum + Number(item.supplierAdvanceUsd || 0), 0));
  return {
    supplierRif: normalizedRif,
    supplierName: notes[0]?.supplierName || '',
    totalCreditBs,
    totalCreditUsd,
    outstandingBs: totalCreditBs,
    outstandingUsd: totalCreditUsd,
    creditNoteCount: notes.length
  };
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
  if (requestedUsd > availableUsd + 0.005) return 'La liquidación supera el saldo a favor disponible del proveedor.';
  const source = String(supplierRif || '').trim().toUpperCase();
  if (!source) return 'La liquidación no tiene un proveedor de origen identificado.';
  if (targetSupplierRif != null && String(targetSupplierRif).trim().toUpperCase() !== source) {
    return 'El saldo a favor solo puede aplicarse a facturas del mismo proveedor (RIF).';
  }
  return null;
}
