import {
  Company,
  JournalEntry,
  PurchaseRecord,
  SaleRecord,
  InventoryProduct,
  InventoryMovement,
  VatRetentionVoucher,
  IslrRetentionVoucher,
  BankAccount,
  BankStatementMovement
} from '../types/accounting';

// Edición de producción limpia: sin datos de ejemplo ficticios
export const INITIAL_COMPANIES: Company[] = [];
export const INITIAL_PURCHASES: PurchaseRecord[] = [];
export const INITIAL_SALES: SaleRecord[] = [];
export const INITIAL_INVENTORY_PRODUCTS: InventoryProduct[] = [];
export const INITIAL_INVENTORY_MOVEMENTS: InventoryMovement[] = [];
export const INITIAL_VAT_VOUCHERS: VatRetentionVoucher[] = [];
export const INITIAL_ISLR_VOUCHERS: IslrRetentionVoucher[] = [];
export const INITIAL_BANK_ACCOUNTS: BankAccount[] = [];
export const INITIAL_STATEMENT_MOVEMENTS: BankStatementMovement[] = [];
export const INITIAL_JOURNAL_ENTRIES: JournalEntry[] = [];
