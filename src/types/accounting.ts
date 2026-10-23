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
  fiscalYear: number; // e.g. 2026
  bcvRate: number; // Tasa oficial BCV Bs/$
  lastRateUpdate?: string;
  logoUrl?: string; // URL o base64 del logo de la empresa
}

export type AccountType = 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESOS' | 'COSTOS' | 'GASTOS';

export interface Account {
  code: string; // e.g. "1.1.1.01"
  name: string;
  type: AccountType;
  level: number; // 1 to 5
  isMovement: boolean; // Solo las cuentas de movimiento aceptan asientos
  parentCode?: string;
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
  | 'CIERRE';

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
}

export interface PurchaseRecord {
  id: string;
  companyId: string;
  opNumber: number;
  invoiceDate: string; // YYYY-MM-DD
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
  // Condiciones comerciales y fiscales del crédito (se preservan por documento)
  paymentTerm?: 'CONTADO' | 'CREDITO';
  creditDays?: number;
  dueDate?: string; // YYYY-MM-DD
  currencyPricingMode?: 'USD_FIJO' | 'BS_AJUSTABLE' | 'REVISION_MANUAL';
  fiscalAdjustmentMode?: 'IVA_ORIGINAL_DIF_CAMBIARIA' | 'AJUSTE_BASE_IVA' | 'REVISION_CONTADOR';
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
}

export interface IslrConcept {
  code: string; // e.g. "001", "002"
  description: string;
  category: 'PN' | 'PJ';
  isResident: boolean;
  rate: number; // porcentaje ej 3% o 5%
  appliesSubtrahend: boolean;
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

