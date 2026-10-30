export interface FiscalDocumentAmounts {
  totalAmountBs: number;
  taxableBaseBs: number;
  exemptAmountBs: number;
  vatAmountBs: number;
  totalAmountUsd: number;
  taxableBaseUsd: number;
  vatAmountUsd: number;
  bcvRate: number;
  igtfAmountBs?: number;
  igtfAmountUsd?: number;
}

/**
 * Valida la ecuación fiscal en Bs. y los equivalentes en USD.
 * El IGTF forma parte del total de factura, pero no de la base imponible ni del IVA.
 */
export const hasConsistentFiscalDocumentAmounts = (document: FiscalDocumentAmounts): boolean => {
  const totalBs = Number(document.totalAmountBs);
  const baseBs = Number(document.taxableBaseBs);
  const exemptBs = Number(document.exemptAmountBs);
  const vatBs = Number(document.vatAmountBs);
  const totalUsd = Number(document.totalAmountUsd);
  const baseUsd = Number(document.taxableBaseUsd);
  const vatUsd = Number(document.vatAmountUsd);
  const rate = Number(document.bcvRate);
  const igtfBs = Number(document.igtfAmountBs ?? 0);
  const igtfUsd = Number(document.igtfAmountUsd ?? 0);
  const amounts = [totalBs, baseBs, exemptBs, vatBs, totalUsd, baseUsd, vatUsd, igtfBs, igtfUsd];

  if (!Number.isFinite(rate) || rate <= 0 || amounts.some(value => !Number.isFinite(value) || value < 0)) {
    return false;
  }

  return Math.abs(totalBs - baseBs - exemptBs - vatBs - igtfBs) <= 0.02 &&
    Math.abs(baseUsd - baseBs / rate) <= 0.02 &&
    Math.abs(vatUsd - vatBs / rate) <= 0.02 &&
    Math.abs(igtfUsd - igtfBs / rate) <= 0.02 &&
    Math.abs(totalUsd - totalBs / rate) <= 0.02;
};
