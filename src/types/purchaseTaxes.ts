export type PurchasePaymentMethod = 'BS' | 'FOREIGN_CASH' | 'ZELLE' | 'INTERNATIONAL_TRANSFER' | 'CRYPTO';
export interface PurchaseIgtfCalculation { applicable: boolean; rate: number; amountBs: number; }
/** El medio de pago habilita la opción, pero no determina por sí solo la obligación fiscal. */
export function calculatePurchaseIgtf(subtotalBs: number, paymentMethod: PurchasePaymentMethod, explicitlyConfirmed: boolean, rate = 3, paymentTerm: 'CONTADO' | 'CREDITO' = 'CONTADO'): PurchaseIgtfCalculation {
  const eligiblePayment = paymentMethod !== 'BS';
  const validSubtotal = Number.isFinite(subtotalBs) && subtotalBs > 0;
  const validRate = Number.isFinite(rate) && rate > 0 && rate <= 100;
  // La obligación nace al debitar la cuenta o cancelar la deuda; no anticipar IGTF en una factura totalmente a crédito.\n  const applicable = Boolean(paymentTerm === 'CONTADO' && explicitlyConfirmed && eligiblePayment && validSubtotal && validRate);
  return { applicable, rate: applicable ? rate : 0, amountBs: applicable ? Math.round(subtotalBs * rate) / 100 : 0 };
}
