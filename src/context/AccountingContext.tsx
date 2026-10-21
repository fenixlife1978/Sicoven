import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Company,
  Account,
  JournalEntry,
  PurchaseRecord,
  SaleRecord,
  InventoryProduct,
  InventoryMovement,
  VatRetentionVoucher,
  IslrRetentionVoucher,
  JournalEntryItem,
  BankAccount,
  BankStatementMovement
} from '../types/accounting';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../data/defaultChartOfAccounts';
import {
  INITIAL_COMPANIES,
  INITIAL_JOURNAL_ENTRIES,
  INITIAL_PURCHASES,
  INITIAL_SALES,
  INITIAL_INVENTORY_PRODUCTS,
  INITIAL_INVENTORY_MOVEMENTS,
  INITIAL_VAT_VOUCHERS,
  INITIAL_ISLR_VOUCHERS,
  INITIAL_BANK_ACCOUNTS,
  INITIAL_STATEMENT_MOVEMENTS
} from '../data/initialData';
import { formatVoucherNumber } from '../utils/formatters';
import { fetchBcvTodayRate, BcvSyncResult } from '../utils/bcvSync';

interface AccountingContextType {
  companies: Company[];
  isStorageReady: boolean;
  isDemoMode: boolean;
  demoUsage: Record<string, number>;
  currentCompany: Company;
  setCurrentCompanyId: (id: string) => void;
  addCompany: (comp: Omit<Company, 'id'>) => Company;
  updateCompany: (comp: Company) => void;
  updateBcvRate: (newRate: number, effectiveDate?: string) => void;

  // Sincronización oficial con bcv.today
  isSyncingBcv: boolean;
  bcvSyncStatus: 'synced' | 'syncing' | 'error' | 'idle';
  bcvSyncResult: BcvSyncResult | null;
  syncBcvRate: () => Promise<BcvSyncResult>;
  autoSyncBcv: boolean;
  setAutoSyncBcv: (enabled: boolean) => void;

  // Cuentas
  accounts: Account[];
  addAccount: (account: Account) => void;

  // Asientos
  journalEntries: JournalEntry[];
  addJournalEntry: (entry: Omit<JournalEntry, 'id' | 'companyId' | 'createdAt'>) => JournalEntry;
  deleteJournalEntry: (id: string) => void;

  // Compras
  purchases: PurchaseRecord[];
  addPurchase: (purchase: Omit<PurchaseRecord, 'id' | 'companyId' | 'opNumber'>) => PurchaseRecord;
  deletePurchase: (id: string) => void;

  // Ventas
  sales: SaleRecord[];
  addSale: (sale: Omit<SaleRecord, 'id' | 'companyId' | 'opNumber'>) => SaleRecord;
  deleteSale: (id: string) => void;

  // Inventario
  products: InventoryProduct[];
  addProduct: (product: Omit<InventoryProduct, 'id' | 'companyId'>) => InventoryProduct;
  updateProduct: (product: InventoryProduct) => void;
  movements: InventoryMovement[];
  addMovement: (movement: Omit<InventoryMovement, 'id' | 'companyId'>) => InventoryMovement;

  // Retenciones
  vatVouchers: VatRetentionVoucher[];
  islrVouchers: IslrRetentionVoucher[];
  deleteVatVoucher: (id: string) => void;
  deleteIslrVoucher: (id: string) => void;

  // Conciliación Bancaria
  bankAccounts: BankAccount[];
  bankStatementMovements: BankStatementMovement[];
  addBankAccount: (bank: Omit<BankAccount, 'id' | 'companyId'>) => BankAccount;
  addBankStatementMovement: (movement: Omit<BankStatementMovement, 'id' | 'companyId'>) => BankStatementMovement;
  deleteBankStatementMovement: (id: string) => void;
  reconcileMovementManual: (statementMovementId: string, journalEntryId?: string) => void;
  unreconcileMovement: (statementMovementId: string) => void;
  runAutoReconciliation: (bankAccountId: string) => { matchedCount: number; matchedRefs: string[] };
  unreconcileAll: (bankAccountId: string) => void;
  createAdjustingEntryForBankMovement: (statementMovement: BankStatementMovement, expenseOrIncomeAccountCode: string) => JournalEntry;

  // Moneda activa de visualización
  displayCurrency: 'BS' | 'USD' | 'DUAL';
  setDisplayCurrency: (curr: 'BS' | 'USD' | 'DUAL') => void;

  // Respaldo
  resetToSampleData: () => void;
  exportBackupJson: () => string;
  importBackupJson: (jsonData: string) => boolean;
}

const AccountingContext = createContext<AccountingContextType | undefined>(undefined);

const STORAGE_KEY = 'sicoven_accounting_data_v1';
const IS_DEMO = import.meta.env.VITE_SICOVEN_DEMO === 'true';
const DEMO_LIMIT = 10;
const DEMO_LABELS: Record<string, string> = { empresa: 'Empresas', diario: 'Libro Diario', compras: 'Compras', ventas: 'Ventas', inventario: 'Inventario', conciliacion: 'Conciliación Bancaria' };

