export type TaxpayerType = 'ESPECIAL' | 'ORDINARIO';

export interface Company {
  id: string;
  rif: string; // e.g., "J-40892182-3"
  name: string; // Razón Social
  tradeName?: string; // Nombre Comercial
  address: string;
  phone: string;
  email: string;
  taxpayerType: TaxpayerType;
  defaultIvaRetentionRate: number; // 75 or 100
  /** Configuración expresa de designación como agente de percepción IGTF. */
  isIgtfPerceptionAgent?: boolean;
  fiscalYear: number; // e.g. 2026
  bcvRate: number; // Tasa oficial BCV Bs/$
  lastRateUpdate?: string;
  /** Último día incluido en un período contable bloqueado. */
  closedThroughDate?: string;
  logoUrl?: string; // URL o base64 del logo de la empresa
}

export type AccountType = 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESOS' | 'COSTOS' | 'GASTOS';

export type CashFlowActivity = 'EFECTIVO_EQUIVALENTE' | 'OPERACION' | 'INVERSION' | 'FINANCIACION' | 'NO_MONETARIO' | 'SIN_CLASIFICAR';

export interface Account {
  code: string; // e.g. "1.1.1.01"
  name: string;
  type: AccountType;
  level: number; // 1 to 5
  isMovement: boolean; // Solo las cuentas de movimiento aceptan asientos
  parentCode?: string;
  /** Clasificación explícita usada por el Estado de Flujos de Efectivo; opcional para compatibilidad histórica. */
  cashFlowActivity?: CashFlowActivity;
}

export interface JournalEntryItem {
  accountCode: string;
  accountName: string;
  debitBs: number;
  creditBs: number;
  debitUsd: number;
  creditUsd: number;
  description?: string;
}

export type EntryType =
  | 'MANUAL'
  | 'APERTURA'
  | 'COMPRA'
  | 'VENTA'
  | 'RETENCION_IVA'
  | 'RETENCION_ISLR'
  | 'INVENTARIO'
  | 'AJUSTE'
  | 'CIERRE'
  | 'ANTICIPO_PROVEEDOR';

export interface JournalEntry {
  id: string;
  companyId: string;
  entryNumber: number;
  date: string; // YYYY-MM-DD
  description: string;
  type: EntryType;
  bcvRate: number;
  items: JournalEntryItem[];
  isAdjusted?: boolean;
  referenceDoc?: string;
  createdAt: string;
  /** Enlace de auditoría para contra-asientos inmutables. */
  reversalOfEntryId?: string;
  reversedByEntryId?: string;
  reversalReason?: string;
  workpaperNote?: string;
  priorPeriodAdjustment?: boolean;
  /** Vínculo inmutable entre el ejercicio cerrado y el ejercicio que inicia con esta apertura. */
  exerciseLink?: {
    priorPeriodStartDate: string;
    priorPeriodEndDate: string;
    nextPeriodStartDate: string;
  };
}

export interface PurchaseInventoryLine {
  productId: string;
  quantity: number;
  unitCostBs: number;
}

export interface PurchaseCreditNoteLine {
  productId: string;
  originalMovementId: string;
  movementId: string;
  quantity: number;
  unitCostBs: number;
  inventoryCostBs: number;
}

