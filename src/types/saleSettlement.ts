/** Evita reconocer como cuenta por cobrar una venta que ya fue cobrada sin identificar la tesorería receptora. */
export function validateSaleSettlementMode(paymentTerm?: 'CONTADO' | 'CREDITO'): string | null {
  if (paymentTerm === 'CONTADO') {
    return 'Venta de contado temporalmente bloqueada: el asiento actual aún no identifica de forma fiable la cuenta de caja/banco que recibió el pago. No se registró la venta como CxC ficticia. Complete primero la conciliación del medio de cobro.';
  }
  return null;
}