export const AccountingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Cargar estado inicial desde localStorage o valores por defecto
  const [companies, setCompanies] = useState<Company[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_companies`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [currentCompanyId, setCurrentCompanyId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_currentCompanyId`);
      return saved && companies.some(c => c.id === saved) ? saved : companies[0]?.id || '';
    } catch {
      return 'comp-1';
    }
  });

  const [accounts, setAccounts] = useState<Account[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_accounts`);
      return saved ? JSON.parse(saved) : DEFAULT_CHART_OF_ACCOUNTS;
    } catch {
      return DEFAULT_CHART_OF_ACCOUNTS;
    }
  });

  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_journal`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [purchases, setPurchases] = useState<PurchaseRecord[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_purchases`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [sales, setSales] = useState<SaleRecord[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_sales`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [products, setProducts] = useState<InventoryProduct[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_products`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [movements, setMovements] = useState<InventoryMovement[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_movements`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [vatVouchers, setVatVouchers] = useState<VatRetentionVoucher[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_vatVouchers`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [islrVouchers, setIslrVouchers] = useState<IslrRetentionVoucher[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_islrVouchers`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_bankAccounts`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [bankStatementMovements, setBankStatementMovements] = useState<BankStatementMovement[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_statementMovements`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [displayCurrency, setDisplayCurrency] = useState<'BS' | 'USD' | 'DUAL'>('DUAL');
  const [demoUsage, setDemoUsage] = useState<Record<string, number>>({});
  const consumeDemoAction = (moduleKey: string) => {
    if (!IS_DEMO) return;
    const used = demoUsage[moduleKey] || 0;
    if (used >= DEMO_LIMIT) {
      const message = `La demostración agotó el máximo de ${DEMO_LIMIT} acciones en ${DEMO_LABELS[moduleKey] || moduleKey}. Adquiera SICOVEN completo para continuar sin limitaciones.`;
      window.alert(message);
      throw new Error(message);
    }
    setDemoUsage(prev => ({ ...prev, [moduleKey]: (prev[moduleKey] || 0) + 1 }));
  };

  const currentCompany: Company = companies.find(c => c.id === currentCompanyId) || companies[0] || {
    id: '', rif: '', name: 'Registre una empresa para comenzar', address: '', phone: '', email: '',
    taxpayerType: 'ORDINARIO', defaultIvaRetentionRate: 0, fiscalYear: new Date().getFullYear(), bcvRate: 0
  };

  const updateCompany = (updated: Company) => {
    setCompanies(prev => prev.map(c => (c.id === updated.id ? updated : c)));
  };

  const [autoSyncBcv, setAutoSyncBcv] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_autoSyncBcv`);
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [isSyncingBcv, setIsSyncingBcv] = useState<boolean>(false);
  const [bcvSyncStatus, setBcvSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'idle'>('idle');
  const [bcvSyncResult, setBcvSyncResult] = useState<BcvSyncResult | null>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_bcvSyncResult`);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_autoSyncBcv`, JSON.stringify(autoSyncBcv));
  }, [autoSyncBcv]);

  useEffect(() => {
    if (bcvSyncResult) {
      localStorage.setItem(`${STORAGE_KEY}_bcvSyncResult`, JSON.stringify(bcvSyncResult));
    }
  }, [bcvSyncResult]);

  // SQLite local es la persistencia operativa en la versión de escritorio.
  const [storageReady, setStorageReady] = useState(false);
  const stateSnapshot = {
    companies, currentCompanyId, accounts, journalEntries, purchases, sales, products, movements,
    vatVouchers, islrVouchers, bankAccounts, bankStatementMovements, displayCurrency, autoSyncBcv, bcvSyncResult, demoUsage
  };

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        if (window.sicovenStore) {
          const saved = await window.sicovenStore.load();
          if (cancelled) return;
          if (saved && typeof saved === 'object') {
            if (Array.isArray(saved.companies)) setCompanies(saved.companies as Company[]);
            if (typeof saved.currentCompanyId === 'string') setCurrentCompanyId(saved.currentCompanyId);
            if (Array.isArray(saved.accounts)) setAccounts(saved.accounts as Account[]);
            if (Array.isArray(saved.journalEntries)) setJournalEntries(saved.journalEntries as JournalEntry[]);
            if (Array.isArray(saved.purchases)) setPurchases(saved.purchases as PurchaseRecord[]);
            if (Array.isArray(saved.sales)) setSales(saved.sales as SaleRecord[]);
            if (Array.isArray(saved.products)) setProducts(saved.products as InventoryProduct[]);
            if (Array.isArray(saved.movements)) setMovements(saved.movements as InventoryMovement[]);
            if (Array.isArray(saved.vatVouchers)) setVatVouchers(saved.vatVouchers as VatRetentionVoucher[]);
            if (Array.isArray(saved.islrVouchers)) setIslrVouchers(saved.islrVouchers as IslrRetentionVoucher[]);
            if (Array.isArray(saved.bankAccounts)) setBankAccounts(saved.bankAccounts as BankAccount[]);
            if (Array.isArray(saved.bankStatementMovements)) setBankStatementMovements(saved.bankStatementMovements as BankStatementMovement[]);
            if (saved.displayCurrency === 'BS' || saved.displayCurrency === 'USD' || saved.displayCurrency === 'DUAL') setDisplayCurrency(saved.displayCurrency);
            if (typeof saved.autoSyncBcv === 'boolean') setAutoSyncBcv(saved.autoSyncBcv);
            if (saved.bcvSyncResult && typeof saved.bcvSyncResult === 'object') setBcvSyncResult(saved.bcvSyncResult as BcvSyncResult);
            if (saved.demoUsage && typeof saved.demoUsage === 'object') setDemoUsage(saved.demoUsage as Record<string, number>);
          } else if (IS_DEMO) {
            setCompanies(INITIAL_COMPANIES); setCurrentCompanyId(INITIAL_COMPANIES[0]?.id || '');
            setAccounts(DEFAULT_CHART_OF_ACCOUNTS); setJournalEntries(INITIAL_JOURNAL_ENTRIES);
            setPurchases(INITIAL_PURCHASES); setSales(INITIAL_SALES); setProducts(INITIAL_INVENTORY_PRODUCTS);
            setMovements(INITIAL_INVENTORY_MOVEMENTS); setVatVouchers(INITIAL_VAT_VOUCHERS);
            setIslrVouchers(INITIAL_ISLR_VOUCHERS); setBankAccounts(INITIAL_BANK_ACCOUNTS);
            setBankStatementMovements(INITIAL_STATEMENT_MOVEMENTS);
          } else {
            await window.sicovenStore.save(stateSnapshot);
          }
        }
      } catch (error) {
        console.error('No se pudo inicializar la persistencia SQLite de SICOVEN:', error);
      } finally {
        if (!cancelled) setStorageReady(true);
      }
    };
    void hydrate();
    return () => { cancelled = true; };
  // La hidratación se ejecuta una sola vez; stateSnapshot representa el legado disponible al inicio.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    if (window.sicovenStore) {
      window.sicovenStore.save(stateSnapshot).catch(error => {
        console.error('Error guardando los datos contables en SQLite:', error);
      });
      return;
    }
    // Solo para vista de desarrollo web; el ejecutable de escritorio usa SQLite.
    try {
      localStorage.setItem(`${STORAGE_KEY}_companies`, JSON.stringify(companies));
      localStorage.setItem(`${STORAGE_KEY}_currentCompanyId`, currentCompanyId);
      localStorage.setItem(`${STORAGE_KEY}_accounts`, JSON.stringify(accounts));
      localStorage.setItem(`${STORAGE_KEY}_journal`, JSON.stringify(journalEntries));
      localStorage.setItem(`${STORAGE_KEY}_purchases`, JSON.stringify(purchases));
      localStorage.setItem(`${STORAGE_KEY}_sales`, JSON.stringify(sales));
      localStorage.setItem(`${STORAGE_KEY}_products`, JSON.stringify(products));
      localStorage.setItem(`${STORAGE_KEY}_movements`, JSON.stringify(movements));
      localStorage.setItem(`${STORAGE_KEY}_vatVouchers`, JSON.stringify(vatVouchers));
      localStorage.setItem(`${STORAGE_KEY}_islrVouchers`, JSON.stringify(islrVouchers));
      localStorage.setItem(`${STORAGE_KEY}_bankAccounts`, JSON.stringify(bankAccounts));
      localStorage.setItem(`${STORAGE_KEY}_statementMovements`, JSON.stringify(bankStatementMovements));
      localStorage.setItem(`${STORAGE_KEY}_autoSyncBcv`, JSON.stringify(autoSyncBcv));
      if (bcvSyncResult) localStorage.setItem(`${STORAGE_KEY}_bcvSyncResult`, JSON.stringify(bcvSyncResult));
    } catch (error) {
      console.error('Error guardando datos locales de desarrollo:', error);
    }
  }, [storageReady, companies, currentCompanyId, accounts, journalEntries, purchases, sales, products, movements, vatVouchers, islrVouchers, bankAccounts, bankStatementMovements, displayCurrency, autoSyncBcv, bcvSyncResult]);

  const syncBcvRate = async (): Promise<BcvSyncResult> => {
    setIsSyncingBcv(true);
    setBcvSyncStatus('syncing');
    try {
      const result = await fetchBcvTodayRate();
      setBcvSyncResult(result);
      if (result.success && result.usd > 0) {
        setBcvSyncStatus('synced');
        // Actualizar la tasa en la empresa actual automáticamente
        setCompanies(prev =>
          prev.map(c => {
            if (c.id === currentCompanyId) {
              return {
                ...c,
                bcvRate: result.usd,
                lastRateUpdate: result.effectiveDate || new Date().toISOString().slice(0, 10),
              };
            }
            return c;
          })
        );
      } else {
        setBcvSyncStatus('error');
      }
      return result;
    } catch (err: any) {
      const failResult: BcvSyncResult = {
        success: false,
        usd: 0,
        effectiveDate: '',
        updatedAt: '',
        sourceUrl: 'https://bcv.today/api/rate.json',
        syncedAt: new Date().toLocaleTimeString('es-VE'),
        error: err?.message || 'Error al sincronizar con bcv.today'
      };
      setBcvSyncResult(failResult);
      setBcvSyncStatus('error');
      return failResult;
    } finally {
      setIsSyncingBcv(false);
    }
  };

  // Sincronización automática de tasa BCV al inicio
  useEffect(() => {
    if (autoSyncBcv && companies.length > 0) {
      syncBcvRate();
    }
  }, [companies.length, autoSyncBcv]);

  const addCompany = (comp: Omit<Company, 'id'>): Company => {
    consumeDemoAction('empresa');
    const newComp: Company = {
      ...comp,
      id: `comp-${Date.now()}`
    };
    setCompanies(prev => [...prev, newComp]);
    setCurrentCompanyId(newComp.id);
    return newComp;
  };

  const updateBcvRate = (newRate: number, effectiveDate?: string) => {
    if (!currentCompany || newRate <= 0) return;
    const today = effectiveDate || new Date().toISOString().split('T')[0];
    updateCompany({
      ...currentCompany,
      bcvRate: newRate,
      lastRateUpdate: today
    });
  };

  const addAccount = (account: Account) => {
    consumeDemoAction('catalogo');
    setAccounts(prev => {
      if (prev.some(a => a.code === account.code)) {
        return prev.map(a => (a.code === account.code ? account : a));
      }
      return [...prev, account].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    });
  };

  const addJournalEntry = (entry: Omit<JournalEntry, 'id' | 'companyId' | 'createdAt'>): JournalEntry => {
    // Verificación de Asientos: Validación estricta de Partida Doble (Débito = Crédito)
    const totalDebitBs = entry.items.reduce((sum, item) => sum + (Number(item.debitBs) || 0), 0);
    const totalCreditBs = entry.items.reduce((sum, item) => sum + (Number(item.creditBs) || 0), 0);
    const totalDebitUsd = entry.items.reduce((sum, item) => sum + (Number(item.debitUsd) || 0), 0);
    const totalCreditUsd = entry.items.reduce((sum, item) => sum + (Number(item.creditUsd) || 0), 0);
    const diff = Math.abs(totalDebitBs - totalCreditBs);
    const diffUsd = Math.abs(totalDebitUsd - totalCreditUsd);
    const invalidLines = entry.items.some(item =>
      !item.accountCode?.trim() ||
      [item.debitBs, item.creditBs, item.debitUsd, item.creditUsd].some(value => !Number.isFinite(Number(value)) || Number(value) < 0) ||
      (Number(item.debitBs) > 0 && Number(item.creditBs) > 0) ||
      (Number(item.debitUsd) > 0 && Number(item.creditUsd) > 0)
    );

    if (entry.items.length < 2 || invalidLines || diff >= 0.01 || diffUsd >= 0.01 || totalDebitBs <= 0 || totalDebitUsd <= 0) {
      throw new Error(
        `Verificación de asiento fallida. Bs: Debe ${totalDebitBs.toFixed(2)} / Haber ${totalCreditBs.toFixed(2)} (dif. ${diff.toFixed(2)}); USD: Debe ${totalDebitUsd.toFixed(2)} / Haber ${totalCreditUsd.toFixed(2)} (dif. ${diffUsd.toFixed(2)}). Revise líneas, importes y cuentas.`
      );
    }

    consumeDemoAction('diario');
    const companyEntries = journalEntries.filter(e => e.companyId === currentCompany.id);
    const maxEntryNum = companyEntries.reduce((max, e) => (e.entryNumber > max ? e.entryNumber : max), 0);
    const newEntry: JournalEntry = {
      ...entry,
      id: `entry-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      companyId: currentCompany.id,
      entryNumber: entry.entryNumber || maxEntryNum + 1,
      createdAt: new Date().toISOString()
    };
    setJournalEntries(prev => [...prev, newEntry]);
    return newEntry;
  };

  const deleteJournalEntry = (id: string) => {
    setJournalEntries(prev => prev.filter(e => e.id !== id));
  };

  // Registrar compra y generar asiento automático y comprobantes de retención
  const addPurchase = (purchaseData: Omit<PurchaseRecord, 'id' | 'companyId' | 'opNumber'>): PurchaseRecord => {
    consumeDemoAction('compras');
    const companyPurchases = purchases.filter(p => p.companyId === currentCompany.id);
    const nextOp = companyPurchases.length + 1;
    const purchaseId = `pur-${Date.now()}`;
    const rate = purchaseData.bcvRate || currentCompany.bcvRate;

    // Generar correlativo comprobante IVA si retiene
    let voucherNum = purchaseData.voucherNumber;
    const period = purchaseData.invoiceDate.slice(0, 7).replace('-', '');
    if (purchaseData.vatWithheldBs > 0 && !voucherNum) {
      const year = parseInt(purchaseData.invoiceDate.slice(0, 4), 10);
      const month = parseInt(purchaseData.invoiceDate.slice(5, 7), 10);
      const companyVouchersCount = vatVouchers.filter(v => v.companyId === currentCompany.id).length;
      voucherNum = formatVoucherNumber(year, month, companyVouchersCount + 1);
    }

    // 1. Generar Asiento Contable Automático en Libro Diario
    const items: JournalEntryItem[] = [];

    // Debe: Gasto u Operación / Inventario (Base Imponible)
    const debitAccountCode = purchaseData.taxableBaseBs > 0 ? '1.1.4.01' : '6.1.1.04';
    const debitAccountName = purchaseData.taxableBaseBs > 0
      ? 'Inventario de Mercancías para la Venta'
      : 'Honorarios Profesionales (Contables, Legales, Asesoría)';

    items.push({
      accountCode: debitAccountCode,
      accountName: debitAccountName,
      debitBs: purchaseData.taxableBaseBs,
      creditBs: 0,
      debitUsd: purchaseData.taxableBaseBs / rate,
      creditUsd: 0,
      description: `Compra Fac. ${purchaseData.invoiceNumber} - ${purchaseData.supplierName}`
    });

    // Debe: Crédito Fiscal IVA si aplica
    if (purchaseData.vatAmountBs > 0) {
      items.push({
        accountCode: '1.1.3.01',
        accountName: 'Crédito Fiscal IVA Compras (Alícuota General 16%)',
        debitBs: purchaseData.vatAmountBs,
        creditBs: 0,
        debitUsd: purchaseData.vatAmountBs / rate,
        creditUsd: 0,
        description: `IVA 16% Fac. ${purchaseData.invoiceNumber}`
      });
    }

    // Haber: Retención IVA por enterar al SENIAT (si la empresa retuvo)
    if (purchaseData.vatWithheldBs > 0) {
      items.push({
        accountCode: '2.1.2.03',
        accountName: 'Retenciones de IVA por Enterar (Agente Especial)',
        debitBs: 0,
        creditBs: purchaseData.vatWithheldBs,
        debitUsd: 0,
        creditUsd: purchaseData.vatWithheldBs / rate,
        description: `Retención IVA ${purchaseData.retentionRate}% s/Fac. ${purchaseData.invoiceNumber}`
      });
    }

    // Haber: Retención ISLR por enterar al SENIAT si aplica
    if (purchaseData.islrWithheldBs && purchaseData.islrWithheldBs > 0) {
      items.push({
        accountCode: '2.1.2.04',
        accountName: 'Retenciones de ISLR por Enterar (Decreto 1808)',
        debitBs: 0,
        creditBs: purchaseData.islrWithheldBs,
        debitUsd: 0,
        creditUsd: purchaseData.islrWithheldBs / rate,
        description: `Retención ISLR ${purchaseData.islrRate}% s/Fac. ${purchaseData.invoiceNumber}`
      });
    }

    // Haber: Cuenta por Pagar Proveedores (Monto Neto a cancelar)
    const netPayableBs =
      purchaseData.totalAmountBs - (purchaseData.vatWithheldBs || 0) - (purchaseData.islrWithheldBs || 0);

    items.push({
      accountCode: '2.1.1.01',
      accountName: 'Cuentas por Pagar Proveedores Nacionales',
      debitBs: 0,
      creditBs: netPayableBs,
      debitUsd: 0,
      creditUsd: netPayableBs / rate,
      description: `Neto a pagar Fac. ${purchaseData.invoiceNumber}`
    });

    const companyEntries = journalEntries.filter(e => e.companyId === currentCompany.id);
    const nextEntryNum = companyEntries.length + 1;

    const createdJournalEntry: JournalEntry = {
      id: `entry-pur-${Date.now()}`,
      companyId: currentCompany.id,
      entryNumber: nextEntryNum,
      date: purchaseData.invoiceDate,
      description: `Registro Factura de Compra N° ${purchaseData.invoiceNumber} - ${purchaseData.supplierName}`,
      type: 'COMPRA',
      bcvRate: rate,
      referenceDoc: `FAC-${purchaseData.invoiceNumber}`,
      items,
      createdAt: new Date().toISOString()
    };

    setJournalEntries(prev => [...prev, createdJournalEntry]);

    const finalPurchase: PurchaseRecord = {
      ...purchaseData,
      id: purchaseId,
      companyId: currentCompany.id,
      opNumber: nextOp,
      voucherNumber: voucherNum,
      journalEntryId: createdJournalEntry.id
    };

    setPurchases(prev => [...prev, finalPurchase]);

    // 2. Si retuvo IVA, crear el comprobante oficial de retención de IVA
    if (purchaseData.vatWithheldBs > 0 && voucherNum) {
      const vatVoucher: VatRetentionVoucher = {
        id: `vouch-iva-${Date.now()}`,
        companyId: currentCompany.id,
        voucherNumber: voucherNum,
        date: purchaseData.invoiceDate,
        period,
        supplierRif: purchaseData.supplierRif,
        supplierName: purchaseData.supplierName,
        supplierAddress: purchaseData.supplierAddress || 'Venezuela',
        purchaseRecordId: purchaseId,
        invoiceDate: purchaseData.invoiceDate,
        invoiceNumber: purchaseData.invoiceNumber,
        controlNumber: purchaseData.controlNumber,
        totalAmountBs: purchaseData.totalAmountBs,
        exemptAmountBs: purchaseData.exemptAmountBs,
        taxableBaseBs: purchaseData.taxableBaseBs,
        taxRate: purchaseData.taxRate,
        vatAmountBs: purchaseData.vatAmountBs,
        retentionRate: purchaseData.retentionRate,
        vatWithheldBs: purchaseData.vatWithheldBs,
        bcvRate: rate,
        totalAmountUsd: purchaseData.totalAmountUsd,
        vatWithheldUsd: purchaseData.vatWithheldUsd
      };
      setVatVouchers(prev => [...prev, vatVoucher]);
    }

    // 3. Si retuvo ISLR, crear comprobante oficial de retención de ISLR
    if (purchaseData.islrWithheldBs && purchaseData.islrWithheldBs > 0) {
      const islrVoucher: IslrRetentionVoucher = {
        id: `vouch-islr-${Date.now()}`,
        companyId: currentCompany.id,
        voucherNumber: `ISLR-${period}-${String(islrVouchers.filter(v => v.companyId === currentCompany.id).length + 1).padStart(6, '0')}`,
        date: purchaseData.invoiceDate,
        period,
        supplierRif: purchaseData.supplierRif,
        supplierName: purchaseData.supplierName,
        supplierAddress: purchaseData.supplierAddress || 'Venezuela',
        isPersonNatural: purchaseData.supplierRif.toUpperCase().startsWith('V') || purchaseData.supplierRif.toUpperCase().startsWith('E'),
        isResident: true,
        conceptCode: purchaseData.islrConceptCode || '012',
        conceptDescription: purchaseData.islrConceptName || 'Servicios en General (5%)',
        invoiceNumber: purchaseData.invoiceNumber,
        controlNumber: purchaseData.controlNumber,
        invoiceDate: purchaseData.invoiceDate,
        baseAmountBs: purchaseData.taxableBaseBs,
        retentionRate: purchaseData.islrRate || 2,
        subtrahendBs: purchaseData.islrSubtrahendBs || 0,
        withheldAmountBs: purchaseData.islrWithheldBs,
        bcvRate: rate,
        baseAmountUsd: purchaseData.taxableBaseUsd,
        withheldAmountUsd: purchaseData.islrWithheldUsd || (purchaseData.islrWithheldBs / rate)
      };
      setIslrVouchers(prev => [...prev, islrVoucher]);
    }

    return finalPurchase;
  };

  const deletePurchase = (id: string) => {
    const purchase = purchases.find(p => p.id === id);
    if (!purchase || purchase.companyId !== currentCompany.id) return;
    setPurchases(prev => prev.filter(p => p.id !== id));
    if (purchase.journalEntryId) {
      setJournalEntries(prev => prev.filter(entry => entry.id !== purchase.journalEntryId));
    }
    setVatVouchers(prev => prev.filter(voucher => voucher.purchaseRecordId !== id));
  };

  // Registrar venta y generar asiento contable
  const addSale = (saleData: Omit<SaleRecord, 'id' | 'companyId' | 'opNumber'>): SaleRecord => {
    consumeDemoAction('ventas');
    const companySales = sales.filter(s => s.companyId === currentCompany.id);
    const nextOp = companySales.length + 1;
    const saleId = `sale-${Date.now()}`;
    const rate = saleData.bcvRate || currentCompany.bcvRate;

    // Asiento contable
    const items: JournalEntryItem[] = [];

    // Debe: Retención de IVA por compensar si el cliente nos retuvo
    if (saleData.vatWithheldBs && saleData.vatWithheldBs > 0) {
      items.push({
        accountCode: '1.1.3.03',
        accountName: 'Retenciones de IVA Acumuladas por Descontar',
        debitBs: saleData.vatWithheldBs,
        creditBs: 0,
        debitUsd: saleData.vatWithheldBs / rate,
        creditUsd: 0,
        description: `Comprobante Retención IVA Cliente ${saleData.customerName}`
      });
    }

    // Debe: Cuentas por Cobrar Clientes (Total - Retención)
    const receivableBs = saleData.totalAmountBs - (saleData.vatWithheldBs || 0);
    items.push({
      accountCode: '1.1.2.01',
      accountName: 'Cuentas por Cobrar Clientes Comerciales',
      debitBs: receivableBs,
      creditBs: 0,
      debitUsd: receivableBs / rate,
      creditUsd: 0,
      description: `Por cobrar Fac. Venta ${saleData.invoiceNumber}`
    });

    // Haber: Ventas de Mercancías (Base imponible)
    items.push({
      accountCode: '4.1.1.01',
      accountName: 'Ventas de Mercancías (Alícuota General 16%)',
      debitBs: 0,
      creditBs: saleData.taxableBaseBs,
      debitUsd: 0,
      creditUsd: saleData.taxableBaseBs / rate,
      description: `Ingreso por venta Fac. ${saleData.invoiceNumber}`
    });

    // Haber: Débito Fiscal IVA Ventas
    if (saleData.vatAmountBs > 0) {
      items.push({
        accountCode: '2.1.2.01',
        accountName: 'Débito Fiscal IVA Ventas (Alícuota General 16%)',
        debitBs: 0,
        creditBs: saleData.vatAmountBs,
        debitUsd: 0,
        creditUsd: saleData.vatAmountBs / rate,
        description: `Débito fiscal 16% Fac. ${saleData.invoiceNumber}`
      });
    }

    const companyEntries = journalEntries.filter(e => e.companyId === currentCompany.id);
    const nextEntryNum = companyEntries.length + 1;

    const createdJournalEntry: JournalEntry = {
      id: `entry-sale-${Date.now()}`,
      companyId: currentCompany.id,
      entryNumber: nextEntryNum,
      date: saleData.invoiceDate,
      description: `Factura de Venta N° ${saleData.invoiceNumber} - ${saleData.customerName}`,
      type: 'VENTA',
      bcvRate: rate,
      referenceDoc: `FAC-${saleData.invoiceNumber}`,
      items,
      createdAt: new Date().toISOString()
    };

    setJournalEntries(prev => [...prev, createdJournalEntry]);

    const finalSale: SaleRecord = {
      ...saleData,
      id: saleId,
      companyId: currentCompany.id,
      opNumber: nextOp,
      journalEntryId: createdJournalEntry.id
    };

    setSales(prev => [...prev, finalSale]);
    return finalSale;
  };

  const deleteSale = (id: string) => {
    const sale = sales.find(item => item.id === id);
    if (!sale || sale.companyId !== currentCompany.id) return;
    setSales(prev => prev.filter(item => item.id !== id));
    if (sale.journalEntryId) {
      setJournalEntries(prev => prev.filter(entry => entry.id !== sale.journalEntryId));
    }
  };

  // Inventario
  const addProduct = (prodData: Omit<InventoryProduct, 'id' | 'companyId'>): InventoryProduct => {
    consumeDemoAction('inventario');
    const newProd: InventoryProduct = {
      ...prodData,
      id: `prod-${Date.now()}`,
      companyId: currentCompany.id
    };
    setProducts(prev => [...prev, newProd]);
    return newProd;
  };

  const updateProduct = (updated: InventoryProduct) => {
    setProducts(prev => prev.map(p => (p.id === updated.id ? updated : p)));
  };

  const addMovement = (movData: Omit<InventoryMovement, 'id' | 'companyId'>): InventoryMovement => {
    consumeDemoAction('inventario');
    const rate = currentCompany.bcvRate;
    const newMov: InventoryMovement = {
      ...movData,
      id: `mov-${Date.now()}`,
      companyId: currentCompany.id
    };

    setMovements(prev => [...prev, newMov]);

    // Actualizar producto en inventario
    const prod = products.find(p => p.id === movData.productId);
    if (prod) {
      let newStock = prod.currentStock;
      if (movData.type === 'ENTRADA') newStock += movData.quantity;
      else if (movData.type === 'SALIDA') newStock = Math.max(0, newStock - movData.quantity);
      else newStock = movData.quantity; // AJUSTE directo

      updateProduct({
        ...prod,
        currentStock: newStock,
        lastCostBs: movData.unitCostBs || prod.lastCostBs,
        lastCostUsd: movData.unitCostUsd || prod.lastCostUsd
      });

      // Si es salida por venta, generar asiento automático de costo de venta
      if (movData.type === 'SALIDA' && movData.concept === 'VENTA') {
        const companyEntries = journalEntries.filter(e => e.companyId === currentCompany.id);
        const nextEntryNum = companyEntries.length + 1;
        const totalBs = movData.totalCostBs;
        const totalUsd = movData.totalCostUsd || (totalBs / rate);

        const costEntry: JournalEntry = {
          id: `entry-cost-${Date.now()}`,
          companyId: currentCompany.id,
          entryNumber: nextEntryNum,
          date: movData.date,
          description: `Costo de Venta por Despacho Ref: ${movData.documentRef} (${prod.name})`,
          type: 'INVENTARIO',
          bcvRate: rate,
          referenceDoc: movData.documentRef,
          items: [
            {
              accountCode: '5.1.1.01',
              accountName: 'Costo de Ventas de Mercancías',
              debitBs: totalBs,
              creditBs: 0,
              debitUsd: totalUsd,
              creditUsd: 0,
              description: `Costo de ${movData.quantity} ${prod.unit}`
            },
            {
              accountCode: '1.1.4.01',
              accountName: 'Inventario de Mercancías para la Venta',
              debitBs: 0,
              creditBs: totalBs,
              debitUsd: 0,
              creditUsd: totalUsd,
              description: `Descargo de inventario`
            }
          ],
          createdAt: new Date().toISOString()
        };
        setJournalEntries(prev => [...prev, costEntry]);
      }
    }

    return newMov;
  };

  const deleteVatVoucher = (id: string) => {
    setVatVouchers(prev => prev.filter(v => v.id !== id));
  };

  const deleteIslrVoucher = (id: string) => {
    setIslrVouchers(prev => prev.filter(v => v.id !== id));
  };

  // Conciliación Bancaria
  const addBankAccount = (bankData: Omit<BankAccount, 'id' | 'companyId'>): BankAccount => {
    consumeDemoAction('conciliacion');
    const newBank: BankAccount = {
      ...bankData,
      id: `bank-acc-${Date.now()}`,
      companyId: currentCompany.id
    };
    setBankAccounts(prev => [...prev, newBank]);
    return newBank;
  };

  const addBankStatementMovement = (movData: Omit<BankStatementMovement, 'id' | 'companyId'>): BankStatementMovement => {
    consumeDemoAction('conciliacion');
    const newMov: BankStatementMovement = {
      ...movData,
      id: `stmt-${Date.now()}`,
      companyId: currentCompany.id
    };
    setBankStatementMovements(prev => [...prev, newMov]);
    return newMov;
  };

  const deleteBankStatementMovement = (id: string) => {
    setBankStatementMovements(prev => prev.filter(m => m.id !== id));
  };

  const reconcileMovementManual = (statementMovementId: string, journalEntryId?: string) => {
    consumeDemoAction('conciliacion');
    setBankStatementMovements(prev =>
      prev.map(m =>
        m.id === statementMovementId
          ? {
              ...m,
              isReconciled: true,
              matchedBy: 'MANUAL',
              reconciledWithJournalEntryId: journalEntryId || m.reconciledWithJournalEntryId,
              reconciledAt: new Date().toISOString()
            }
          : m
      )
    );
  };

  const unreconcileMovement = (statementMovementId: string) => {
    setBankStatementMovements(prev =>
      prev.map(m =>
        m.id === statementMovementId
          ? {
              ...m,
              isReconciled: false,
              matchedBy: undefined,
              reconciledWithJournalEntryId: undefined,
              reconciledAt: undefined
            }
          : m
      )
    );
  };

  const unreconcileAll = (bankAccountId: string) => {
    consumeDemoAction('conciliacion');
    setBankStatementMovements(prev =>
      prev.map(m =>
        m.companyId === currentCompany.id && m.bankAccountId === bankAccountId
          ? {
              ...m,
              isReconciled: false,
              matchedBy: undefined,
              reconciledWithJournalEntryId: undefined,
              reconciledAt: undefined
            }
          : m
      )
    );
  };

  const runAutoReconciliation = (bankAccountId: string): { matchedCount: number; matchedRefs: string[] } => {
    consumeDemoAction('conciliacion');
    const targetAccount = bankAccounts.find(b => b.id === bankAccountId);
    if (!targetAccount) return { matchedCount: 0, matchedRefs: [] };

    const bankCode = targetAccount.accountCode;
    const companyEntries = journalEntries.filter(e => e.companyId === currentCompany.id);
    const stmtMovements = bankStatementMovements.filter(
      m => m.companyId === currentCompany.id && m.bankAccountId === bankAccountId
    );

    let matchedCount = 0;
    const matchedRefs: string[] = [];

    const alreadyMatchedEntryIds = new Set<string>();
    for (const m of stmtMovements) {
      if (m.isReconciled && m.reconciledWithJournalEntryId) {
        alreadyMatchedEntryIds.add(m.reconciledWithJournalEntryId);
      }
    }

    setBankStatementMovements(prev => {
      return prev.map(stmt => {
        if (stmt.companyId !== currentCompany.id || stmt.bankAccountId !== bankAccountId || stmt.isReconciled) {
          return stmt;
        }

        // 1. Try match by Reference
        if (stmt.reference && stmt.reference !== '0') {
          const cleanRef = stmt.reference.trim().toLowerCase();
          const matchEntry = companyEntries.find(entry => {
            if (alreadyMatchedEntryIds.has(entry.id)) return false;
            const touchesBank = entry.items.some(it => it.accountCode === bankCode);
            if (!touchesBank) return false;

            const entryRef = (entry.referenceDoc || '').toLowerCase();
            const entryDesc = (entry.description || '').toLowerCase();
            return (
              (entryRef && (entryRef.includes(cleanRef) || cleanRef.includes(entryRef))) ||
              (entryDesc && entryDesc.includes(cleanRef))
            );
          });

          if (matchEntry) {
            alreadyMatchedEntryIds.add(matchEntry.id);
            matchedCount++;
            matchedRefs.push(stmt.reference);
            return {
              ...stmt,
              isReconciled: true,
              matchedBy: 'AUTO_REF',
              reconciledWithJournalEntryId: matchEntry.id,
              reconciledAt: new Date().toISOString()
            };
          }
        }

        // 2. Try match by Amount + Nature
        const matchByAmount = companyEntries.find(entry => {
          if (alreadyMatchedEntryIds.has(entry.id)) return false;
          return entry.items.some(it => {
            if (it.accountCode !== bankCode) return false;
            if (stmt.type === 'CREDIT') {
              return Math.abs(it.debitBs - stmt.amountBs) < 0.05;
            } else {
              return Math.abs(it.creditBs - stmt.amountBs) < 0.05;
            }
          });
        });

        if (matchByAmount) {
          alreadyMatchedEntryIds.add(matchByAmount.id);
          matchedCount++;
          matchedRefs.push(stmt.reference || `Bs. ${stmt.amountBs}`);
          return {
            ...stmt,
            isReconciled: true,
            matchedBy: 'AUTO_AMOUNT',
            reconciledWithJournalEntryId: matchByAmount.id,
            reconciledAt: new Date().toISOString()
          };
        }

        return stmt;
      });
    });

    return { matchedCount, matchedRefs };
  };

  const createAdjustingEntryForBankMovement = (
    statementMovement: BankStatementMovement,
    contraAccountCode: string
  ): JournalEntry => {
    const targetBank = bankAccounts.find(b => b.id === statementMovement.bankAccountId);
    const bankAccountCode = targetBank ? targetBank.accountCode : '1.1.1.03';
    const bankAccountName = targetBank ? targetBank.bankName : 'Banco Nacional de Crédito - Cta. Corriente Bs.';
    const contraAccount = accounts.find(a => a.code === contraAccountCode);
    const contraAccountName = contraAccount ? contraAccount.name : 'Comisiones y Gastos Bancarios';

    const companyEntries = journalEntries.filter(e => e.companyId === currentCompany.id);
    const nextEntryNum = companyEntries.length + 1;
    const rate = currentCompany.bcvRate;
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error('Configure una tasa BCV válida para generar el asiento de conciliación.');
    }
    const amountBs = statementMovement.amountBs;
    const amountUsd = statementMovement.amountUsd || (amountBs / rate);

    const items: JournalEntryItem[] = [];

    if (statementMovement.type === 'DEBIT') {
      items.push({
        accountCode: contraAccountCode,
        accountName: contraAccountName,
        debitBs: amountBs,
        creditBs: 0,
        debitUsd: amountUsd,
        creditUsd: 0,
        description: statementMovement.description
      });
      items.push({
        accountCode: bankAccountCode,
        accountName: bankAccountName,
        debitBs: 0,
        creditBs: amountBs,
        debitUsd: 0,
        creditUsd: amountUsd,
        description: `Nota de Débito Bancaria Ref: ${statementMovement.reference}`
      });
    } else {
      items.push({
        accountCode: bankAccountCode,
        accountName: bankAccountName,
        debitBs: amountBs,
        creditBs: 0,
        debitUsd: amountUsd,
        creditUsd: 0,
        description: `Nota de Crédito Bancaria Ref: ${statementMovement.reference}`
      });
      items.push({
        accountCode: contraAccountCode,
        accountName: contraAccountName,
        debitBs: 0,
        creditBs: amountBs,
        debitUsd: 0,
        creditUsd: amountUsd,
        description: statementMovement.description
      });
    }

    const adjustingEntry: JournalEntry = {
      id: `entry-bank-adj-${Date.now()}`,
      companyId: currentCompany.id,
      entryNumber: nextEntryNum,
      date: statementMovement.date,
      description: `Ajuste Conciliación Bancaria: ${statementMovement.description}`,
      type: 'AJUSTE',
      bcvRate: rate,
      referenceDoc: statementMovement.reference,
      items,
      isAdjusted: true,
      createdAt: new Date().toISOString()
    };

    setJournalEntries(prev => [...prev, adjustingEntry]);

    reconcileMovementManual(statementMovement.id, adjustingEntry.id);

    return adjustingEntry;
  };

  const resetToSampleData = () => {
    if (!IS_DEMO) { setCompanies([]); setCurrentCompanyId(''); setAccounts(DEFAULT_CHART_OF_ACCOUNTS); setJournalEntries([]); setPurchases([]); setSales([]); setProducts([]); setMovements([]); setVatVouchers([]); setIslrVouchers([]); setBankAccounts([]); setBankStatementMovements([]); setDemoUsage({}); return; }
    setCompanies(INITIAL_COMPANIES);
    setCurrentCompanyId(INITIAL_COMPANIES[0].id);
    setAccounts(DEFAULT_CHART_OF_ACCOUNTS);
    setJournalEntries(INITIAL_JOURNAL_ENTRIES);
    setPurchases(INITIAL_PURCHASES);
    setSales(INITIAL_SALES);
    setProducts(INITIAL_INVENTORY_PRODUCTS);
    setMovements(INITIAL_INVENTORY_MOVEMENTS);
    setVatVouchers(INITIAL_VAT_VOUCHERS);
    setIslrVouchers(INITIAL_ISLR_VOUCHERS);
    setBankAccounts(INITIAL_BANK_ACCOUNTS);
    setBankStatementMovements(INITIAL_STATEMENT_MOVEMENTS);
  };

  const exportBackupJson = (): string => {
    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      companies,
      accounts,
      journalEntries,
      purchases,
      sales,
      products,
      movements,
      vatVouchers,
      islrVouchers,
      bankAccounts,
      bankStatementMovements
    };
    return JSON.stringify(backup, null, 2);
  };

  const importBackupJson = (jsonData: string): boolean => {
    try {
      const data = JSON.parse(jsonData);
      const requiredCollections = [
        'companies', 'accounts', 'journalEntries', 'purchases', 'sales', 'products',
        'movements', 'vatVouchers', 'islrVouchers', 'bankAccounts', 'bankStatementMovements'
      ] as const;
      if (!data || typeof data !== 'object' || requiredCollections.some(key => !Array.isArray(data[key]))) {
        throw new Error('El respaldo está incompleto o no contiene todas las colecciones requeridas.');
      }
      if (data.companies.length === 0 || data.companies.some((c: any) =>
        !c || typeof c.id !== 'string' || !c.id.trim() || typeof c.rif !== 'string' || typeof c.name !== 'string'
      )) throw new Error('El respaldo contiene empresas inválidas.');
      const companyIds = new Set(data.companies.map((c: Company) => c.id));
      if (data.journalEntries.some((entry: any) => !entry || !companyIds.has(entry.companyId) || !Array.isArray(entry.items))) {
        throw new Error('Hay asientos asociados a empresas inexistentes o con líneas inválidas.');
      }
      for (const key of requiredCollections) {
        const rows = data[key] as any[];
        if (rows.some(row => !row || typeof row !== 'object' || (row.companyId && !companyIds.has(row.companyId)))) {
          throw new Error(`La colección ${key} contiene registros inválidos o vinculados a empresas inexistentes.`);
        }
      }
      setCompanies(data.companies);
      setAccounts(data.accounts);
      setJournalEntries(data.journalEntries);
      setPurchases(data.purchases);
      setSales(data.sales);
      setProducts(data.products);
      setMovements(data.movements);
      setVatVouchers(data.vatVouchers);
      setIslrVouchers(data.islrVouchers);
      setBankAccounts(data.bankAccounts);
      setBankStatementMovements(data.bankStatementMovements);
      setCurrentCompanyId(data.companies[0].id);
      return true;
    } catch (e) {
      console.error('Error importing backup:', e);
      return false;
    }
  };

  return (
    <AccountingContext.Provider
      value={{
        companies,
        isStorageReady: storageReady,
        isDemoMode: IS_DEMO,
        demoUsage,
        currentCompany,
        setCurrentCompanyId,
        addCompany,
        updateCompany,
        updateBcvRate,
        isSyncingBcv,
        bcvSyncStatus,
        bcvSyncResult,
        syncBcvRate,
        autoSyncBcv,
        setAutoSyncBcv,
        accounts,
        addAccount,
        journalEntries: journalEntries.filter(e => e.companyId === currentCompany.id),
        addJournalEntry,
        deleteJournalEntry,
        purchases: purchases.filter(p => p.companyId === currentCompany.id),
        addPurchase,
        deletePurchase,
        sales: sales.filter(s => s.companyId === currentCompany.id),
        addSale,
        deleteSale,
        products: products.filter(p => p.companyId === currentCompany.id),
        addProduct,
        updateProduct,
        movements: movements.filter(m => m.companyId === currentCompany.id),
        addMovement,
        vatVouchers: vatVouchers.filter(v => v.companyId === currentCompany.id),
        islrVouchers: islrVouchers.filter(v => v.companyId === currentCompany.id),
        deleteVatVoucher,
        deleteIslrVoucher,
        bankAccounts: bankAccounts.filter(b => b.companyId === currentCompany.id),
        bankStatementMovements: bankStatementMovements.filter(m => m.companyId === currentCompany.id),
        addBankAccount,
        addBankStatementMovement,
        deleteBankStatementMovement,
        reconcileMovementManual,
        unreconcileMovement,
        runAutoReconciliation,
        unreconcileAll,
        createAdjustingEntryForBankMovement,
        displayCurrency,
        setDisplayCurrency,
        resetToSampleData,
        exportBackupJson,
        importBackupJson
      }}
    >
      {children}
    </AccountingContext.Provider>
  );
};

export const useAccounting = () => {
  const context = useContext(AccountingContext);
  if (!context) {
    throw new Error('useAccounting must be used within an AccountingProvider');
  }
  return context;
};