export interface PurchaseRecord {
  /** Líneas de mercancía vinculadas al Kardex; ausente en facturas históricas sin detalle. */
  inventoryLines?: PurchaseInventoryLine[];
  /** Enlace inmutable de una nota de crédito de proveedor a su factura y movimientos físicos. */
  originalPurchaseId?: string;
  creditNoteLines?: PurchaseCreditNoteLine[];
  netPayableReductionBs?: number;
  netPayableReductionUsd?: number;
  /** Excedente de nota de crédito contabilizado como anticipo/saldo a favor del proveedor. */
  supplierAdvanceBs?: number;
  supplierAdvanceUsd?: number;
  id: string;
  companyId: string;
  opNumber: number;
  invoiceDate: string; // YYYY-MM-DD, fecha original del documento
  /** Fecha efectiva en que se reconoce/abona en cuenta el pasivo; ausente solo en históricos legacy. */
  accountCreditDate?: string; // YYYY-MM-DD
  supplierRif: string; // e.g. "J-12345678-9"
  supplierName: string;
  supplierAddress?: string;
  invoiceNumber: string;
  controlNumber: string;
  debitNoteNumber?: string;
  creditNoteNumber?: string;
  affectedInvoiceNumber?: string; // Para NC o ND
  documentType: '01' | '02' | '03'; // 01=Factura, 02=Nota Debito, 03=Nota Credito
  totalAmountBs: number;
  exemptAmountBs: number;
  taxableBaseBs: number;
  taxRate: number; // e.g., 16, 8, 31, 0
  vatAmountBs: number;
  retentionRate: number; // 0, 75, 100
  vatWithheldBs: number;
  // ISLR opcional
  islrConceptCode?: string;
  islrConceptName?: string;
  islrRate?: number;
  islrSubtrahendBs?: number;
  islrWithheldBs?: number;
  /** Clasificación fiscal declarada/seleccionada; no inferirla del prefijo RIF. */
  islrBeneficiaryType?: 'PN' | 'PJ';
  islrResidency?: 'RESIDENT' | 'NON_RESIDENT' | 'DOMICILED' | 'NON_DOMICILED';
  islrBasePercentage?: number;
  islrUnitTaxValueBs?: number;
  islrFormulaFactor?: number;
  // Moneda extranjera
  bcvRate: number;
  totalAmountUsd: number;
  taxableBaseUsd: number;
  vatAmountUsd: number;
  vatWithheldUsd: number;
  islrWithheldUsd?: number;
  journalEntryId?: string;
  voucherNumber?: string; // Formato SENIAT: AAAAMMDDDDDDDD (14 caracteres)
  notes?: string;
  /** Cuenta contable de origen utilizada en compras pagadas al contado. */
  paymentAccountCode?: string;
  /** Referencia del comprobante/soporte del desembolso de contado. */
  paymentReference?: string;
  /** Medio declarado de pago; se conserva para auditoría de IGTF. */
  paymentMethod?: 'BS' | 'FOREIGN_CASH' | 'ZELLE' | 'INTERNATIONAL_TRANSFER' | 'CRYPTO';
  igtfApplicable?: boolean;
  igtfRate?: number;
  igtfAmountBs?: number;
  igtfAmountUsd?: number;
  // Condiciones comerciales y fiscales del crédito (se preservan por documento)
  paymentTerm?: 'CONTADO' | 'CREDITO';
  creditDays?: number;
  dueDate?: string; // YYYY-MM-DD
  currencyPricingMode?: 'USD_FIJO' | 'BS_AJUSTABLE' | 'REVISION_MANUAL';
  fiscalAdjustmentMode?: 'IVA_ORIGINAL_DIF_CAMBIARIA' | 'AJUSTE_BASE_IVA' | 'REVISION_CONTADOR';
  isCancelled?: boolean;
  cancelledByJournalEntryId?: string;
  cancellationReason?: string;
  cancellationNote?: string;
}

export interface SaleRecord {
  id: string;
  companyId: string;
  opNumber: number;
  invoiceDate: string; // YYYY-MM-DD
  customerRif: string;
  customerName: string;
  customerAddress?: string;
  invoiceNumber: string;
  controlNumber: string;
  debitNoteNumber?: string;
  creditNoteNumber?: string;
  affectedInvoiceNumber?: string;
  documentType: '01' | '02' | '03';
  totalAmountBs: number;
  exemptAmountBs: number;
  taxableBaseBs: number;
  taxRate: number; // 16, 8, 31, 0
  vatAmountBs: number;
  vatWithheldBs: number; // Retenido por cliente si es contribuyente especial
  retentionRate?: number;
  retentionVoucherNumber?: string;
  retentionVoucherDate?: string; // Fecha del comprobante de retención recibido
  igtfApplicable?: boolean;
  igtfRate?: number;
  igtfAmountBs?: number;
  igtfAmountUsd?: number;
  paymentCurrency?: 'BS' | 'FOREIGN_CASH' | 'FOREIGN_TRANSFER' | 'CRYPTO';
  bcvRate: number;
  totalAmountUsd: number;
  taxableBaseUsd: number;
  vatAmountUsd: number;
  vatWithheldUsd: number;
  journalEntryId?: string;
  notes?: string;
  // Condiciones comerciales y fiscales del crédito (se preservan por documento)
  paymentTerm?: 'CONTADO' | 'CREDITO';
  creditDays?: number;
  dueDate?: string; // YYYY-MM-DD
  currencyPricingMode?: 'USD_FIJO' | 'BS_AJUSTABLE' | 'REVISION_MANUAL';
  fiscalAdjustmentMode?: 'IVA_ORIGINAL_DIF_CAMBIARIA' | 'AJUSTE_BASE_IVA' | 'REVISION_CONTADOR';
  isCancelled?: boolean;
  cancelledByJournalEntryId?: string;
  cancellationReason?: string;
  cancellationNote?: string;
}

