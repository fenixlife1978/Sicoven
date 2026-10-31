export interface SupplierCreditAllocation {
  requestedCreditUsd: number;
  requestedCreditBs: number;
  appliedToPayableUsd: number;
  appliedToPayableBs: number;
  supplierAdvanceUsd: number;
  supplierAdvanceBs: number;
}

/**
 * Allocates a supplier credit note first against the open invoice payable.
 * Any excess is a recoverable supplier advance, never a negative payable.
 * Amounts are kept in both currencies from the same invoice-rate allocation.
 */
export function allocateSupplierCredit(
  requestedCreditUsd: number,
  requestedCreditBs: number,
  outstandingPayableUsd: number,
  invoiceRate: number
): SupplierCreditAllocation {
  const values = [requestedCreditUsd, requestedCreditBs, outstandingPayableUsd, invoiceRate];
  if (values.some(value => !Number.isFinite(value) || value < 0) || invoiceRate <= 0) {
    throw new Error('No se puede distribuir el crédito del proveedor: importes, saldo o tasa inválidos.');
  }
  if (Math.abs(requestedCreditBs - requestedCreditUsd * invoiceRate) > 0.02) {
    throw new Error('El crédito del proveedor no concilia entre Bs. y USD. Revise la tasa y el cálculo fiscal de la nota.');
  }
  const appliedToPayableUsd = Math.round(Math.min(requestedCreditUsd, outstandingPayableUsd) * 1000000) / 1000000;
  const supplierAdvanceUsd = Math.round(Math.max(0, requestedCreditUsd - appliedToPayableUsd) * 1000000) / 1000000;
  const appliedToPayableBs = Math.round(appliedToPayableUsd * invoiceRate * 100) / 100;
  const supplierAdvanceBs = Math.round(Math.max(0, requestedCreditBs - appliedToPayableBs) * 100) / 100;
  if (Math.abs(appliedToPayableBs + supplierAdvanceBs - requestedCreditBs) > 0.02) {
    throw new Error('La distribución del crédito del proveedor no concilia en Bs. y USD.');
  }
  return {
    requestedCreditUsd: Math.round(requestedCreditUsd * 1000000) / 1000000,
    requestedCreditBs: Math.round(requestedCreditBs * 100) / 100,
    appliedToPayableUsd, appliedToPayableBs, supplierAdvanceUsd, supplierAdvanceBs
  };
}
