/**
 * Cash purchases post directly to a selected movement account classified as
 * cash/bank. No POS, cash drawer or shift integration is involved.
 */
export interface PurchasePaymentAccount {
  code: string; name: string; type: string; isMovement: boolean;
}
export function isPurchasePaymentAccount(account?: PurchasePaymentAccount | null): boolean {
  if (!account || account.type !== 'ACTIVO' || account.isMovement !== true) return false;
  const name = String(account.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return /\b(CAJA|BANCO|BANCOS|EFECTIVO|EQUIVALENTES DE EFECTIVO)\b/.test(name) ||
    /^1\.1\.1(?:\.|$)/.test(String(account.code || ''));
}
export function validatePurchaseSettlementMode(
  paymentTerm?: 'CONTADO' | 'CREDITO', paymentAccountCode?: string,
  accounts: PurchasePaymentAccount[] = [], paymentReference?: string
): string | null {
  if (paymentTerm !== 'CONTADO') return null;
  if (!isPurchasePaymentAccount(accounts.find(account => account.code === paymentAccountCode))) {
    return 'Para una compra de contado, selecciona una cuenta de movimiento de Caja o Banco del Plan de Cuentas.';
  }
  if (!String(paymentReference || '').trim()) return 'Indica el número de comprobante, referencia bancaria o soporte del desembolso de contado.';
  return null;
}

/** A supplier payable cannot be settled before the date on which it is recognized. */
export function validatePurchasePaymentDate(settlementDate: string, accountCreditDate: string): string | null {
  const isValidDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!isValidDate(settlementDate) || !isValidDate(accountCreditDate)) return 'La fecha de pago o la fecha de abono en cuenta no es válida.';
  if (settlementDate < accountCreditDate) {
    return 'La fecha de pago es anterior al reconocimiento de la cuenta por pagar (' + accountCreditDate + '). Registra el desembolso como anticipo directo a proveedor y no como liquidación de una CxP aún no reconocida.';
  }
  return null;
}
