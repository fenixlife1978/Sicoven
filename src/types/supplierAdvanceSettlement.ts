export type SupplierAdvanceSettlementKind = 'REFUND_RECEIVED' | 'APPLIED_TO_PURCHASE';

export interface SupplierAdvanceSettlement {
  id: string;
  companyId: string;
  supplierRif: string;
  supplierName: string;
  sourceCreditNoteIds: string[];
  kind: SupplierAdvanceSettlementKind;
  date: string;
  amountUsd: number;
  amountBs: number;
  bcvRate: number;
  /** Required for a refund; identifies the real treasury ledger account. */
  treasuryAccountCode?: string;
  /** Required for an application; identifies a purchase of the same supplier. */
  targetPurchaseId?: string;
  journalEntryId: string;
  reference?: string;
  createdAt: string;
  isReversed?: boolean;
  reversedByJournalEntryId?: string;
}

export interface SupplierAdvanceSettlementDraft {
  supplierRif: string;
  kind: SupplierAdvanceSettlementKind;
  date: string;
  amountUsd: number;
  amountBs: number;
  bcvRate: number;
  treasuryAccountCode?: string;
  targetPurchaseId?: string;
  reference?: string;
}

export function validateSupplierAdvanceSettlementDraft(
  draft: SupplierAdvanceSettlementDraft,
  availableUsd: number,
  supplierRifForTarget?: string,
  validTreasuryAccountCodes: string[] = []
): string | null {
  if (!draft || typeof draft !== 'object') return 'Los datos de la liquidación no son válidos.';
  const rif = String(draft.supplierRif || '').trim().toUpperCase();
  if (!rif) return 'Debe identificar el RIF del proveedor.';
  if (!['REFUND_RECEIVED', 'APPLIED_TO_PURCHASE'].includes(draft.kind)) return 'El tipo de liquidación no es válido.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date || '')) return 'La fecha de liquidación no es válida.';
  const [year, month, day] = draft.date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return 'La fecha de liquidación no es válida.';
  if (![draft.amountUsd, draft.amountBs, draft.bcvRate, availableUsd].every(Number.isFinite) ||
      draft.amountUsd <= 0 || draft.amountBs <= 0 || draft.bcvRate <= 0 || availableUsd < 0) {
    return 'Importes, saldo y tasa deben ser válidos y mayores que cero.';
  }
  if (draft.amountUsd > availableUsd + 0.005) return 'La liquidación supera el saldo a favor disponible del proveedor.';
  if (Math.abs(Math.round(draft.amountBs * 100) / 100 - Math.round(draft.amountUsd * draft.bcvRate * 100) / 100) >= 0.01) {
    return 'El importe en Bs no coincide con el equivalente a la tasa BCV de liquidación.';
  }
  if (draft.kind === 'REFUND_RECEIVED') {
    if (!draft.treasuryAccountCode || !validTreasuryAccountCodes.includes(draft.treasuryAccountCode)) {
      return 'Seleccione una cuenta real de caja o banco para recibir el reembolso.';
    }
    if (draft.targetPurchaseId) return 'Un reembolso recibido no puede aplicarse simultáneamente a una compra.';
  }
  if (draft.kind === 'APPLIED_TO_PURCHASE') {
    if (!draft.targetPurchaseId) return 'Seleccione la factura de compra donde aplicará el anticipo.';
    if (!supplierRifForTarget || supplierRifForTarget.trim().toUpperCase() !== rif) {
      return 'El anticipo solo puede aplicarse a una factura del mismo proveedor (RIF).';
    }
    if (draft.treasuryAccountCode) return 'La aplicación de un anticipo no debe generar movimiento de caja o banco.';
  }
  return null;
}
