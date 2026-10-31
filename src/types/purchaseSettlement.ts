/**
 * Purchase settlement policy.
 *
 * Cash purchases remain blocked until the accounting workflow can debit an
 * explicitly selected and documented cash/bank ledger account. This is an
 * accounting entry only; it is not a cash-register or POS integration.
 */
export function validatePurchaseSettlementMode(paymentTerm?: 'CONTADO' | 'CREDITO'): string | null {
  if (paymentTerm === 'CONTADO') {
    return 'Compra de contado temporalmente bloqueada: el flujo para contabilizar directamente contra una cuenta contable de efectivo o banco seleccionada y documentada aún no está implementado. No se registró la compra para evitar crear una CxP ficticia.';
  }
  return null;
}

/**
 * A supplier payable cannot be settled before the accounting date on which
 * that liability is recognized. Earlier disbursements require a direct
 * supplier-advance workflow, which is not yet available.
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
    return 'La fecha de pago es anterior al reconocimiento de la cuenta por pagar (' + accountCreditDate + '). La gestión de anticipos directos a proveedores aún no está disponible; no se puede registrar este pago como liquidación de CxP.';
  }
  return null;
}
