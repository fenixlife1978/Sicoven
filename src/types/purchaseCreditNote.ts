import type { InventoryMovement, InventoryProduct, PurchaseRecord } from './accounting';
import { isValidIsoDate } from './migrationParsing';

export interface PurchaseCreditNoteLineRequest {
  productId: string;
  originalMovementId: string;
  quantity: number;
}

export interface PurchaseCreditNoteAmounts {
  inventoryCostBs: number;
  taxableBaseBs: number;
  exemptAmountBs: number;
  vatAmountBs: number;
  vatWithheldBs: number;
  islrWithheldBs: number;
  igtfAmountBs: number;
  totalAmountBs: number;
  netPayableReductionBs: number;
  bcvRate: number;
  inventoryCostUsd: number;
  taxableBaseUsd: number;
  exemptAmountUsd: number;
  vatAmountUsd: number;
  vatWithheldUsd: number;
  islrWithheldUsd: number;
  igtfAmountUsd: number;
  totalAmountUsd: number;
  netPayableReductionUsd: number;
  lines: Array<{
    productId: string;
    originalMovementId: string;
    quantity: number;
    unitCostBs: number;
    inventoryCostBs: number;
  }>;
}

export interface PurchaseCreditNoteRequest {
  purchaseId: string;
  lines: PurchaseCreditNoteLineRequest[];
  returnDate: string;
  creditNoteNumber: string;
  controlNumber: string;
  reason: string;
}

export interface PurchaseCreditNoteDraftLine {
  product: InventoryProduct;
  originalMovement: InventoryMovement;
  quantity: number;
  previouslyReturnedQuantity: number;
  currentStock: number;
  currentAverageCostBs: number;
}

