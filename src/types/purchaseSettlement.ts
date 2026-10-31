/**
 * Purchase settlement policy.
 *
 * A contado purchase must debit the actual cash/bank account used at payment.
 * Until the source payment method is mapped to a verified movement account,
 * do not post it as supplier payable: that would fabricate an outstanding debt.
 */
export function validatePurchaseSettlementMode(paymentTerm?: 'CONTADO' | 'CREDITO'): string | null {
  if (paymentTerm === 'CONTADO') {
    return 'Compra de contado temporalmente bloqueada: el asiento actual aún no identifica de forma fiable la cuenta de caja/banco realmente utilizada. No se registró la compra para evitar crear una CxP ficticia. Complete primero la conciliación del medio de pago.';
  }
  return null;
}


/**
 * A supplier payable cannot be settled before the accounting date on which
 * that liability is recognized. Earlier disbursements belong to the supplier
 * advance workflow, not to a backdated CxP settlement.
 */
export function validatePurchasePaymentDate(settlementDate: string, accountCreditDate: string): string | null {
  const isValidDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!isValidDate(settlementDate) || !isValidDate(accountCreditDate)) {
    return 'La fecha de pago o la fecha de abono en cuenta no es válida.';
  }
  if (settlementDate < accountCreditDate) {
    return 'La fecha de pago es anterior al reconocimiento de la cuenta por pagar (' + accountCreditDate + '). Registre el desembolso como anticipo a proveedor; no se puede liquidar una CxP antes de su abono en cuenta.';
  }
  return null;
}
