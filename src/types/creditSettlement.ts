export type CreditSettlementKind = 'SALE_COLLECTION' | 'PURCHASE_PAYMENT';
export type SettlementMethod = 'CASH_BS' | 'CASH_USD' | 'BANK_TRANSFER_BS' | 'BANK_TRANSFER_USD' | 'OTHER';

export interface FxFiscalAdjustmentSnapshot { direction: 'DEBIT_NOTE' | 'CREDIT_NOTE' | 'NONE' | 'REVIEW_REQUIRED'; deltaBaseBs: number; deltaVatBs: number; deltaExemptBs: number; deltaTotalBs: number; explanation: string; }

export interface CreditSettlement {
  id: string;
  companyId: string;
  documentId: string;
  kind: CreditSettlementKind;
  settlementDate: string; // YYYY-MM-DD, actual date funds were received/paid
  bcvRate: number; // official rate recorded for this settlement; never replaces invoice rate
  amountUsd: number; // portion of invoice settled, expressed in USD equivalent
  amountBs: number; // actual nominal Bs received/paid
  method: SettlementMethod;
  /** Auxiliar bancario de la empresa activa cuando el medio es transferencia. */
  bankAccountId?: string;
  reference?: string;
  notes?: string;
  /** Calculation snapshot only; never represents an issued fiscal note. */
  fxFiscalAdjustmentProposal?: FxFiscalAdjustmentSnapshot;
  journalEntryId: string;
  createdAt: string;
  /** La liquidación se conserva para auditoría, pero deja de reducir el saldo al reversarse. */
  isReversed?: boolean;
  reversedByJournalEntryId?: string;
}

export interface CreditBalance {
  documentId: string;
  originalAmountUsd: number;
  originalAmountBs: number;
  settledAmountUsd: number;
  settledAmountBs: number;
  outstandingUsd: number;
  outstandingBsAtInvoiceRate: number;
  settlementCount: number;
  /** Reducción documental por notas de crédito; no se considera pago de efectivo. */
  creditedByNotesUsd?: number;
  creditedByNotesBs?: number;
}

export interface CreditSettlementDraft {
  documentId: string;
  kind: CreditSettlementKind;
  settlementDate: string;
  bcvRate: number;
  amountUsd: number;
  amountBs: number;
  method: SettlementMethod;
  /** Auxiliar bancario de la empresa activa cuando el medio es transferencia. */
  bankAccountId?: string;
  reference?: string;
  notes?: string;
}

/**
 * Computes remaining principal in invoice currency. Historical invoice values
 * are inputs only and must never be rewritten by a settlement.
 */
export function calculateCreditBalance(
  documentId: string,
  originalAmountUsd: number,
  originalAmountBs: number,
  settlements: CreditSettlement[]
): CreditBalance {
  // Una liquidación reversada permanece en el historial, pero no puede seguir
  // reduciendo el principal ni inflar el contador de pagos/cobros vigentes.
  const relevant = settlements.filter(item => item.documentId === documentId && !item.isReversed);
  const settledAmountUsd = relevant.reduce((sum, item) => sum + item.amountUsd, 0);
  const settledAmountBs = relevant.reduce((sum, item) => sum + item.amountBs, 0);
  const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  return {
    documentId,
    originalAmountUsd: money(originalAmountUsd),
    originalAmountBs: money(originalAmountBs),
    settledAmountUsd: money(settledAmountUsd),
    settledAmountBs: money(settledAmountBs),
    outstandingUsd: money(Math.max(0, originalAmountUsd - settledAmountUsd)),
    // Remaining principal is valued at the original invoice's implied rate, not
    // by subtracting nominal Bs paid at a potentially different settlement rate.
    outstandingBsAtInvoiceRate: money(originalAmountUsd > 0
      ? Math.max(0, originalAmountUsd - settledAmountUsd) * (originalAmountBs / originalAmountUsd)
      : Math.max(0, originalAmountBs - settledAmountBs)),
    settlementCount: relevant.length
  };
}

/**
 * Validation shared by the UI and accounting context. Fiscal VAT values and
 * original document amounts are deliberately not changed here.
 */
export function validateCreditSettlement(
  draft: CreditSettlementDraft,
  outstandingUsd: number
): string | null {
  if (!draft || typeof draft !== 'object') return 'Los datos de la liquidación no son válidos.';
  if (typeof draft.documentId !== 'string') return 'Debe seleccionar la factura de crédito.';
  if (!['SALE_COLLECTION', 'PURCHASE_PAYMENT'].includes(draft.kind)) return 'El tipo de liquidación no es válido.';
  if (typeof draft.settlementDate !== 'string') return 'La fecha de liquidación no es válida.';
  if (!['CASH_BS', 'CASH_USD', 'BANK_TRANSFER_BS', 'BANK_TRANSFER_USD', 'OTHER'].includes(draft.method)) return 'Seleccione un medio de pago válido.';
  if ((draft.method === 'BANK_TRANSFER_BS' || draft.method === 'BANK_TRANSFER_USD') && (typeof draft.bankAccountId !== 'string' || !draft.bankAccountId.trim())) return 'Seleccione la cuenta bancaria auxiliar de esta empresa para vincular el cobro o pago.';
  if (draft.method === 'OTHER') return 'El medio «Otro» no está habilitado porque no identifica una cuenta de tesorería verificable.';
  if (draft.reference != null && (typeof draft.reference !== 'string' || draft.reference.length > 200)) return 'La referencia no puede superar 200 caracteres.';
  if (!draft.documentId.trim()) return 'Debe seleccionar la factura de crédito.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.settlementDate)) return 'La fecha de liquidación no es válida.';
  const [year, month, day] = draft.settlementDate.split('-').map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() !== month - 1 ||
      parsedDate.getUTCDate() !== day) return 'La fecha de liquidación no es válida.';
  if (!Number.isFinite(draft.bcvRate) || draft.bcvRate <= 0) return 'La tasa BCV debe ser mayor que cero.';
  if (!Number.isFinite(outstandingUsd) || outstandingUsd < 0) return 'El saldo pendiente de la factura no es válido; actualice los datos antes de liquidar.';
  if (!Number.isFinite(draft.amountUsd) || draft.amountUsd <= 0) return 'El abono debe ser mayor que cero.';
  if (draft.amountUsd > outstandingUsd + 0.005) return 'El abono supera el saldo pendiente de la factura.';
  if (!Number.isFinite(draft.amountBs) || draft.amountBs <= 0) return 'El importe efectivamente pagado/cobrado en Bs debe ser mayor que cero.';
  const expectedBs = Math.round(draft.amountUsd * draft.bcvRate * 100) / 100;
  const actualBs = Math.round(draft.amountBs * 100) / 100;
  if (Math.abs(actualBs - expectedBs) >= 0.01) return 'El importe en Bs no coincide con el equivalente a la tasa de liquidación. Revise la tasa o el importe.';
  return null;
}
