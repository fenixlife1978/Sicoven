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