export type InventoryCostingMethod = 'PROMEDIO_PONDERADO' | 'PEPS';
export type InventoryVatTreatment = 'GENERAL_16' | 'REDUCIDA_8' | 'EXENTO' | 'EXONERADO';
export type InventoryItemType = 'MERCANCIA' | 'MATERIA_PRIMA' | 'PRODUCTO_EN_PROCESO' | 'PRODUCTO_TERMINADO' | 'SUBPRODUCTO';

export interface InventoryBomComponent {
  productId: string;
  quantityPerUnit: number;
}

export interface InventoryProduct {
  id: string;
  companyId: string;
  code: string;
  name: string;
  category: string;
  unit: string; // Unid, Kg, Mts, Caja, etc.
  minStock: number;
  currentStock: number;
  avgCostBs: number;
  avgCostUsd: number;
  lastCostBs: number;
  lastCostUsd: number;
  salesPriceBs: number;
  salesPriceUsd: number;
  /** Cuenta de movimiento asociada al valor del inventario. */
  inventoryAccountCode?: string;
  /** Cuenta de costo de ventas o consumo asociada al artículo. */
  costOfSalesAccountCode?: string;
  /** Cuenta para mermas, faltantes, sobrantes y ajustes. */
  adjustmentAccountCode?: string;
  openingBalanceAccountCode?: string;
  costingMethod?: InventoryCostingMethod;
  vatTreatment?: InventoryVatTreatment;
  itemType?: InventoryItemType;
  openingDate?: string;
  openingBcvRate?: number;
  vnrProvisionBs?: number;
  vnrEstimatedSellingPriceBs?: number;
  vnrCompletionCostBs?: number;
  vnrSellingCostBs?: number;
  vnrLastTestDate?: string;
  bomComponents?: InventoryBomComponent[];
}

export interface InventoryMovement {
  id: string;
  companyId: string;
  productId: string;
  productName: string;
  productCode: string;
  date: string;
  type: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
  concept: string; // 'COMPRA' | 'VENTA' | 'INVENTARIO_INICIAL' | 'MERMA' | 'AJUSTE'
  documentRef: string;
  quantity: number;
  unitCostBs: number;
  unitCostUsd: number;
  totalCostBs: number;
  totalCostUsd: number;
  balanceQty: number;
  balanceTotalBs: number;
  balanceTotalUsd: number;
  journalEntryId?: string;
  /** Enlace explícito entre una corrección/devolución y el movimiento original del Kardex. */
  correctionForMovementId?: string;
  /** Tasa BCV aplicable a la fecha del movimiento, conservada como dato histórico. */
  bcvRate?: number;
  documentType?: string;
  counterpartyRif?: string;
  counterpartyName?: string;
  warehouseId?: string;
  /** Costo unitario aplicado por el método del artículo, distinto del costo digitado. */
  costingMethod?: InventoryCostingMethod;
  /** Fletes y gastos de importación asignados a esta entrada, en Bs. */
  additionalLandedCostsBs?: number;
}

export interface VatRetentionVoucher {
  id: string;
  companyId: string;
  voucherNumber: string; // 14 dígitos: YYYYMM + 8 dígitos correlativo
  date: string;
  period: string; // YYYYMM
  supplierRif: string;
  supplierName: string;
  supplierAddress: string;
  purchaseRecordId: string;
  invoiceDate: string;
  invoiceNumber: string;
  controlNumber: string;
  totalAmountBs: number;
  exemptAmountBs: number;
  taxableBaseBs: number;
  taxRate: number;
  vatAmountBs: number;
  retentionRate: number; // 75 or 100
  vatWithheldBs: number;
  bcvRate: number;
  totalAmountUsd: number;
  vatWithheldUsd: number;
  /** No borrar el comprobante: requiere conciliación/rectificación fiscal posterior a una reversión. */
  requiresFiscalCorrection?: boolean;
  correctionEntryId?: string;
  /** Todos los asientos correctivos asociados al comprobante; correctionEntryId conserva el último para compatibilidad. */
  correctionEntryIds?: string[];
  correctionNote?: string;
}

