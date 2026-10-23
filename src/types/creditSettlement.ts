export type CreditSettlementKind = 'SALE_COLLECTION' | 'PURCHASE_PAYMENT';
export type SettlementMethod = 'CASH_BS' | 'CASH_USD' | 'BANK_TRANSFER_BS' | 'BANK_TRANSFER_USD' | 'OTHER';

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
  reference?: string;
  notes?: string;
  journalEntryId: string;
  createdAt: string;
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
}

export interface CreditSettlementDraft {
  documentId: string;
  kind: CreditSettlementKind;
  settlementDate: string;
  bcvRate: number;
  amountUsd: number;
  amountBs: number;
  method: SettlementMethod;
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
  const relevant = settlements.filter(item => item.documentId === documentId);
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
  if (!draft.documentId.trim()) return 'Debe seleccionar la factura de crédito.';
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(draft.settlementDate)) return 'La fecha de liquidación no es válida.';
  const [year, month, day] = draft.settlementDate.split('-').map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() !== month - 1 ||
      parsedDate.getUTCDate() !== day) return 'La fecha de liquidación no es válida.';
  if (!Number.isFinite(draft.bcvRate) || draft.bcvRate <= 0) return 'La tasa BCV debe ser mayor que cero.';
  if (!Number.isFinite(draft.amountUsd) || draft.amountUsd <= 0) return 'El abono debe ser mayor que cero.';
  if (draft.amountUsd > outstandingUsd + 0.005) return 'El abono supera el saldo pendiente de la factura.';
  if (!Number.isFinite(draft.amountBs) || draft.amountBs <= 0) return 'El importe efectivamente pagado/cobrado en Bs debe ser mayor que cero.';
  if (!draft.method) return 'Seleccione el medio de pago.';
  return null;
}
