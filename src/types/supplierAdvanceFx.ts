export interface SupplierAdvanceFxSettlementAmounts {
  amountUsd: number;
  advanceBookValueBs: number;
  settlementValueBs: number;
  exchangeDifferenceBs: number;
}

/**
 * Removes an advance at its proportional historical carrying value and compares
 * it with the Bs value of the refund or target payable at settlement date.
 * Positive difference = FX gain; negative difference = FX loss.
 */
export function calculateSupplierAdvanceFxSettlement(
  availableUsd: number,
  availableBookBs: number,
  requestedUsd: number,
  settlementValueBs: number
): SupplierAdvanceFxSettlementAmounts {
  const values = [availableUsd, availableBookBs, requestedUsd, settlementValueBs];
  if (!values.every(Number.isFinite) || availableUsd <= 0 || availableBookBs <= 0 ||
      requestedUsd <= 0 || settlementValueBs <= 0) {
    throw new Error('Los valores para calcular el diferencial cambiario deben ser positivos y finitos.');
  }
  if (requestedUsd > availableUsd + 0.000005) {
    throw new Error('La liquidación supera el saldo a favor disponible del proveedor.');
  }
  const amountUsd = Math.round((requestedUsd + Number.EPSILON) * 1000000) / 1000000;
  const advanceBookValueBs = Math.round((availableBookBs * amountUsd / availableUsd) * 100) / 100;
  const roundedSettlementBs = Math.round(settlementValueBs * 100) / 100;
  const exchangeDifferenceBs = Math.round((roundedSettlementBs - advanceBookValueBs) * 100) / 100;
  if (advanceBookValueBs <= 0) throw new Error('El anticipo no tiene un valor histórico en Bs conciliable.');
  return { amountUsd, advanceBookValueBs, settlementValueBs: roundedSettlementBs, exchangeDifferenceBs };
}