export interface IslrConcept {
  code: string; // e.g. "001", "002"
  description: string;
  category: 'PN' | 'PJ';
  isResident: boolean;
  rate: number; // porcentaje ej 3% o 5%
  appliesSubtrahend: boolean;
  /** Porcentaje de la base de la operación sujeto a retención. */
  basePercentage: number;
  minBaseUt?: number;
}

export interface IslrRetentionVoucher {
  id: string;
  companyId: string;
  voucherNumber: string; // Formato oficial
  date: string;
  period: string; // YYYYMM
  supplierRif: string;
  supplierName: string;
  supplierAddress: string;
  isPersonNatural: boolean;
  isResident: boolean;
  conceptCode: string;
  conceptDescription: string;
  invoiceNumber: string;
  controlNumber: string;
  invoiceDate: string;
  baseAmountBs: number;
  retentionRate: number;
  subtrahendBs: number;
  withheldAmountBs: number;
  bcvRate: number;
  baseAmountUsd: number;
  withheldAmountUsd: number;
  /** Parámetros históricos de cálculo usados al emitir el comprobante. */
  unitTaxValueBs?: number;
  formulaFactor?: number;
  basePercentage?: number;
  requiresFiscalCorrection?: boolean;
  correctionEntryId?: string;
  /** Todos los asientos correctivos asociados al comprobante; correctionEntryId conserva el último para compatibilidad. */
  correctionEntryIds?: string[];
  correctionNote?: string;
}

export interface BankAccount {
  id: string;
  companyId: string;
  accountCode: string; // e.g. "1.1.1.03"
  bankName: string; // e.g. "Banco Nacional de Crédito (BNC)"
  accountNumber: string; // 20 dígitos estándar venezolano
  currency: 'BS' | 'USD';
  initialBalanceBs: number;
  initialBalanceUsd: number;
  accountType?: 'CORRIENTE' | 'AHORRO';
  checkbookNumber?: string;
}

export type BankMovementType = 'DEBIT' | 'CREDIT';

export interface BankStatementMovement {
  id: string;
  companyId: string;
  bankAccountId: string;
  date: string; // YYYY-MM-DD
  reference: string; // Número de transferencia, cheque, débito
  description: string;
  type: BankMovementType; // DEBIT: cargo/salida en banco; CREDIT: abono/depósito en banco
  amountBs: number;
  amountUsd: number;
  isReconciled: boolean;
  reconciledWithJournalEntryId?: string;
  /** IDs de asientos que alguna vez se vincularon a esta línea; historial no removible. */
  reconciledJournalEntryIds?: string[];
  matchedBy?: 'AUTO_REF' | 'AUTO_AMOUNT' | 'MANUAL';
  reconciledAt?: string;
  notes?: string;
}

export interface BankReconciliationRecord {
  id: string;
  companyId: string;
  bankAccountId: string;
  cutoffDate: string;
  bankStatementBalanceBs: number;
  bankStatementBalanceUsd: number;
  bookBalanceBs: number;
  bookBalanceUsd: number;
  depositsInTransitBs: number;
  checksInTransitBs: number;
  bankDebitsNotInBooksBs: number;
  bankCreditsNotInBooksBs: number;
  adjustedBankBalanceBs: number;
  adjustedBookBalanceBs: number;
  differenceBs: number;
  isBalanced: boolean;
  notes?: string;
  createdAt: string;
}


/** Fecha fiscal/contable del abono en cuenta; los registros históricos conservan invoiceDate como fallback. */
export function getPurchaseAccountCreditDate(purchase: Pick<PurchaseRecord, 'invoiceDate' | 'accountCreditDate'>): string {
  return purchase.accountCreditDate || purchase.invoiceDate;
}