export interface PurchaseCreditNoteDraft {
  purchase: PurchaseRecord;
  products: InventoryProduct[];
  lines: PurchaseCreditNoteDraftLine[];
  returnDate: string;
  creditNoteNumber: string;
  controlNumber: string;
  reason: string;
  closedThroughDate?: string;
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const normalize = (value: unknown) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

export function calculatePurchaseCreditNote(draft: PurchaseCreditNoteDraft): PurchaseCreditNoteAmounts {
  const { purchase, products } = draft;
  const rate = Number(purchase.bcvRate);
  if (purchase.documentType !== '01' || purchase.isCancelled) throw new Error('La factura original no está vigente o no es una factura ordinaria.');
  if (purchase.paymentTerm !== 'CREDITO') throw new Error('Por ahora solo se admiten devoluciones de facturas a crédito; contado requiere conciliación de caja/bancos o saldo a favor.');
  if (!purchase.inventoryLines?.length) throw new Error('La factura no conserva líneas de inventario estructuradas.');
  if (!Array.isArray(draft.lines) || draft.lines.length === 0) throw new Error('Agregue al menos un artículo a la nota de crédito.');
  if (!isValidIsoDate(draft.returnDate) || !isValidIsoDate(purchase.invoiceDate) || draft.returnDate < purchase.invoiceDate) {
    throw new Error('La fecha de la nota de crédito no puede ser anterior a la factura original.');
  }
  if (draft.closedThroughDate && draft.returnDate <= draft.closedThroughDate) {
    throw new Error('La fecha de la nota pertenece a un período contable cerrado.');
  }
  if (!String(draft.creditNoteNumber || '').trim() || !String(draft.controlNumber || '').trim() || String(draft.reason || '').trim().length < 10) {
    throw new Error('La nota requiere número, control y una justificación de al menos 10 caracteres.');
  }
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('La factura no conserva una tasa BCV válida.');
  const requiredAmounts = [
    purchase.taxableBaseBs, purchase.exemptAmountBs, purchase.vatAmountBs,
    purchase.vatWithheldBs || 0, purchase.islrWithheldBs || 0, purchase.igtfAmountBs || 0,
    purchase.totalAmountBs, purchase.taxRate
  ].map(Number);
  if (requiredAmounts.some(value => !Number.isFinite(value) || value < 0)) {
    throw new Error('La factura contiene importes fiscales negativos o no numéricos; no se puede calcular una devolución segura.');
  }
  if (Number(purchase.vatWithheldBs || 0) > Number(purchase.vatAmountBs) + 0.02 ||
      Number(purchase.islrWithheldBs || 0) > Number(purchase.taxableBaseBs) + 0.02) {
    throw new Error('Las retenciones originales superan su base o impuesto de referencia.');
  }
  if (!String(purchase.supplierRif || '').trim() || !String(purchase.invoiceNumber || '').trim()) {
    throw new Error('La factura no identifica de forma suficiente al proveedor y al documento original.');
  }
  const invoiceProductIds = new Set<string>();
  for (const invoiceLine of purchase.inventoryLines) {
    const quantity = Number(invoiceLine.quantity);
    const unitCost = Number(invoiceLine.unitCostBs);
    if (!invoiceLine.productId || invoiceProductIds.has(invoiceLine.productId) ||
        !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      throw new Error('Las líneas de inventario de la factura están duplicadas o contienen cantidades/costos inválidos.');
    }
    invoiceProductIds.add(invoiceLine.productId);
  }
  if (Number(purchase.islrSubtrahendBs || 0) > 0 && Number(purchase.islrWithheldBs || 0) > 0) {
    throw new Error('La retención ISLR original tiene sustraendo; el prorrateo automático no es fiscalmente fiable. Requiere cálculo específico de la base y sustraendo de la nota.');
  }

  const requestedProducts = new Set<string>();
  const requestedMovements = new Set<string>();
  let inventoryCostBs = 0;
  let taxableBaseBs = 0;
  let exemptAmountBs = 0;
  const lineAmounts: PurchaseCreditNoteAmounts['lines'] = [];

  let taxableInvoiceLines = 0;
  let exemptInvoiceLines = 0;
  const taxableRates = new Set<number>();
  for (const invoiceLine of purchase.inventoryLines) {
    const matchingProduct = products.find(candidate => candidate.id === invoiceLine.productId && candidate.companyId === purchase.companyId);
    if (!matchingProduct) throw new Error('No se puede certificar el tratamiento fiscal de todas las líneas de la factura.');
    const value = Number(invoiceLine.quantity) * Number(invoiceLine.unitCostBs);
    if (!Number.isFinite(value)) throw new Error('Una línea de inventario produce un importe no válido.');
    if (matchingProduct.vatTreatment === 'EXENTO' || matchingProduct.vatTreatment === 'EXONERADO') exemptInvoiceLines += value;
    else {
      taxableInvoiceLines += value;
      taxableRates.add(matchingProduct.vatTreatment === 'REDUCIDA_8' ? 8 : 16);
    }
  }
  if (taxableRates.size > 1 || (taxableRates.size === 1 && !taxableRates.has(Number(purchase.taxRate)))) {
    throw new Error('La factura contiene alícuotas de IVA mixtas o distintas a la tasa registrada. No se puede prorratear la nota con un único porcentaje.');
  }
  if (Math.abs(money(taxableInvoiceLines) - money(purchase.taxableBaseBs)) > 0.02 ||
      Math.abs(money(exemptInvoiceLines) - money(purchase.exemptAmountBs)) > 0.02) {
    throw new Error('La clasificación fiscal de los artículos no concilia con la base imponible y el exento de la factura.');
  }

  for (const requested of draft.lines) {
    const requestedProductId = String(requested.product?.id || '');
    const product = products.find(item => item.id === requestedProductId && item.companyId === purchase.companyId);
    const movement = requested.originalMovement;
    const quantity = Number(requested.quantity);
    if (!product || !movement || !String(movement.id || '').trim() ||
        requestedProducts.has(product.id) || requestedMovements.has(movement.id)) {
      throw new Error('La nota contiene artículos o entradas de Kardex duplicados o ajenos a la empresa.');
    }
    requestedProducts.add(product.id);
    requestedMovements.add(movement.id);
    const normalizeRif = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const movementRif = normalizeRif(movement.counterpartyRif);
    const supplierRif = normalizeRif(purchase.supplierRif);
    if (movement.companyId !== purchase.companyId || movement.productId !== product.id ||
        movement.type !== 'ENTRADA' || movement.concept !== 'COMPRA' ||
        normalize(movement.documentRef) !== normalize('FAC-' + purchase.invoiceNumber) ||
        !movementRif || !supplierRif || movementRif !== supplierRif) {
      throw new Error('Una entrada de Kardex no pertenece a la factura y al artículo seleccionados.');
    }
    if (!Number.isFinite(quantity) || quantity <= 0 ||
        !Number.isFinite(requested.previouslyReturnedQuantity) || requested.previouslyReturnedQuantity < 0) {
      throw new Error('La cantidad de devolución no es válida.');
    }
    const lineMatches = purchase.inventoryLines.filter(item => item.productId === product.id);
    const line = lineMatches.length === 1 ? lineMatches[0] : undefined;
    const movementQuantity = Number(movement.quantity);
    const movementUnitCost = Number(movement.unitCostBs);
    if (!line || !Number.isFinite(movementQuantity) || movementQuantity <= 0 ||
        !Number.isFinite(movementUnitCost) || movementUnitCost < 0 ||
        Math.abs(Number(line.quantity) - movementQuantity) > 0.000001 ||
        Math.abs(Number(line.unitCostBs) - movementUnitCost) > 0.02) {
      throw new Error('La línea de factura no concilia con la entrada original del Kardex.');
    }
    if (requested.previouslyReturnedQuantity + quantity > Number(line.quantity) + 0.000001) {
      throw new Error('La cantidad acumulada de devoluciones supera la cantidad facturada.');
    }
    const currentStock = Number(requested.currentStock);
    if (!Number.isFinite(currentStock) || currentStock < 0 || quantity > currentStock + 0.000001) {
      throw new Error('La existencia actual no alcanza para devolver esa cantidad al proveedor.');
    }
    if (product.costingMethod === 'PEPS') {
      throw new Error('PEPS requiere identificación y descarga del lote original; esta devolución no se puede automatizar.');
    }
    if (!Number.isFinite(Number(requested.currentAverageCostBs)) ||
        Math.abs(Number(requested.currentAverageCostBs) - Number(line.unitCostBs)) > 0.01) {
      throw new Error('El costo promedio actual difiere del costo original. Se requiere una conciliación de costo antes de devolver.');
    }
    const lineValue = money(quantity * Number(line.unitCostBs));
    const isExempt = product.vatTreatment === 'EXENTO' || product.vatTreatment === 'EXONERADO';
    inventoryCostBs += lineValue;
    if (isExempt) exemptAmountBs += lineValue;
    else taxableBaseBs += lineValue;
    lineAmounts.push({
      productId: product.id, originalMovementId: movement.id,
      quantity, unitCostBs: Number(line.unitCostBs), inventoryCostBs: lineValue
    });
  }

  inventoryCostBs = money(inventoryCostBs);
  taxableBaseBs = money(taxableBaseBs);
  exemptAmountBs = money(exemptAmountBs);
  const vatAmountBs = taxableBaseBs > 0 ? money(taxableBaseBs * Number(purchase.taxRate) / 100) : 0;
  const vatWithheldBs = Number(purchase.vatAmountBs) > 0
    ? money(Number(purchase.vatWithheldBs || 0) * vatAmountBs / Number(purchase.vatAmountBs)) : 0;
  const islrWithheldBs = Number(purchase.taxableBaseBs) > 0
    ? money(Number(purchase.islrWithheldBs || 0) * taxableBaseBs / Number(purchase.taxableBaseBs)) : 0;
  const originalIgtfBase = Number(purchase.taxableBaseBs) + Number(purchase.exemptAmountBs) + Number(purchase.vatAmountBs);
  const igtfAmountBs = originalIgtfBase > 0
    ? money(Number(purchase.igtfAmountBs || 0) * (taxableBaseBs + exemptAmountBs + vatAmountBs) / originalIgtfBase) : 0;
  const totalAmountBs = money(inventoryCostBs + vatAmountBs + igtfAmountBs);
  const netPayableReductionBs = money(totalAmountBs - vatWithheldBs - islrWithheldBs);
  if (netPayableReductionBs <= 0) throw new Error('El efecto neto de la nota no reduce CxP; requiere tratamiento fiscal especial.');
  const toUsd = (value: number) => Math.round((value / rate + Number.EPSILON) * 1000000) / 1000000;
  return {
    inventoryCostBs, taxableBaseBs, exemptAmountBs, vatAmountBs, vatWithheldBs,
    islrWithheldBs, igtfAmountBs, totalAmountBs, netPayableReductionBs, bcvRate: rate,
    inventoryCostUsd: toUsd(inventoryCostBs), taxableBaseUsd: toUsd(taxableBaseBs),
    exemptAmountUsd: toUsd(exemptAmountBs), vatAmountUsd: toUsd(vatAmountBs),
    vatWithheldUsd: toUsd(vatWithheldBs), islrWithheldUsd: toUsd(islrWithheldBs),
    igtfAmountUsd: toUsd(igtfAmountBs), totalAmountUsd: toUsd(totalAmountBs),
    netPayableReductionUsd: toUsd(netPayableReductionBs), lines: lineAmounts
  };
}
