export type PurchasePaymentMethod = 'BS' | 'FOREIGN_CASH' | 'ZELLE' | 'INTERNATIONAL_TRANSFER' | 'CRYPTO';
export interface PurchaseIgtfCalculation { applicable: boolean; rate: number; amountBs: number; }
/** El medio de pago habilita la opción, pero no determina por sí solo la obligación fiscal. */
export function calculatePurchaseIgtf(subtotalBs: number, paymentMethod: PurchasePaymentMethod, explicitlyConfirmed: boolean, rate = 3): PurchaseIgtfCalculation {
  const eligiblePayment = paymentMethod !== 'BS';
  const validSubtotal = Number.isFinite(subtotalBs) && subtotalBs > 0;
  const validRate = Number.isFinite(rate) && rate > 0 && rate <= 100;
  const applicable = Boolean(explicitlyConfirmed && eligiblePayment && validSubtotal && validRate);
  return { applicable, rate: applicable ? rate : 0, amountBs: applicable ? Math.round(subtotalBs * rate) / 100 : 0 };
}
