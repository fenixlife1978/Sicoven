import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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
import { CreditSettlement, CreditBalance, CreditSettlementDraft, calculateCreditBalance, validateCreditSettlement } from '../types/creditSettlement';
import { calculateFxFiscalAdjustment } from '../types/fxFiscalAdjustment';
import { calculateFifoIssue, calculateWeightedAverageCost, validateInventoryMovement, type CostLayer } from '../types/inventoryAccounting';
import { isValidIsoDate } from '../types/migrationParsing';

interface AccountingContextType {
  companies: Company[];
  isStorageReady: boolean;
  storageError: string | null;
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

  // Liquidaciones de crédito
  creditSettlements: CreditSettlement[];
  getCreditBalance: (documentId: string, kind: 'SALE_COLLECTION' | 'PURCHASE_PAYMENT') => CreditBalance;
  addCreditSettlement: (draft: CreditSettlementDraft) => CreditSettlement;

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
  importInventoryProducts: (products: Omit<InventoryProduct, 'id' | 'companyId'>[]) => number;
  importInventoryMovements: (movements: Omit<InventoryMovement, 'id' | 'companyId'>[]) => number;
  executeProduction: (finishedProductId: string, outputQuantity: number, date: string, bcvRate: number, documentRef: string) => InventoryMovement[];
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
  addBankAccount: (bank: Omit<BankAccount, 'id' | 'companyId' | 'accountCode'>) => BankAccount;
  registerTreasuryMovement: (draft: { bankAccountId: string; date: string; reference: string; description: string; type: 'INCOME' | 'EXPENSE' | 'TRANSFER'; amount: number; counterpartAccountCode?: string; destinationBankAccountId?: string }) => JournalEntry;
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
  resetFactoryData: () => void;
  exportBackupJson: () => string;
  importBackupJson: (jsonData: string) => boolean;
}

const AccountingContext = createContext<AccountingContextType | undefined>(undefined);

const STORAGE_KEY = 'sicoven_accounting_data_v1';
// En escritorio, SQLite es la única fuente operativa; localStorage se reserva
// para la vista web de desarrollo y nunca inicializa datos del instalador.
const readBrowserStorage = (key: string): string | null => {
  if (typeof window !== 'undefined' && window.sicovenStore) return null;
  try { return localStorage.getItem(key); } catch { return null; }
};

export const AccountingProvider: React.FC<{ children: React.ReactNode; token: string }> = ({ children, token }) => {
  // Cargar estado inicial desde localStorage o valores por defecto
  const [companies, setCompanies] = useState<Company[]>(() => {
    try {
      const saved = readBrowserStorage(`${STORAGE_KEY}_companies`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [currentCompanyId, setCurrentCompanyId] = useState<string>(() => {
    try {
      const saved = readBrowserStorage(`${STORAGE_KEY}_currentCompanyId`);
      return saved && companies.some(c => c.id === saved) ? saved : companies[0]?.id || '';
    } catch {
      return 'comp-1';
    }
  });

  const [accounts, setAccounts] = useState<Account[]>(() => {
    try {
      const saved = readBrowserStorage(`${STORAGE_KEY}_accounts`);
      return saved ? JSON.parse(saved) : DEFAULT_CHART_OF_ACCOUNTS;
    } catch {
      return DEFAULT_CHART_OF_ACCOUNTS;
    }
  });

  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() => {
    try {
      const saved = readBrowserStorage(`${STORAGE_KEY}_journal`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [purchases, setPurchases] = useState<PurchaseRecord[]>(() => {
    try {
      const saved = readBrowserStorage(`${STORAGE_KEY}_purchases`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [sales, setSales] = useState<SaleRecord[]>(() => {
    try {
      const saved = readBrowserStorage(`${STORAGE_KEY}_sales`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [products, setProducts] = useState<InventoryProduct[]>(() => {
    try {
      const saved = readBrowserStorage(`${STORAGE_KEY}_products`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [movements, setMovements] = useState<InventoryMovement[]>(() => {
    try {
      const saved = readBrowserStorage(`${STORAGE_KEY}_movements`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [vatVouchers, setVatVouchers] = useState<VatRetentionVoucher[]>(() => {
    try {
      const saved = readBrowserStorage(`${STORAGE_KEY}_vatVouchers`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [islrVouchers, setIslrVouchers] = useState<IslrRetentionVoucher[]>(() => {
    try {
      const saved = readBrowserStorage(`${STORAGE_KEY}_islrVouchers`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => {
    try {
      const saved = readBrowserStorage(`${STORAGE_KEY}_bankAccounts`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [bankStatementMovements, setBankStatementMovements] = useState<BankStatementMovement[]>(() => {
    try {
      const saved = readBrowserStorage(`${STORAGE_KEY}_statementMovements`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [creditSettlements, setCreditSettlements] = useState<CreditSettlement[]>([]);
  const settlementInFlightRef = useRef<Set<string>>(new Set());
  // Los importadores pueden registrar varias facturas en el mismo ciclo de React;
  // estos contadores evitan reutilizar correlativos e identificadores por estado obsoleto.
  const saleSequenceRef = useRef<Record<string, number>>({});
  const purchaseSequenceRef = useRef<Record<string, number>>({});
  const journalSequenceRef = useRef<Record<string, number>>({});
  const vatVoucherSequenceRef = useRef<Record<string, number>>({});
  const islrVoucherSequenceRef = useRef<Record<string, number>>({});
  const [displayCurrency, setDisplayCurrency] = useState<'BS' | 'USD' | 'DUAL'>('DUAL');
  // El acceso de prueba se controla por la licencia de 24 horas, nunca por cantidad de acciones.
  // Se conserva este punto de compatibilidad para las operaciones existentes sin bloquearlas.

  const currentCompany: Company = companies.find(c => c.id === currentCompanyId) || companies[0] || {
    id: '', rif: '', name: 'Registre una empresa para comenzar', address: '', phone: '', email: '',
    taxpayerType: 'ORDINARIO', defaultIvaRetentionRate: 0, fiscalYear: new Date().getFullYear(), bcvRate: 0
  };

  const updateCompany = (updated: Company) => {
    setCompanies(prev => prev.map(c => (c.id === updated.id ? updated : c)));
  };

  const [autoSyncBcv, setAutoSyncBcv] = useState<boolean>(() => {
    try {
      const saved = readBrowserStorage(`${STORAGE_KEY}_autoSyncBcv`);
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [isSyncingBcv, setIsSyncingBcv] = useState<boolean>(false);
  const [bcvSyncStatus, setBcvSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'idle'>('idle');
  const [bcvSyncResult, setBcvSyncResult] = useState<BcvSyncResult | null>(() => {
    try {
      const saved = readBrowserStorage(`${STORAGE_KEY}_bcvSyncResult`);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!window.sicovenStore) {
      localStorage.setItem(`${STORAGE_KEY}_autoSyncBcv`, JSON.stringify(autoSyncBcv));
    }
  }, [autoSyncBcv]);

  useEffect(() => {
    if (!window.sicovenStore && bcvSyncResult) {
      localStorage.setItem(`${STORAGE_KEY}_bcvSyncResult`, JSON.stringify(bcvSyncResult));
    }
  }, [bcvSyncResult]);

  // SQLite local es la persistencia operativa en la versión de escritorio.
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const stateSnapshot = {
    companies, currentCompanyId, accounts, journalEntries, purchases, sales, products, movements,
    vatVouchers, islrVouchers, bankAccounts, bankStatementMovements, creditSettlements, displayCurrency, autoSyncBcv, bcvSyncResult
  };

  useEffect(() => {
    let cancelled = false;
    let initialized = false;
    const hydrate = async () => {
      try {
        if (window.sicovenStore) {
          let saved = await window.sicovenStore.load(token);
          if (cancelled) return;
          // Purga completa de cualquier dato de demostración heredado (comp-1, comp-2)
          // tanto en la edición completa como en la demo, garantizando que ninguna incluya datos ficticios.
          if (saved && typeof saved === 'object' && Array.isArray(saved.companies)) {
            const isLegacyDemo = (c: Company) => {
              const id = String(c?.id || '');
              const n = String(c?.name || '').toLowerCase();
              return id === 'comp-1' || id === 'comp-2' ||
                (n.includes('los andes') && n.includes('distrib')) ||
                (n.includes('caribe') && n.includes('tecnol'));
            };
            const hasLegacyDemo = saved.companies.some(isLegacyDemo);
            if (hasLegacyDemo) {
              const cleanedCompanies = saved.companies.filter((c: Company) => !isLegacyDemo(c));
              const demoIds = new Set(['comp-1', 'comp-2']);
              saved = {
                ...saved,
                companies: cleanedCompanies,
                currentCompanyId: cleanedCompanies[0]?.id || '',
                purchases: Array.isArray(saved.purchases) ? saved.purchases.filter((p: any) => !demoIds.has(p.companyId)) : [],
                sales: Array.isArray(saved.sales) ? saved.sales.filter((s: any) => !demoIds.has(s.companyId)) : [],
                journalEntries: Array.isArray(saved.journalEntries) ? saved.journalEntries.filter((j: any) => !demoIds.has(j.companyId) && j.id !== 'entry-apertura-1') : [],
                products: Array.isArray(saved.products) ? saved.products.filter((pr: any) => !demoIds.has(pr.companyId)) : [],
                movements: Array.isArray(saved.movements) ? saved.movements.filter((m: any) => !demoIds.has(m.companyId)) : [],
                vatVouchers: Array.isArray(saved.vatVouchers) ? saved.vatVouchers.filter((v: any) => !demoIds.has(v.companyId)) : [],
                islrVouchers: Array.isArray(saved.islrVouchers) ? saved.islrVouchers.filter((i: any) => !demoIds.has(i.companyId)) : [],
                bankAccounts: Array.isArray(saved.bankAccounts) ? saved.bankAccounts.filter((b: any) => !demoIds.has(b.companyId)) : [],
                bankStatementMovements: Array.isArray(saved.bankStatementMovements) ? saved.bankStatementMovements.filter((bm: any) => !demoIds.has(bm.companyId)) : [],
                creditSettlements: Array.isArray(saved.creditSettlements) ? saved.creditSettlements.filter((cs: any) => !demoIds.has(cs.companyId)) : [],
              };
              await window.sicovenStore.save(token, saved);
            }
          }

          if (saved && typeof saved === 'object') {
            if (Array.isArray(saved.companies)) setCompanies(saved.companies as Company[]);
            if (typeof saved.currentCompanyId === 'string') setCurrentCompanyId(saved.currentCompanyId);
            if (Array.isArray(saved.accounts)) {
              const savedAccounts = saved.accounts as Account[];
              const savedCodes = new Set(savedAccounts.map(account => account.code));
              // Migración compatible: incorpora cuentas nuevas de inventario sin sobrescribir el plan personalizado.
              setAccounts([...savedAccounts, ...DEFAULT_CHART_OF_ACCOUNTS.filter(account => !savedCodes.has(account.code))]
                .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })));
            }
            if (Array.isArray(saved.journalEntries)) setJournalEntries(saved.journalEntries as JournalEntry[]);
            if (Array.isArray(saved.purchases)) setPurchases(saved.purchases as PurchaseRecord[]);
            if (Array.isArray(saved.sales)) setSales(saved.sales as SaleRecord[]);
            if (Array.isArray(saved.products)) setProducts(saved.products as InventoryProduct[]);
            if (Array.isArray(saved.movements)) setMovements(saved.movements as InventoryMovement[]);
            if (Array.isArray(saved.vatVouchers)) setVatVouchers(saved.vatVouchers as VatRetentionVoucher[]);
            if (Array.isArray(saved.islrVouchers)) setIslrVouchers(saved.islrVouchers as IslrRetentionVoucher[]);
            if (Array.isArray(saved.bankAccounts)) setBankAccounts(saved.bankAccounts as BankAccount[]);
            if (Array.isArray(saved.bankStatementMovements)) setBankStatementMovements(saved.bankStatementMovements as BankStatementMovement[]);
            if (Array.isArray(saved.creditSettlements)) setCreditSettlements(saved.creditSettlements as CreditSettlement[]);
            if (saved.displayCurrency === 'BS' || saved.displayCurrency === 'USD' || saved.displayCurrency === 'DUAL') setDisplayCurrency(saved.displayCurrency);
            if (typeof saved.autoSyncBcv === 'boolean') setAutoSyncBcv(saved.autoSyncBcv);
            if (saved.bcvSyncResult && typeof saved.bcvSyncResult === 'object') setBcvSyncResult(saved.bcvSyncResult as BcvSyncResult);
          } else {
            // Arranque limpio sin datos ficticios para ambas ediciones (completa y DEMO)
            setCompanies([]);
            setCurrentCompanyId('');
            setAccounts(DEFAULT_CHART_OF_ACCOUNTS);
            setJournalEntries([]);
            setPurchases([]);
            setSales([]);
            setProducts([]);
            setMovements([]);
            setVatVouchers([]);
            setIslrVouchers([]);
            setBankAccounts([]);
            setBankStatementMovements([]);
            setCreditSettlements([]);
            await window.sicovenStore.save(token, stateSnapshot);
          }
        }
        initialized = true;
      } catch (error) {
        console.error('No se pudo inicializar la persistencia SQLite de SICOVEN:', error);
        setStorageError(error instanceof Error ? error.message : 'Error desconocido al abrir la base de datos local.');
      } finally {
        // Fail closed: si SQLite no se pudo leer/escribir, no habilitar
        // operaciones que puedan sobrescribir datos contables existentes.
        if (!cancelled && initialized) setStorageReady(true);
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
      window.sicovenStore.save(token, stateSnapshot).catch(error => {
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
  }, [storageReady, companies, currentCompanyId, accounts, journalEntries, purchases, sales, products, movements, vatVouchers, islrVouchers, bankAccounts, bankStatementMovements, creditSettlements, displayCurrency, autoSyncBcv, bcvSyncResult]);

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
    const companyEntries = journalEntries.filter(e => e.companyId === currentCompany.id);
    const maxEntryNum = companyEntries.reduce((max, e) => (e.entryNumber > max ? e.entryNumber : max), 0);
    const sequenceKey = currentCompany.id;
    const currentSequence = Math.max(maxEntryNum, journalSequenceRef.current[sequenceKey] || 0);
    const nextEntryNum = entry.entryNumber && entry.entryNumber > currentSequence ? entry.entryNumber : currentSequence + 1;
    journalSequenceRef.current[sequenceKey] = Math.max(journalSequenceRef.current[sequenceKey] || 0, nextEntryNum);
    const newEntry: JournalEntry = {
      ...entry,
      id: `entry-${sequenceKey}-${nextEntryNum}-${Date.now()}`,
      companyId: currentCompany.id,
      entryNumber: nextEntryNum,
      createdAt: new Date().toISOString()
    };
    setJournalEntries(prev => [...prev, newEntry]);
    return newEntry;
  };

  const getCreditPrincipal = (document: SaleRecord | PurchaseRecord, kind: 'SALE_COLLECTION' | 'PURCHASE_PAYMENT') => {
    // Las cuentas por cobrar/pagar se reconocen por el neto realmente pendiente:
    // en ventas se resta la retención de IVA del cliente; en compras, las
    // retenciones de IVA e ISLR enterables. El asiento original ya usa estos netos.
    const withheldBs = kind === 'SALE_COLLECTION'
      ? Number((document as SaleRecord).vatWithheldBs || 0)
      : Number((document as PurchaseRecord).vatWithheldBs || 0) + Number((document as PurchaseRecord).islrWithheldBs || 0);
    const withheldUsd = kind === 'SALE_COLLECTION'
      ? Number((document as SaleRecord).vatWithheldUsd || 0)
      : Number((document as PurchaseRecord).vatWithheldUsd || 0) + Number((document as PurchaseRecord).islrWithheldUsd || 0);
    const originalAmountBs = Math.max(0, Number(document.totalAmountBs || 0) - withheldBs);
    const invoiceRate = Number(document.bcvRate) > 0
      ? Number(document.bcvRate)
      : (Number(document.totalAmountUsd) > 0 ? Number(document.totalAmountBs) / Number(document.totalAmountUsd) : 0);
    const originalAmountUsd = withheldUsd > 0
      ? Math.max(0, Number(document.totalAmountUsd || 0) - withheldUsd)
      : (withheldBs > 0 && invoiceRate > 0
        ? Math.round((originalAmountBs / invoiceRate + Number.EPSILON) * 100) / 100
        : Math.max(0, Number(document.totalAmountUsd || 0)));
    return { originalAmountUsd, originalAmountBs };
  };

  const getCreditBalance = (documentId: string, kind: 'SALE_COLLECTION' | 'PURCHASE_PAYMENT'): CreditBalance => {
    const document = kind === 'SALE_COLLECTION'
      ? sales.find(item => item.id === documentId && item.companyId === currentCompany.id)
      : purchases.find(item => item.id === documentId && item.companyId === currentCompany.id);
    if (!document) throw new Error('No se encontró la factura en la empresa activa.');
    const principal = getCreditPrincipal(document, kind);
    return calculateCreditBalance(
      documentId,
      principal.originalAmountUsd,
      principal.originalAmountBs,
      creditSettlements.filter(item => item.companyId === currentCompany.id && item.kind === kind)
    );
  };

  const addCreditSettlement = (draft: CreditSettlementDraft): CreditSettlement => {
    const kind = draft.kind;
    const document = kind === 'SALE_COLLECTION'
      ? sales.find(item => item.id === draft.documentId && item.companyId === currentCompany.id)
      : purchases.find(item => item.id === draft.documentId && item.companyId === currentCompany.id);
    if (!document) throw new Error('La factura no existe en la empresa activa.');
    if (document.paymentTerm !== 'CREDITO') throw new Error('Solo se pueden liquidar facturas identificadas como crédito.');
    const prior = creditSettlements.filter(item => item.companyId === currentCompany.id && item.documentId === draft.documentId && item.kind === kind);
    const principal = getCreditPrincipal(document, kind);
    const balance = calculateCreditBalance(draft.documentId, principal.originalAmountUsd, principal.originalAmountBs, prior);
    const error = validateCreditSettlement(draft, balance.outstandingUsd);
    if (error) throw new Error(error);
    const normalizedReference = draft.reference?.trim().toLocaleLowerCase();
    const duplicate = prior.some(item => {
      const sameDate = item.settlementDate === draft.settlementDate;
      const sameAmount = Math.round(item.amountUsd * 100) === Math.round(draft.amountUsd * 100);
      const sameMethod = item.method === draft.method;
      const sameRate = Math.round(item.bcvRate * 1000000) === Math.round(draft.bcvRate * 1000000);
      const sameReference = Boolean(normalizedReference && item.reference?.trim().toLocaleLowerCase() === normalizedReference);
      // La referencia bancaria/transferencia identifica la operación: no se
      // puede reutilizar para la misma factura aunque cambien fecha o importe.
      // Sin referencia, usar firma estable para bloquear doble envío idéntico.
      return sameReference ||
        (!normalizedReference && !item.reference?.trim() && sameDate && sameAmount && sameMethod && sameRate);
    });
    if (duplicate) {
      throw new Error('Posible liquidación duplicada: revise la referencia, fecha, importe, medio y tasa antes de registrar nuevamente.');
    }
    // La deuda en USD conserva el principal de la factura. En Bs, la cuenta
    // por cobrar/pagar se cancela al valor contable de la tasa de emisión y la
    // diferencia se reconoce como ganancia o pérdida cambiaria en la fecha del pago.
    const invoiceRate = Number(document.bcvRate) > 0
      ? Number(document.bcvRate)
      : (Number(document.totalAmountUsd) > 0 ? Number(document.totalAmountBs) / Number(document.totalAmountUsd) : 0);
    if (!Number.isFinite(invoiceRate) || invoiceRate <= 0) {
      throw new Error('La factura no tiene una tasa de emisión válida. Corrija la tasa original antes de registrar el pago.');
    }
    const amountAtInvoiceRate = Math.round(draft.amountUsd * invoiceRate * 100) / 100;
    const amountAtSettlementRate = Math.round(draft.amountUsd * draft.bcvRate * 100) / 100;
    const actualAmountBs = Math.round(draft.amountBs * 100) / 100;
    if (Math.abs(actualAmountBs - amountAtSettlementRate) >= 0.01) {
      throw new Error('El importe en Bs no coincide con el equivalente a la tasa de liquidación. Revise la tasa o el importe.');
    }
    const fxDifferenceBs = Math.round((actualAmountBs - amountAtInvoiceRate) * 100) / 100;
    const fiscalMode = document.fiscalAdjustmentMode || 'REVISION_CONTADOR';
    // La propuesta fiscal es informativa: nunca debe impedir ni dejar a medias
    // el registro contable válido de una liquidación histórica.
    let fxFiscalAdjustmentProposal: CreditSettlement['fxFiscalAdjustmentProposal'];
    try {
      fxFiscalAdjustmentProposal = calculateFxFiscalAdjustment({
        totalAmountUsd: Number(document.totalAmountUsd || 0),
        taxableBaseUsd: Number(document.taxableBaseUsd || 0),
        vatAmountUsd: Number(document.vatAmountUsd || 0),
        exemptAmountUsd: Math.max(0, Number(document.totalAmountUsd || 0) - Number(document.taxableBaseUsd || 0) - Number(document.vatAmountUsd || 0)),
        invoiceRate,
        settlementRate: draft.bcvRate,
        settledAmountUsd: Math.round(draft.amountUsd * 100) / 100,
        mode: fiscalMode
      });
    } catch {
      fxFiscalAdjustmentProposal = {
        direction: 'REVIEW_REQUIRED', deltaBaseBs: 0, deltaVatBs: 0,
        deltaExemptBs: 0, deltaTotalBs: 0,
        explanation: 'No se pudo calcular la propuesta con los datos fiscales disponibles; requiere revisión manual.'
      };
    }
    const operationKey = [
      currentCompany.id, draft.documentId, kind, draft.settlementDate,
      Math.round(draft.amountUsd * 100), Math.round(draft.amountBs * 100),
      Math.round(draft.bcvRate * 1000000), draft.method,
      (draft.reference || '').trim().toLocaleLowerCase()
    ].join('|');
    if (settlementInFlightRef.current.has(operationKey)) {
      throw new Error('Esta liquidación ya se está registrando o fue registrada en esta sesión. Verifique el saldo antes de reintentar.');
    }
    settlementInFlightRef.current.add(operationKey);
    const cashCode = draft.method === 'CASH_USD' || draft.method === 'BANK_TRANSFER_USD' ? '1.1.1.02' :
      draft.method === 'BANK_TRANSFER_BS' ? '1.1.1.03' : '1.1.1.01';
    const cashAccount = accounts.find(account => account.code === cashCode && account.isMovement);
    const controlCode = kind === 'SALE_COLLECTION' ? '1.1.2.01' : '2.1.1.01';
    const controlAccount = accounts.find(account => account.code === controlCode && account.isMovement);
    if (!cashAccount || !controlAccount) {
      settlementInFlightRef.current.delete(operationKey);
      throw new Error('No se encontraron las cuentas contables necesarias para liquidar la factura.');
    }
    const amountBs = actualAmountBs;
    const amountUsd = Math.round(draft.amountUsd * 100) / 100;
    const fxGain = accounts.find(account => account.code === '4.2.1.01' && account.isMovement);
    const fxLoss = accounts.find(account => account.code === '6.1.1.08' && account.isMovement);
    const fxLines = (): JournalEntryItem[] => {
      if (Math.abs(fxDifferenceBs) < 0.01) return [];
      if (kind === 'SALE_COLLECTION') {
        // Cobro superior al valor contable: ganancia (Haber); inferior: pérdida (Debe).
        if (fxDifferenceBs > 0) {
          if (!fxGain) throw new Error('Falta la cuenta Ganancia por Diferencial Cambiario (4.2.1.01).');
          return [{ accountCode: fxGain.code, accountName: fxGain.name, debitBs: 0, creditBs: fxDifferenceBs, debitUsd: 0, creditUsd: 0, description: 'Ganancia cambiaria por cobro a tasa posterior' }];
        }
        if (!fxLoss) throw new Error('Falta la cuenta Pérdida en Diferencial Cambiario (6.1.1.08).');
        return [{ accountCode: fxLoss.code, accountName: fxLoss.name, debitBs: Math.abs(fxDifferenceBs), creditBs: 0, debitUsd: 0, creditUsd: 0, description: 'Pérdida cambiaria por cobro a tasa posterior' }];
      }
      // Pago superior al pasivo contable: pérdida (Debe); inferior: ganancia (Haber).
      if (fxDifferenceBs > 0) {
        if (!fxLoss) throw new Error('Falta la cuenta Pérdida en Diferencial Cambiario (6.1.1.08).');
        return [{ accountCode: fxLoss.code, accountName: fxLoss.name, debitBs: fxDifferenceBs, creditBs: 0, debitUsd: 0, creditUsd: 0, description: 'Pérdida cambiaria por pago a tasa posterior' }];
      }
      if (!fxGain) throw new Error('Falta la cuenta Ganancia por Diferencial Cambiario (4.2.1.01).');
      return [{ accountCode: fxGain.code, accountName: fxGain.name, debitBs: 0, creditBs: Math.abs(fxDifferenceBs), debitUsd: 0, creditUsd: 0, description: 'Ganancia cambiaria por pago a tasa posterior' }];
    };
    let entry: JournalEntry;
    try {
      const baseItems: JournalEntryItem[] = kind === 'SALE_COLLECTION' ? [
        { accountCode: cashCode, accountName: cashAccount.name, debitBs: amountBs, creditBs: 0, debitUsd: amountUsd, creditUsd: 0, description: 'Cobro de factura de crédito' },
        { accountCode: controlCode, accountName: controlAccount.name, debitBs: 0, creditBs: amountAtInvoiceRate, debitUsd: 0, creditUsd: amountUsd, description: 'Cancelación parcial de cuenta por cobrar al valor contable original' }
      ] : [
        { accountCode: controlCode, accountName: controlAccount.name, debitBs: amountAtInvoiceRate, creditBs: 0, debitUsd: amountUsd, creditUsd: 0, description: 'Cancelación parcial de cuenta por pagar al valor contable original' },
        { accountCode: cashCode, accountName: cashAccount.name, debitBs: 0, creditBs: amountBs, debitUsd: 0, creditUsd: amountUsd, description: 'Pago de factura de crédito' }
      ];
      entry = addJournalEntry({
        entryNumber: 0,
        date: draft.settlementDate,
        description: (kind === 'SALE_COLLECTION' ? 'Cobro de cuenta por cobrar' : 'Pago de cuenta por pagar') + ' - ' + document.invoiceNumber + (Math.abs(fxDifferenceBs) >= 0.01 ? ' (incluye diferencia cambiaria)' : ''),
        type: 'AJUSTE',
        bcvRate: draft.bcvRate,
        referenceDoc: document.invoiceNumber,
        items: [...baseItems, ...fxLines()]
      });
    } catch (error) {
      settlementInFlightRef.current.delete(operationKey);
      throw error;
    }
    const settlement: CreditSettlement = {
      ...draft,
      id: `settlement-${currentCompany.id}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      companyId: currentCompany.id,
      amountBs,
      amountUsd,
      fxFiscalAdjustmentProposal,
      journalEntryId: entry.id,
      createdAt: new Date().toISOString()
    };
    setCreditSettlements(prev => [...prev, settlement]);
    return settlement;
  };

  const deleteJournalEntry = (id: string) => {
    setJournalEntries(prev => prev.filter(e => e.id !== id));
  };

  // Registrar compra y generar asiento automático y comprobantes de retención
  const addPurchase = (purchaseData: Omit<PurchaseRecord, 'id' | 'companyId' | 'opNumber'>): PurchaseRecord => {
    const companyPurchases = purchases.filter(p => p.companyId === currentCompany.id);
    const companyKey = currentCompany.id;
    const nextOp = Math.max(companyPurchases.reduce((max, p) => Math.max(max, p.opNumber || 0), 0), purchaseSequenceRef.current[companyKey] || 0) + 1;
    purchaseSequenceRef.current[companyKey] = nextOp;
    const purchaseId = `pur-${companyKey}-${nextOp}-${Date.now()}`;
    const rate = purchaseData.bcvRate || currentCompany.bcvRate;

    // Generar correlativo comprobante IVA si retiene
    let voucherNum = purchaseData.voucherNumber;
    const period = purchaseData.invoiceDate.slice(0, 7).replace('-', '');
    if (purchaseData.vatWithheldBs > 0 && !voucherNum) {
      const year = parseInt(purchaseData.invoiceDate.slice(0, 4), 10);
      const month = parseInt(purchaseData.invoiceDate.slice(5, 7), 10);
      const voucherKey = `${companyKey}:${period}`;
      const companyVouchersCount = vatVouchers.filter(v => v.companyId === currentCompany.id && v.period === period).length;
      const voucherSequence = Math.max(companyVouchersCount, vatVoucherSequenceRef.current[voucherKey] || 0) + 1;
      vatVoucherSequenceRef.current[voucherKey] = voucherSequence;
      voucherNum = formatVoucherNumber(year, month, voucherSequence);
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

    // Debe: compras/operaciones exentas. Incluir esta línea evita que las
    // facturas con monto exento queden descuadradas en el asiento automático.
    if (purchaseData.exemptAmountBs > 0) {
      items.push({
        accountCode: debitAccountCode,
        accountName: `Compras u operaciones exentas - ${debitAccountName}`,
        debitBs: purchaseData.exemptAmountBs,
        creditBs: 0,
        debitUsd: purchaseData.exemptAmountBs / rate,
        creditUsd: 0,
        description: `Monto exento Fac. ${purchaseData.invoiceNumber} - ${purchaseData.supplierName}`
      });
    }

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
    const nextEntryNum = Math.max(companyEntries.reduce((max, entry) => Math.max(max, entry.entryNumber || 0), 0), journalSequenceRef.current[companyKey] || 0) + 1;
    journalSequenceRef.current[companyKey] = nextEntryNum;

    const createdJournalEntry: JournalEntry = {
      id: `entry-pur-${companyKey}-${nextEntryNum}-${Date.now()}`,
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
        id: `vouch-iva-${purchaseId}`,
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
        id: `vouch-islr-${purchaseId}`,
        companyId: currentCompany.id,
        voucherNumber: (() => {
          const voucherKey = `${companyKey}:${period}`;
          const existingCount = islrVouchers.filter(v => v.companyId === currentCompany.id && v.period === period).length;
          const sequence = Math.max(existingCount, islrVoucherSequenceRef.current[voucherKey] || 0) + 1;
          islrVoucherSequenceRef.current[voucherKey] = sequence;
          return `ISLR-${period}-${String(sequence).padStart(6, '0')}`;
        })(),
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
    const companySales = sales.filter(s => s.companyId === currentCompany.id);
    const companyKey = currentCompany.id;
    const nextOp = Math.max(companySales.reduce((max, sale) => Math.max(max, sale.opNumber || 0), 0), saleSequenceRef.current[companyKey] || 0) + 1;
    saleSequenceRef.current[companyKey] = nextOp;
    const saleId = `sale-${companyKey}-${nextOp}-${Date.now()}`;
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

    // Haber: ingresos exentos. Sin esta línea, una venta con monto exento
    // deja el asiento automático descuadrado frente a CxC y retenciones.
    if (saleData.exemptAmountBs > 0) {
      items.push({
        accountCode: '4.1.1.01',
        accountName: 'Ingresos por ventas exentas',
        debitBs: 0,
        creditBs: saleData.exemptAmountBs,
        debitUsd: 0,
        creditUsd: saleData.exemptAmountBs / rate,
        description: `Ingreso exento por venta Fac. ${saleData.invoiceNumber}`
      });
    }

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
    const nextEntryNum = Math.max(companyEntries.reduce((max, entry) => Math.max(max, entry.entryNumber || 0), 0), journalSequenceRef.current[companyKey] || 0) + 1;
    journalSequenceRef.current[companyKey] = nextEntryNum;

    const createdJournalEntry: JournalEntry = {
      id: `entry-sale-${companyKey}-${nextEntryNum}-${Date.now()}`,
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

  // Inventario contable: cada movimiento valida existencias y conserva la tasa histórica.
  const addProduct = (prodData: Omit<InventoryProduct, 'id' | 'companyId'>): InventoryProduct => {
    const code = String(prodData.code || '').trim().toLocaleUpperCase();
    if (!code || !String(prodData.name || '').trim()) throw new Error('El código y la descripción del artículo son obligatorios.');
    if (products.some(p => p.companyId === currentCompany.id && p.code.trim().toLocaleUpperCase() === code)) {
      throw new Error(`Ya existe un artículo con el código ${code} en la empresa activa.`);
    }
    const rate = Number(prodData.openingBcvRate ?? currentCompany.bcvRate);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('Configure la tasa BCV histórica válida antes de crear artículos con valoración.');
    const initialQuantity = Number(prodData.currentStock || 0);
    const initialCostBs = Number(prodData.avgCostBs || 0);
    const openingDateValue = prodData.openingDate || new Date().toISOString().slice(0, 10);
    const openingDateParsed = new Date(openingDateValue + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(openingDateValue) || !Number.isFinite(openingDateParsed.getTime()) || openingDateParsed.toISOString().slice(0,10) !== openingDateValue) throw new Error('La fecha del inventario inicial no es válida.');
    if (!Number.isFinite(initialQuantity) || initialQuantity < 0 || !Number.isFinite(initialCostBs) || initialCostBs < 0) {
      throw new Error('La existencia y el costo inicial no pueden ser negativos.');
    }
    if (initialQuantity > 0 && initialCostBs <= 0) throw new Error('El inventario inicial debe tener un costo unitario mayor que cero.');
    const newProd: InventoryProduct = {
      ...prodData,
      code,
      currentStock: initialQuantity,
      avgCostBs: initialCostBs,
      avgCostUsd: initialCostBs / rate,
      lastCostBs: initialCostBs,
      lastCostUsd: initialCostBs / rate,
      inventoryAccountCode: prodData.inventoryAccountCode || '1.1.4.01',
      costOfSalesAccountCode: prodData.costOfSalesAccountCode || '5.1.1.01',
      adjustmentAccountCode: prodData.adjustmentAccountCode || '5.1.2.01',
      openingBalanceAccountCode: prodData.openingBalanceAccountCode || '3.3.1.01',
      costingMethod: prodData.costingMethod || 'PROMEDIO_PONDERADO',
      vatTreatment: prodData.vatTreatment || 'GENERAL_16',
      itemType: prodData.itemType || 'MERCANCIA',
      openingDate: openingDateValue,
      openingBcvRate: rate,
      vnrProvisionBs: Number(prodData.vnrProvisionBs || 0),
      id: `prod-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      companyId: currentCompany.id
    };
    const inventoryAccount = accounts.find(a => a.code === newProd.inventoryAccountCode && a.isMovement && a.type === 'ACTIVO');
    const costAccount = accounts.find(a => a.code === newProd.costOfSalesAccountCode && a.isMovement && (a.type === 'COSTOS' || a.type === 'GASTOS'));
    const adjustmentAccount = accounts.find(a => a.code === newProd.adjustmentAccountCode && a.isMovement && (a.type === 'COSTOS' || a.type === 'GASTOS'));
    if (!inventoryAccount) throw new Error(`La cuenta de inventario ${newProd.inventoryAccountCode} no existe o no es una cuenta de activo de movimiento.`);
    if (newProd.itemType === 'PRODUCTO_EN_PROCESO' && newProd.inventoryAccountCode !== '1.1.4.04') throw new Error('Los productos en proceso deben asociarse a la cuenta 1.1.4.04.');
    if (!costAccount) throw new Error(`La cuenta de costo de ventas ${newProd.costOfSalesAccountCode} no existe o no admite movimientos.`);
    if (!adjustmentAccount) throw new Error(`La cuenta de mermas/ajustes ${newProd.adjustmentAccountCode} no existe o no admite movimientos.`);
    let opening: InventoryMovement | null = null;
    let openingEntry: JournalEntry | null = null;
    if (initialQuantity > 0) {
      const offsetAccount = accounts.find(a => a.code === newProd.openingBalanceAccountCode && a.isMovement);
      if (!offsetAccount) throw new Error(`La cuenta contrapartida de apertura ${newProd.openingBalanceAccountCode} no existe o no admite movimientos.`);
      const openingValueBs = Math.round(initialQuantity * initialCostBs * 100) / 100;
      const openingValueUsd = Math.round(openingValueBs / rate * 1000000) / 1000000;
      const entryNumber = journalEntries.filter(e => e.companyId === currentCompany.id).reduce((max,e) => Math.max(max,e.entryNumber),0) + 1;
      openingEntry = {
        id: `entry-inventory-opening-${newProd.id}`, companyId: currentCompany.id, entryNumber,
        date: openingDateValue, description: `Asiento de apertura de inventario · ${newProd.code} · ${newProd.name}`,
        type: 'APERTURA', bcvRate: rate, referenceDoc: `APERTURA-${newProd.code}`,
        items: [
          { accountCode: inventoryAccount.code, accountName: inventoryAccount.name, debitBs: openingValueBs, creditBs: 0, debitUsd: openingValueUsd, creditUsd: 0, description: `Existencia inicial de ${initialQuantity} ${newProd.unit}` },
          { accountCode: offsetAccount.code, accountName: offsetAccount.name, debitBs: 0, creditBs: openingValueBs, debitUsd: 0, creditUsd: openingValueUsd, description: `Contrapartida de apertura de inventario ${newProd.code}` }
        ], createdAt: new Date().toISOString()
      };
      opening = {
        id: `mov-opening-${newProd.id}`, companyId: currentCompany.id,
        productId: newProd.id, productName: newProd.name, productCode: newProd.code,
        date: openingEntry.date, type: 'ENTRADA', concept: 'INVENTARIO_INICIAL',
        documentRef: openingEntry.referenceDoc || 'APERTURA-INVENTARIO', quantity: initialQuantity, unitCostBs: initialCostBs,
        unitCostUsd: initialCostBs / rate, totalCostBs: openingValueBs,
        totalCostUsd: openingValueUsd, balanceQty: initialQuantity,
        balanceTotalBs: openingValueBs, balanceTotalUsd: openingValueUsd,
        bcvRate: rate, costingMethod: newProd.costingMethod, journalEntryId: openingEntry.id
      };
    }
    setProducts(prev => [...prev, newProd]);
    if (opening) setMovements(prev => [...prev, opening!]);
    if (openingEntry) setJournalEntries(prev => [...prev, openingEntry!]);
    return newProd;
  };


  const importInventoryProducts = (rows: Omit<InventoryProduct, 'id' | 'companyId'>[]): number => {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('El archivo no contiene artículos para importar.');
    const existingCodes = new Set(products.filter(p => p.companyId === currentCompany.id).map(p => p.code.trim().toLocaleUpperCase()));
    const batchCodes = new Set<string>();
    const prepared: InventoryProduct[] = [];
    const openingMovements: InventoryMovement[] = [];
    const openingEntries: JournalEntry[] = [];
    let nextEntryNumber = journalEntries.filter(e => e.companyId === currentCompany.id).reduce((max,e) => Math.max(max,e.entryNumber),0) + 1;
    const today = new Date().toISOString().slice(0, 10);
    for (const row of rows) {
      const code = String(row.code || '').trim().toLocaleUpperCase();
      const name = String(row.name || '').trim();
      if (!code || !name) throw new Error('Cada artículo debe incluir código y descripción.');
      if (existingCodes.has(code) || batchCodes.has(code)) throw new Error('Código duplicado en la empresa o archivo: ' + code + '.');
      batchCodes.add(code);
      const rate = Number(row.openingBcvRate ?? currentCompany.bcvRate);
      const quantity = Number(row.currentStock || 0);
      const unitCostBs = Number(row.avgCostBs || 0);
      const date = row.openingDate || today;
      const parsedOpeningDate = new Date(date + 'T00:00:00Z');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedOpeningDate.getTime()) || parsedOpeningDate.toISOString().slice(0,10) !== date) throw new Error('Fecha de apertura inválida para ' + code + '.');
      if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(quantity) || quantity < 0 ||
          !Number.isFinite(unitCostBs) || unitCostBs < 0 || (quantity > 0 && unitCostBs <= 0)) throw new Error('Tasa, cantidad o costo inválidos para ' + code + '.');
      const product: InventoryProduct = {
        ...row, id: 'prod-import-' + Date.now() + '-' + prepared.length + '-' + Math.floor(Math.random() * 100000),
        companyId: currentCompany.id, code, name, currentStock: quantity, avgCostBs: unitCostBs,
        avgCostUsd: unitCostBs / rate, lastCostBs: unitCostBs, lastCostUsd: unitCostBs / rate,
        inventoryAccountCode: row.inventoryAccountCode || '1.1.4.01',
        costOfSalesAccountCode: row.costOfSalesAccountCode || '5.1.1.01',
        adjustmentAccountCode: row.adjustmentAccountCode || '5.1.2.01',
        openingBalanceAccountCode: row.openingBalanceAccountCode || '3.3.1.01',
        costingMethod: row.costingMethod || 'PROMEDIO_PONDERADO',
        vatTreatment: row.vatTreatment || 'GENERAL_16', itemType: row.itemType || 'MERCANCIA',
        openingDate: date, openingBcvRate: rate, vnrProvisionBs: Number(row.vnrProvisionBs || 0)
      };
      const inventoryAccount = accounts.find(a => a.code === product.inventoryAccountCode && a.isMovement && a.type === 'ACTIVO');
      const costAccount = accounts.find(a => a.code === product.costOfSalesAccountCode && a.isMovement && (a.type === 'COSTOS' || a.type === 'GASTOS'));
      const adjustmentAccount = accounts.find(a => a.code === product.adjustmentAccountCode && a.isMovement && (a.type === 'COSTOS' || a.type === 'GASTOS'));
      if (!inventoryAccount || !costAccount || !adjustmentAccount) throw new Error('Cuentas contables inválidas para el artículo ' + code + '.');
      if (product.itemType === 'PRODUCTO_EN_PROCESO' && product.inventoryAccountCode !== '1.1.4.04') throw new Error('El artículo ' + code + ' es producto en proceso y debe usar la cuenta 1.1.4.04.');
      if (quantity > 0) {
        const offsetAccount = accounts.find(a => a.code === product.openingBalanceAccountCode && a.isMovement);
        if (!offsetAccount) throw new Error('Cuenta de contrapartida de apertura inválida para el artículo ' + code + '.');
        const totalBs = Math.round(quantity * unitCostBs * 100) / 100;
        const totalUsd = Math.round(totalBs / rate * 1000000) / 1000000;
        const entry: JournalEntry = {
          id: 'entry-inventory-opening-' + product.id, companyId: currentCompany.id, entryNumber: nextEntryNumber++,
          date, description: 'Asiento de apertura de inventario · ' + code + ' · ' + name, type: 'APERTURA',
          bcvRate: rate, referenceDoc: 'APERTURA-' + code,
          items: [
            { accountCode: inventoryAccount.code, accountName: inventoryAccount.name, debitBs: totalBs, creditBs: 0, debitUsd: totalUsd, creditUsd: 0, description: 'Existencia inicial de ' + quantity + ' ' + product.unit },
            { accountCode: offsetAccount.code, accountName: offsetAccount.name, debitBs: 0, creditBs: totalBs, debitUsd: 0, creditUsd: totalUsd, description: 'Contrapartida de apertura de inventario ' + code }
          ], createdAt: new Date().toISOString()
        };
        openingEntries.push(entry);
        openingMovements.push({
          id: 'mov-opening-' + product.id, companyId: currentCompany.id, productId: product.id,
          productName: name, productCode: code, date, type: 'ENTRADA', concept: 'INVENTARIO_INICIAL',
          documentRef: entry.referenceDoc || 'APERTURA-INVENTARIO', quantity, unitCostBs,
          unitCostUsd: unitCostBs / rate, totalCostBs: totalBs, totalCostUsd: totalUsd,
          balanceQty: quantity, balanceTotalBs: totalBs, balanceTotalUsd: totalUsd,
          bcvRate: rate, costingMethod: product.costingMethod, journalEntryId: entry.id
        });
      }
      prepared.push(product);
    }
    setProducts(prev => [...prev, ...prepared]);
    if (openingMovements.length) setMovements(prev => [...prev, ...openingMovements]);
    if (openingEntries.length) setJournalEntries(prev => [...prev, ...openingEntries]);
    return prepared.length;
  };


  const importInventoryMovements = (rows: Omit<InventoryMovement, 'id' | 'companyId'>[]): number => {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('El archivo no contiene movimientos para importar.');
    const virtualProducts = new Map(products.filter(p => p.companyId === currentCompany.id).map(p => [p.id, p]));
    const virtualMovements = movements.filter(m => m.companyId === currentCompany.id).slice();
    const importedMovements: InventoryMovement[] = [];
    const importedEntries: JournalEntry[] = [];
    const keys = new Set<string>();
    let nextEntryNumber = journalEntries.filter(e => e.companyId === currentCompany.id).reduce((max,e) => Math.max(max,e.entryNumber),0) + 1;
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const product = virtualProducts.get(row.productId);
      if (!product) throw new Error('Fila ' + (index + 2) + ': artículo no encontrado en la empresa activa.');
      if (!row.documentRef || !String(row.documentRef).trim()) throw new Error('Fila ' + (index + 2) + ': la referencia documental es obligatoria.');
      const key = [row.productId,row.date,row.type,String(row.documentRef).trim().toLowerCase()].join('|');
      if (keys.has(key) || virtualMovements.some(m => m.productId === row.productId && m.date === row.date && m.type === row.type && m.documentRef.trim().toLowerCase() === String(row.documentRef).trim().toLowerCase())) {
        throw new Error('Movimiento duplicado en la fila ' + (index + 2) + ': ' + row.documentRef + '.');
      }
      keys.add(key);
      const priorProductMovements = virtualMovements.filter(m => m.productId === product.id).slice().sort((a,b) => a.date.localeCompare(b.date));
      if (priorProductMovements.length && row.date < priorProductMovements[priorProductMovements.length - 1].date) throw new Error('Fila ' + (index + 2) + ': importe los períodos históricos en orden cronológico; esta fecha es anterior al último movimiento de ' + product.code + '.');
      const rate = Number(row.bcvRate ?? currentCompany.bcvRate);
      const requestedCost = Number(row.unitCostBs);
      const landedCostsBs = Number(row.additionalLandedCostsBs || 0);
      if (!Number.isFinite(landedCostsBs) || landedCostsBs < 0) throw new Error('Fila ' + (index + 2) + ': los fletes/gastos asociados no pueden ser negativos.');
      const effectiveUnitCost = row.type === 'ENTRADA' ? requestedCost + landedCostsBs / Math.max(Number(row.quantity), 1e-8) : requestedCost;
      const isAdjustment = row.type === 'AJUSTE';
      const targetStock = Number(row.balanceQty);
      const quantity = isAdjustment ? Math.abs(targetStock - product.currentStock) : Number(row.quantity);
      const validation = validateInventoryMovement({
        date: row.date, quantity: isAdjustment ? Math.max(quantity,0.00000001) : Number(row.quantity),
        bcvRate: rate, unitCostBs: effectiveUnitCost, availableQuantity: product.currentStock,
        type: isAdjustment ? 'AJUSTE' : row.type
      });
      if (validation) throw new Error('Fila ' + (index + 2) + ': ' + validation);
      if (isAdjustment && (!Number.isFinite(targetStock) || targetStock < 0 || quantity < 0.00000001)) {
        throw new Error('Fila ' + (index + 2) + ': indique una existencia final de ajuste distinta de la actual.');
      }
      let unitCostBs = requestedCost;
      let totalCostBs = 0;
      let newStock = product.currentStock;
      let newAverageBs = product.avgCostBs;
      let movementQuantity = Number(row.quantity);
      if (row.type === 'ENTRADA') {
        unitCostBs = effectiveUnitCost;
        const weighted = calculateWeightedAverageCost(product.currentStock, product.avgCostBs, Number(row.quantity), effectiveUnitCost, rate);
        newStock = weighted.quantity; newAverageBs = weighted.unitCostBs;
        totalCostBs = Math.round(Number(row.quantity) * effectiveUnitCost * 100) / 100;
      } else if (row.type === 'SALIDA') {
        if (product.costingMethod === 'PEPS') {
          const layers: CostLayer[] = [];
          const history = virtualMovements.filter(m => m.productId === product.id).slice().sort((a,b) => a.date.localeCompare(b.date));
          let runningQuantity = 0;
          for (const m of history) {
            if (m.type === 'ENTRADA') { layers.push({ quantity: m.quantity, unitCostBs: m.unitCostBs, unitCostUsd: m.unitCostUsd, date: m.date, documentRef: m.documentRef }); runningQuantity += m.quantity; }
            else if (m.type === 'SALIDA') {
              let remaining = m.quantity;
              for (const layer of layers) { const used = Math.min(layer.quantity, remaining); layer.quantity -= used; remaining -= used; if (remaining <= 1e-8) break; }
              runningQuantity -= m.quantity;
            } else {
              const delta = m.balanceQty - runningQuantity;
              if (delta > 0) layers.push({ quantity: delta, unitCostBs: m.unitCostBs, unitCostUsd: m.unitCostUsd, date: m.date, documentRef: m.documentRef });
              else if (delta < 0) { let remaining = Math.abs(delta); for (const layer of layers) { const used = Math.min(layer.quantity, remaining); layer.quantity -= used; remaining -= used; if (remaining <= 1e-8) break; } }
              runningQuantity = m.balanceQty;
            }
          }
          const layerQty = layers.reduce((sum,layer) => sum + Math.max(0,layer.quantity),0);
          if (layerQty < product.currentStock - 1e-8) layers.unshift({ quantity: product.currentStock - layerQty, unitCostBs: product.avgCostBs, unitCostUsd: product.avgCostUsd, date: '0000-01-01', documentRef: 'SALDO-APERTURA-LEGADO' });
          if (layers.reduce((sum,layer) => sum + Math.max(0,layer.quantity),0) > product.currentStock + 1e-8) throw new Error('Fila ' + (index + 2) + ': el Kardex PEPS no concilia para ' + product.code + '.');
          const fifoLayerValue = layers.reduce((sum, layer) => sum + Math.max(0, layer.quantity) * layer.unitCostBs, 0);
          totalCostBs = calculateFifoIssue(layers, Number(row.quantity)).totalCostBs;
          newStock = Math.max(0, product.currentStock - Number(row.quantity));
          newAverageBs = newStock > 0 ? Math.max(0, fifoLayerValue - totalCostBs) / newStock : 0;
        } else totalCostBs = Math.round(Number(row.quantity) * product.avgCostBs * 100) / 100;
        unitCostBs = totalCostBs / Number(row.quantity);
        newStock = Math.max(0, product.currentStock - Number(row.quantity));
      } else {
        movementQuantity = quantity;
        newStock = targetStock;
        if (targetStock > product.currentStock) {
          const weighted = calculateWeightedAverageCost(product.currentStock, product.avgCostBs, targetStock - product.currentStock, requestedCost, rate);
          newAverageBs = weighted.unitCostBs;
        }
        totalCostBs = Math.round(quantity * (targetStock < product.currentStock ? product.avgCostBs : requestedCost) * 100) / 100;
        unitCostBs = quantity > 0 ? totalCostBs / quantity : 0;
      }
      const totalCostUsd = Math.round(totalCostBs / rate * 1000000) / 1000000;
      const newAverageUsd = newAverageBs / rate;
      const movement: InventoryMovement = {
        ...row, id: 'mov-import-' + Date.now() + '-' + index + '-' + Math.floor(Math.random()*100000),
        companyId: currentCompany.id, quantity: movementQuantity, unitCostBs, unitCostUsd: unitCostBs / rate, additionalLandedCostsBs: landedCostsBs,
        totalCostBs, totalCostUsd, balanceQty: newStock,
        balanceTotalBs: Math.round(newStock * newAverageBs * 100) / 100,
        balanceTotalUsd: Math.round(newStock * newAverageUsd * 1000000) / 1000000,
        bcvRate: rate, costingMethod: product.costingMethod || 'PROMEDIO_PONDERADO'
      };
      const inventoryCode = product.inventoryAccountCode || '1.1.4.01';
      const costCode = product.costOfSalesAccountCode || '5.1.1.01';
      const adjustmentCode = product.adjustmentAccountCode || '5.1.2.01';
      const inventoryAccount = accounts.find(a => a.code === inventoryCode && a.isMovement);
      const costAccount = accounts.find(a => a.code === costCode && a.isMovement);
      const adjustmentAccount = accounts.find(a => a.code === adjustmentCode && a.isMovement);
      const isSale = row.type === 'SALIDA' && row.concept === 'VENTA';
      const isLoss = row.type === 'SALIDA' && ['MERMA','AUTOCONSUMO'].includes(row.concept);
      const isCustomerReturn = row.type === 'ENTRADA' && row.concept === 'DEVOLUCION_CLIENTE';
      const isSupplierReturn = row.type === 'SALIDA' && row.concept === 'DEVOLUCION_COMPRA';
      const positiveAdjustment = row.type === 'AJUSTE' && targetStock > product.currentStock;
      if (isSale || isLoss || isCustomerReturn || isSupplierReturn || isAdjustment) {
        if (!inventoryAccount) throw new Error('Cuenta de inventario inválida para ' + product.code + '.');
        const payableAccount = accounts.find(a => a.code === '2.1.1.01' && a.isMovement);
        if ((isSale || isCustomerReturn) && !costAccount) throw new Error('Cuenta de costo de ventas inválida para ' + product.code + '.');
        if ((isLoss || isAdjustment) && !adjustmentAccount) throw new Error('Cuenta de mermas/ajustes inválida para ' + product.code + '.');
        if (isSupplierReturn && !payableAccount) throw new Error('Falta la cuenta de control CxP 2.1.1.01 para la devolución al proveedor.');
        const debitCode = isSale ? costCode : isSupplierReturn ? '2.1.1.01' : adjustmentCode;
        const amountUsd = totalCostUsd;
        const makeLine = (code:string, debitBs:number, creditBs:number, debitUsd:number, creditUsd:number, description:string): JournalEntryItem => ({
          accountCode: code, accountName: accounts.find(a => a.code === code)?.name || code,
          debitBs, creditBs, debitUsd, creditUsd, description
        });
        const lines: JournalEntryItem[] = positiveAdjustment
          ? [makeLine(inventoryCode,totalCostBs,0,amountUsd,0,'Entrada por sobrante de inventario'),makeLine(adjustmentCode,0,totalCostBs,0,amountUsd,'Contrapartida por sobrante de inventario')]
          : isCustomerReturn
            ? [makeLine(inventoryCode,totalCostBs,0,amountUsd,0,'Entrada por devolución de cliente'),makeLine(costCode,0,totalCostBs,0,amountUsd,'Reversión del costo de ventas por devolución')]
            : isSupplierReturn
              ? [makeLine('2.1.1.01',totalCostBs,0,amountUsd,0,'Devolución de mercancía al proveedor'),makeLine(inventoryCode,0,totalCostBs,0,amountUsd,'Salida por devolución de compra')]
              : [makeLine(debitCode,totalCostBs,0,amountUsd,0,isSale?'Costo de ventas por movimiento importado':'Merma/ajuste de inventario importado'),makeLine(inventoryCode,0,totalCostBs,0,amountUsd,'Descargo de inventario importado')];
        const entry: JournalEntry = {
          id: 'entry-inventory-import-' + Date.now() + '-' + index, companyId: currentCompany.id, entryNumber: nextEntryNumber++,
          date: row.date, description: (isSale?'Costo de venta':isCustomerReturn?'Devolución de cliente':isSupplierReturn?'Devolución a proveedor':positiveAdjustment?'Sobrante':'Merma/ajuste') + ' importado · ' + product.code + ' · ' + row.documentRef,
          type: 'INVENTARIO', bcvRate: rate, referenceDoc: row.documentRef, items: lines, createdAt: new Date().toISOString()
        };
        movement.journalEntryId = entry.id;
        importedEntries.push(entry);
      }
      importedMovements.push(movement);
      virtualMovements.push(movement);
      virtualProducts.set(product.id, {
        ...product, currentStock: newStock, avgCostBs: newAverageBs, avgCostUsd: newAverageUsd,
        lastCostBs: row.type === 'ENTRADA' ? effectiveUnitCost : product.lastCostBs,
        lastCostUsd: row.type === 'ENTRADA' ? effectiveUnitCost / rate : product.lastCostUsd
      });
    }
    setProducts(prev => prev.map(product => virtualProducts.get(product.id) || product));
    setMovements(prev => [...prev, ...importedMovements]);
    if (importedEntries.length) setJournalEntries(prev => [...prev, ...importedEntries]);
    return importedMovements.length;
  };

  const updateProduct = (updated: InventoryProduct) => {
    if (!products.some(p => p.id === updated.id && p.companyId === currentCompany.id)) {
      throw new Error('El artículo no pertenece a la empresa activa.');
    }
    if (products.some(p => p.id !== updated.id && p.companyId === currentCompany.id && p.code.trim().toLocaleUpperCase() === updated.code.trim().toLocaleUpperCase())) {
      throw new Error('Ya existe otro artículo con ese código en la empresa activa.');
    }
    setProducts(prev => prev.map(p => (p.id === updated.id && p.companyId === currentCompany.id ? updated : p)));
  };

  const addMovement = (movData: Omit<InventoryMovement, 'id' | 'companyId'>): InventoryMovement => {
    const prod = products.find(p => p.id === movData.productId && p.companyId === currentCompany.id);
    if (!prod) throw new Error('El artículo no existe en la empresa activa.');
    const rate = Number(movData.bcvRate ?? currentCompany.bcvRate);
    const isAdjustment = movData.type === 'AJUSTE';
    const actualQuantity = isAdjustment ? Math.abs(Number(movData.balanceQty) - prod.currentStock) : Number(movData.quantity);
    const requestedCost = Number(movData.unitCostBs);
    const landedCostsBs = Number(movData.additionalLandedCostsBs || 0);
    if (!Number.isFinite(landedCostsBs) || landedCostsBs < 0) throw new Error('Los fletes y gastos asociados no pueden ser negativos.');
    const effectiveUnitCost = movData.type === 'ENTRADA' ? requestedCost + landedCostsBs / Math.max(Number(movData.quantity), 1e-8) : requestedCost;
    const validation = validateInventoryMovement({
      date: movData.date, quantity: isAdjustment ? Math.max(actualQuantity, 0.00000001) : Number(movData.quantity),
      bcvRate: rate, unitCostBs: effectiveUnitCost, availableQuantity: prod.currentStock, type: isAdjustment ? 'AJUSTE' : movData.type
    });
    if (validation) throw new Error(validation);
    if (isAdjustment && actualQuantity < 0.00000001) throw new Error('El ajuste no cambia la existencia; no hay movimiento que registrar.');

    const prior = movements.filter(m => m.companyId === currentCompany.id && m.productId === prod.id)
      .slice().sort((a, b) => a.date.localeCompare(b.date));
    if (prior.length && movData.date < prior[prior.length - 1].date) throw new Error('El movimiento está fechado antes del último registro del Kardex. Importe primero los períodos históricos en orden cronológico para evitar saldos y costos incorrectos.');
    let unitCostBs = requestedCost;
    let unitCostUsd = requestedCost / rate;
    let totalCostBs = 0;
    let totalCostUsd = 0;
    let newStock = prod.currentStock;
    let newAverageBs = prod.avgCostBs;
    let newAverageUsd = prod.avgCostBs / rate;
    let movementQuantity = Number(movData.quantity);

    if (movData.type === 'ENTRADA') {
      unitCostBs = effectiveUnitCost;
      unitCostUsd = unitCostBs / rate;
      const weighted = calculateWeightedAverageCost(prod.currentStock, prod.avgCostBs, Number(movData.quantity), effectiveUnitCost, rate);
      newStock = weighted.quantity;
      newAverageBs = weighted.unitCostBs;
      newAverageUsd = weighted.unitCostUsd;
      totalCostBs = Math.round(Number(movData.quantity) * effectiveUnitCost * 100) / 100;
      totalCostUsd = Math.round(totalCostBs / rate * 1000000) / 1000000;
    } else if (movData.type === 'SALIDA') {
      if (prod.costingMethod === 'PEPS') {
        const layers: CostLayer[] = [];
        let runningQuantity = 0;
        for (const priorMovement of prior) {
          if (priorMovement.type === 'ENTRADA') {
            layers.push({ quantity: priorMovement.quantity, unitCostBs: priorMovement.unitCostBs, unitCostUsd: priorMovement.unitCostUsd, date: priorMovement.date, documentRef: priorMovement.documentRef });
            runningQuantity += priorMovement.quantity;
          } else if (priorMovement.type === 'SALIDA') {
            let remaining = priorMovement.quantity;
            for (const layer of layers) {
              const used = Math.min(layer.quantity, remaining);
              layer.quantity -= used;
              remaining -= used;
              if (remaining <= 1e-8) break;
            }
            runningQuantity -= priorMovement.quantity;
          } else if (priorMovement.type === 'AJUSTE') {
            const delta = priorMovement.balanceQty - runningQuantity;
            if (delta > 0) layers.push({ quantity: delta, unitCostBs: priorMovement.unitCostBs, unitCostUsd: priorMovement.unitCostUsd, date: priorMovement.date, documentRef: priorMovement.documentRef });
            else if (delta < 0) {
              let remaining = Math.abs(delta);
              for (const layer of layers) {
                const used = Math.min(layer.quantity, remaining);
                layer.quantity -= used;
                remaining -= used;
                if (remaining <= 1e-8) break;
              }
            }
            runningQuantity = priorMovement.balanceQty;
          }
        }
        const layerQuantity = layers.reduce((sum, layer) => sum + Math.max(0, layer.quantity), 0);
        if (layerQuantity < prod.currentStock - 1e-8) {
          layers.unshift({ quantity: prod.currentStock - layerQuantity, unitCostBs: prod.avgCostBs, unitCostUsd: prod.avgCostUsd, date: '0000-01-01', documentRef: 'SALDO-APERTURA-LEGADO' });
        } else if (layerQuantity > prod.currentStock + 1e-8) {
          throw new Error('El Kardex PEPS no concilia con la existencia actual. Reconstruya el Kardex antes de registrar salidas.');
        }
        const fifoLayerValue = layers.reduce((sum, layer) => sum + Math.max(0, layer.quantity) * layer.unitCostBs, 0);
        const fifo = calculateFifoIssue(layers, Number(movData.quantity));
        totalCostBs = fifo.totalCostBs;
        totalCostUsd = Math.round(totalCostBs / rate * 1000000) / 1000000;
        unitCostBs = fifo.unitCostBs;
        unitCostUsd = unitCostBs / rate;
        newStock = Math.max(0, prod.currentStock - Number(movData.quantity));
        newAverageBs = newStock > 0 ? Math.max(0, fifoLayerValue - totalCostBs) / newStock : 0;
        newAverageUsd = newAverageBs / rate;
      } else {
        unitCostBs = prod.avgCostBs;
        unitCostUsd = unitCostBs / rate;
        totalCostBs = Math.round(Number(movData.quantity) * unitCostBs * 100) / 100;
        totalCostUsd = Math.round(totalCostBs / rate * 1000000) / 1000000;
        newStock = prod.currentStock - Number(movData.quantity);
      }
    } else {
      movementQuantity = actualQuantity;
      const targetStock = Number(movData.balanceQty);
      if (!Number.isFinite(targetStock) || targetStock < 0) throw new Error('La existencia final del ajuste no es válida.');
      newStock = targetStock;
      if (targetStock > prod.currentStock) {
        const weighted = calculateWeightedAverageCost(prod.currentStock, prod.avgCostBs, targetStock - prod.currentStock, requestedCost, rate);
        newAverageBs = weighted.unitCostBs;
        newAverageUsd = weighted.unitCostUsd;
      }
      totalCostBs = Math.round(actualQuantity * (targetStock < prod.currentStock ? prod.avgCostBs : requestedCost) * 100) / 100;
      totalCostUsd = Math.round(totalCostBs / rate * 1000000) / 1000000;
      unitCostBs = actualQuantity > 0 ? totalCostBs / actualQuantity : 0;
      unitCostUsd = unitCostBs / rate;
    }

    const newMov: InventoryMovement = {
      ...movData,
      id: `mov-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      companyId: currentCompany.id,
      quantity: movementQuantity,
      unitCostBs, unitCostUsd, totalCostBs, totalCostUsd,
      balanceQty: newStock,
      balanceTotalBs: Math.round(newStock * newAverageBs * 100) / 100,
      balanceTotalUsd: Math.round(newStock * newAverageUsd * 1000000) / 1000000,
      bcvRate: rate, additionalLandedCostsBs: landedCostsBs,
      costingMethod: prod.costingMethod || 'PROMEDIO_PONDERADO'
    };

    const generatedEntries: JournalEntry[] = [];
    const inventoryAccountCode = prod.inventoryAccountCode || '1.1.4.01';
    const costAccountCode = prod.costOfSalesAccountCode || '5.1.1.01';
    const adjustmentAccountCode = prod.adjustmentAccountCode || '5.1.2.01';
    const inventoryAccount = accounts.find(a => a.code === inventoryAccountCode);
    const costAccount = accounts.find(a => a.code === costAccountCode);
    const adjustmentAccount = accounts.find(a => a.code === adjustmentAccountCode);
    const makeLine = (code: string, debitBs: number, creditBs: number, debitUsd: number, creditUsd: number, description: string): JournalEntryItem => ({
      accountCode: code, accountName: accounts.find(a => a.code === code)?.name || code,
      debitBs, creditBs, debitUsd, creditUsd, description
    });
    const isSale = movData.type === 'SALIDA' && movData.concept === 'VENTA';
    const isLoss = movData.type === 'SALIDA' && (movData.concept === 'MERMA' || movData.concept === 'AUTOCONSUMO');
    const isCustomerReturn = movData.type === 'ENTRADA' && movData.concept === 'DEVOLUCION_CLIENTE';
    const isSupplierReturn = movData.type === 'SALIDA' && movData.concept === 'DEVOLUCION_COMPRA';
    const adjustmentDelta = Number(movData.balanceQty) - prod.currentStock;
    const isPositiveAdjustment = movData.type === 'AJUSTE' && adjustmentDelta > 0;
    const shouldPost = isSale || isLoss || isCustomerReturn || isSupplierReturn || movData.type === 'AJUSTE';
    if (shouldPost) {
      if (!inventoryAccount || !inventoryAccount.isMovement) throw new Error(`La cuenta de inventario ${inventoryAccountCode} no existe o no admite movimientos.`);
      const payableAccount = accounts.find(a => a.code === '2.1.1.01' && a.isMovement);
      const debitCode = isSale ? costAccountCode : isSupplierReturn ? '2.1.1.01' : adjustmentAccountCode;
      const debitAccount = isSale || isCustomerReturn ? costAccount : isSupplierReturn ? payableAccount : adjustmentAccount;
      if ((isSale || isCustomerReturn) && (!costAccount || !costAccount.isMovement)) throw new Error(`La cuenta de costo de ventas ${costAccountCode} no existe o no admite movimientos.`);
      if (isSupplierReturn && (!payableAccount || !payableAccount.isMovement)) throw new Error('Falta la cuenta de control de Cuentas por Pagar 2.1.1.01 para registrar la devolución al proveedor.');
      if (!isPositiveAdjustment && !isCustomerReturn && (!debitAccount || !debitAccount.isMovement)) throw new Error(`La cuenta de costo/ajuste ${debitCode} no existe o no admite movimientos.`);
      if (isPositiveAdjustment && (!adjustmentAccount || !adjustmentAccount.isMovement)) throw new Error(`La cuenta de contrapartida de ajuste ${adjustmentAccountCode} no existe o no admite movimientos.`);
      const amountBs = totalCostBs;
      const amountUsd = totalCostUsd;
      const items: JournalEntryItem[] = isPositiveAdjustment
        ? [makeLine(inventoryAccountCode, amountBs, 0, amountUsd, 0, 'Entrada por sobrante de inventario'), makeLine(adjustmentAccountCode, 0, amountBs, 0, amountUsd, 'Contrapartida por sobrante de inventario')]
        : isCustomerReturn
          ? [makeLine(inventoryAccountCode, amountBs, 0, amountUsd, 0, 'Entrada por devolución de cliente'), makeLine(costAccountCode, 0, amountBs, 0, amountUsd, 'Reversión del costo de ventas por devolución')]
          : isSupplierReturn
            ? [makeLine('2.1.1.01', amountBs, 0, amountUsd, 0, 'Devolución de mercancía al proveedor'), makeLine(inventoryAccountCode, 0, amountBs, 0, amountUsd, 'Salida por devolución de compra')]
            : [makeLine(debitCode, amountBs, 0, amountUsd, 0, isSale ? 'Costo de ventas según método de costeo' : 'Merma, faltante o ajuste de inventario'), makeLine(inventoryAccountCode, 0, amountBs, 0, amountUsd, 'Descargo de inventario')];
      const companyEntries = journalEntries.filter(e => e.companyId === currentCompany.id);
      generatedEntries.push({
        id: `entry-inventory-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        companyId: currentCompany.id, entryNumber: companyEntries.reduce((max,e) => Math.max(max,e.entryNumber),0) + generatedEntries.length + 1,
        date: movData.date, description: `${isSale ? 'Costo de venta' : isCustomerReturn ? 'Devolución de cliente' : isSupplierReturn ? 'Devolución a proveedor' : isPositiveAdjustment ? 'Sobrante de inventario' : 'Ajuste/merma de inventario'}: ${prod.name} · ${movData.documentRef}`,
        type: 'INVENTARIO', bcvRate: rate, referenceDoc: movData.documentRef,
        items, createdAt: new Date().toISOString()
      });
    }
    if (generatedEntries.length > 0) newMov.journalEntryId = generatedEntries[0].id;
    setMovements(prev => [...prev, newMov]);
    setProducts(prev => prev.map(p => p.id === prod.id ? {
      ...p, currentStock: newStock, avgCostBs: newAverageBs, avgCostUsd: newAverageUsd,
      lastCostBs: movData.type === 'ENTRADA' ? effectiveUnitCost : p.lastCostBs,
      lastCostUsd: movData.type === 'ENTRADA' ? effectiveUnitCost / rate : p.lastCostUsd
    } : p));
    if (generatedEntries.length > 0) setJournalEntries(prev => [...prev, ...generatedEntries]);
    return newMov;
  };


  const executeProduction = (finishedProductId: string, outputQuantity: number, date: string, bcvRateInput: number, documentRef: string): InventoryMovement[] => {
    const finished = products.find(p => p.id === finishedProductId && p.companyId === currentCompany.id);
    if (!finished || (finished.itemType !== 'PRODUCTO_TERMINADO' && finished.itemType !== 'PRODUCTO_EN_PROCESO')) throw new Error('Seleccione un producto terminado o en proceso válido.');
    if (!Number.isFinite(outputQuantity) || outputQuantity <= 0) throw new Error('La cantidad producida debe ser mayor que cero.');
    if (!Number.isFinite(bcvRateInput) || bcvRateInput <= 0) throw new Error('La tasa BCV histórica debe ser mayor que cero.');
    const parsedProductionDate = new Date(date + 'T00:00:00Z');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedProductionDate.getTime()) || parsedProductionDate.toISOString().slice(0,10) !== date) throw new Error('La fecha de producción no es válida.');
    const recipe = finished.bomComponents || [];
    if (!recipe.length) throw new Error('Configure primero la matriz insumo-producto del artículo.');
    if (recipe.some(line => !Number.isFinite(line.quantityPerUnit) || line.quantityPerUnit <= 0 || line.productId === finishedProductId)) {
      throw new Error('La matriz contiene componentes inválidos o una referencia circular directa.');
    }
    const rate = bcvRateInput;
    const wipAccount = accounts.find(a => a.code === '1.1.4.04' && a.isMovement);
    if (!wipAccount) throw new Error('Falta la cuenta contable de productos en proceso 1.1.4.04.');
    const movementsToAdd: InventoryMovement[] = [];
    const journalItems: JournalEntryItem[] = [];
    const productUpdates = new Map<string, InventoryProduct>();
    let totalProductionCostBs = 0;
    for (const line of recipe) {
      const component = products.find(p => p.id === line.productId && p.companyId === currentCompany.id);
      if (!component) throw new Error('Un componente de la matriz ya no existe en la empresa activa.');
      if (component.itemType !== 'MATERIA_PRIMA' && component.itemType !== 'PRODUCTO_EN_PROCESO') {
        throw new Error('Los componentes de producción deben clasificarse como materia prima o producto en proceso: ' + component.code + '.');
      }
      if (component.itemType === 'PRODUCTO_EN_PROCESO' && component.inventoryAccountCode !== '1.1.4.04') throw new Error('El componente en proceso ' + component.code + ' debe estar asociado a la cuenta 1.1.4.04.');
      const requiredQuantity = Math.round(line.quantityPerUnit * outputQuantity * 1000000) / 1000000;
      if (requiredQuantity > component.currentStock + 1e-8) throw new Error('Existencia insuficiente de ' + component.code + ': disponibles ' + component.currentStock + ', requeridas ' + requiredQuantity + '.');
      let totalBs = 0;
      let componentNewAverageBs = component.avgCostBs;
      let componentNewAverageUsd = component.avgCostUsd;
      if (component.costingMethod === 'PEPS') {
        const layers: CostLayer[] = [];
        const history = movements.filter(m => m.companyId === currentCompany.id && m.productId === component.id).slice().sort((a,b) => a.date.localeCompare(b.date));
        let runningQuantity = 0;
        for (const m of history) {
          if (m.type === 'ENTRADA') { layers.push({ quantity: m.quantity, unitCostBs: m.unitCostBs, unitCostUsd: m.unitCostUsd, date: m.date, documentRef: m.documentRef }); runningQuantity += m.quantity; }
          else if (m.type === 'SALIDA') {
            let remaining = m.quantity;
            for (const layer of layers) { const used = Math.min(layer.quantity, remaining); layer.quantity -= used; remaining -= used; if (remaining <= 1e-8) break; }
            runningQuantity -= m.quantity;
          } else {
            const delta = m.balanceQty - runningQuantity;
            if (delta > 0) layers.push({ quantity: delta, unitCostBs: m.unitCostBs, unitCostUsd: m.unitCostUsd, date: m.date, documentRef: m.documentRef });
            else if (delta < 0) { let remaining = Math.abs(delta); for (const layer of layers) { const used = Math.min(layer.quantity, remaining); layer.quantity -= used; remaining -= used; if (remaining <= 1e-8) break; } }
            runningQuantity = m.balanceQty;
          }
        }
        const layerQuantity = layers.reduce((sum, layer) => sum + Math.max(0, layer.quantity), 0);
        if (layerQuantity < component.currentStock - 1e-8) layers.unshift({ quantity: component.currentStock - layerQuantity, unitCostBs: component.avgCostBs, unitCostUsd: component.avgCostUsd, date: '0000-01-01', documentRef: 'SALDO-APERTURA-LEGADO' });
        const availableLayers = layers.reduce((sum, layer) => sum + Math.max(0, layer.quantity), 0);
        if (availableLayers > component.currentStock + 1e-8) throw new Error('El Kardex PEPS no concilia con la existencia actual de ' + component.code + '.');
        if (availableLayers < requiredQuantity - 1e-8) throw new Error('El Kardex PEPS no cubre la existencia disponible de ' + component.code + '.');
        const fifoLayerValue = layers.reduce((sum, layer) => sum + Math.max(0, layer.quantity) * layer.unitCostBs, 0);
        totalBs = calculateFifoIssue(layers, requiredQuantity).totalCostBs;
        const remainingQuantity = Math.max(0, component.currentStock - requiredQuantity);
        componentNewAverageBs = remainingQuantity > 0 ? Math.max(0, fifoLayerValue - totalBs) / remainingQuantity : 0;
        componentNewAverageUsd = componentNewAverageBs / rate;
      } else {
        totalBs = Math.round(requiredQuantity * component.avgCostBs * 100) / 100;
      }
      const unitCostBs = totalBs / requiredQuantity;
      totalProductionCostBs += totalBs;
      const inventoryCode = component.inventoryAccountCode || '1.1.4.01';
      const inventoryAccount = accounts.find(a => a.code === inventoryCode && a.isMovement);
      if (!inventoryAccount) throw new Error('La cuenta de inventario del componente ' + component.code + ' no es válida.');
      const movementId = 'mov-prod-consume-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
      const outMovement: InventoryMovement = {
        id: movementId, companyId: currentCompany.id, productId: component.id, productName: component.name, productCode: component.code,
        date, type: 'SALIDA', concept: 'PRODUCCION', documentRef: documentRef || ('PROD-' + Date.now()), documentType: 'Orden de producción',
        quantity: requiredQuantity, unitCostBs, unitCostUsd: unitCostBs / rate, totalCostBs: totalBs, totalCostUsd: totalBs / rate,
        balanceQty: Math.max(0, component.currentStock - requiredQuantity),
        balanceTotalBs: Math.round(Math.max(0, component.currentStock - requiredQuantity) * componentNewAverageBs * 100) / 100,
        balanceTotalUsd: Math.round(Math.max(0, component.currentStock - requiredQuantity) * componentNewAverageUsd * 1000000) / 1000000,
        bcvRate: rate, costingMethod: component.costingMethod
      };
      movementsToAdd.push(outMovement);
      journalItems.push(
        { accountCode: wipAccount.code, accountName: wipAccount.name, debitBs: totalBs, creditBs: 0, debitUsd: totalBs / rate, creditUsd: 0, description: 'Consumo en producción: ' + component.code },
        { accountCode: inventoryAccount.code, accountName: inventoryAccount.name, debitBs: 0, creditBs: totalBs, debitUsd: 0, creditUsd: totalBs / rate, description: 'Salida de materia prima: ' + component.code }
      );
      productUpdates.set(component.id, { ...component, currentStock: Math.max(0, component.currentStock - requiredQuantity), avgCostBs: componentNewAverageBs, avgCostUsd: componentNewAverageUsd });
    }
    totalProductionCostBs = Math.round(totalProductionCostBs * 100) / 100;
    const productionUnitCostBs = totalProductionCostBs / outputQuantity;
    const weightedFinished = calculateWeightedAverageCost(finished.currentStock, finished.avgCostBs, outputQuantity, productionUnitCostBs, rate);
    const finishedInventoryCode = finished.inventoryAccountCode || '1.1.4.01';
    const finishedInventoryAccount = accounts.find(a => a.code === finishedInventoryCode && a.isMovement);
    if (!finishedInventoryAccount) throw new Error('La cuenta de inventario del producto terminado no es válida.');
    if (finished.itemType === 'PRODUCTO_EN_PROCESO' && finishedInventoryCode !== '1.1.4.04') throw new Error('El producto en proceso debe estar asociado a la cuenta 1.1.4.04.');
    const totalFinishedBs = Math.round(outputQuantity * productionUnitCostBs * 100) / 100;
    if (finished.itemType !== 'PRODUCTO_EN_PROCESO') {
      journalItems.push(
        { accountCode: finishedInventoryAccount.code, accountName: finishedInventoryAccount.name, debitBs: totalFinishedBs, creditBs: 0, debitUsd: totalFinishedBs / rate, creditUsd: 0, description: 'Entrada de producto terminado: ' + finished.code },
        { accountCode: wipAccount.code, accountName: wipAccount.name, debitBs: 0, creditBs: totalFinishedBs, debitUsd: 0, creditUsd: totalFinishedBs / rate, description: 'Transferencia de producción terminada: ' + finished.code }
      );
    }
    const entry = addJournalEntry({
      entryNumber: 0, date, description: 'Orden de producción ' + (documentRef || '') + ' · ' + finished.code,
      type: 'INVENTARIO', bcvRate: rate, referenceDoc: documentRef || ('PROD-' + Date.now()), items: journalItems
    });
    for (const movement of movementsToAdd) movement.journalEntryId = entry.id;
    const finishedMovement: InventoryMovement = {
      id: 'mov-prod-finished-' + Date.now(), companyId: currentCompany.id, productId: finished.id, productName: finished.name, productCode: finished.code,
      date, type: 'ENTRADA', concept: 'PRODUCCION', documentRef: entry.referenceDoc || '', documentType: 'Orden de producción',
      quantity: outputQuantity, unitCostBs: productionUnitCostBs, unitCostUsd: productionUnitCostBs / rate,
      totalCostBs: totalFinishedBs, totalCostUsd: totalFinishedBs / rate, balanceQty: weightedFinished.quantity,
      balanceTotalBs: weightedFinished.totalCostBs, balanceTotalUsd: weightedFinished.totalCostUsd,
      bcvRate: rate, costingMethod: finished.costingMethod, journalEntryId: entry.id
    };
    movementsToAdd.push(finishedMovement);
    productUpdates.set(finished.id, {
      ...finished, currentStock: weightedFinished.quantity, avgCostBs: weightedFinished.unitCostBs,
      avgCostUsd: weightedFinished.unitCostUsd, lastCostBs: productionUnitCostBs, lastCostUsd: productionUnitCostBs / rate
    });
    setProducts(prev => prev.map(product => productUpdates.get(product.id) || product));
    setMovements(prev => [...prev, ...movementsToAdd]);
    return movementsToAdd;
  };

  const deleteVatVoucher = (id: string) => {
    setVatVouchers(prev => prev.filter(v => v.id !== id));
  };

  const deleteIslrVoucher = (id: string) => {
    setIslrVouchers(prev => prev.filter(v => v.id !== id));
  };

  // Tesorería: alta bancaria y creación automática del auxiliar contable.
  const addBankAccount = (bankData: Omit<BankAccount, 'id' | 'companyId' | 'accountCode'>): BankAccount => {
    if (!currentCompany.id) throw new Error('Registre o seleccione una empresa antes de crear cuentas bancarias.');
    const digits = String(bankData.accountNumber || '').replace(/\D/g, '');
    if (digits.length !== 20) throw new Error('El número de cuenta bancaria debe contener exactamente 20 dígitos.');
    if (!bankData.bankName?.trim()) throw new Error('Indique el nombre del banco.');
    if (bankData.currency !== 'BS' && bankData.currency !== 'USD') throw new Error('La moneda bancaria debe ser Bs. o USD.');
    const accountType = bankData.accountType ?? 'CORRIENTE';
    if (accountType !== 'CORRIENTE' && accountType !== 'AHORRO') throw new Error('Seleccione un tipo de cuenta bancaria válido.');
    if (bankAccounts.some(b => b.companyId === currentCompany.id && b.accountNumber.replace(/\D/g, '') === digits)) {
      throw new Error('Ya existe una cuenta bancaria con ese número en la empresa activa.');
    }

    const rawBs = Number(bankData.initialBalanceBs ?? 0);
    const rawUsd = Number(bankData.initialBalanceUsd ?? 0);
    if (!Number.isFinite(rawBs) || !Number.isFinite(rawUsd) || rawBs < 0 || rawUsd < 0) {
      throw new Error('El saldo inicial debe ser un importe numérico, finito y no negativo.');
    }
    const hasOpeningBalance = bankData.currency === 'USD' ? rawUsd > 0 : rawBs > 0;
    const rate = Number(currentCompany.bcvRate);
    if (hasOpeningBalance && (!Number.isFinite(rate) || rate <= 0)) throw new Error('Configure una tasa BCV válida antes de registrar un saldo inicial.');

    // El importe introducido en la moneda de la cuenta es la autoridad; la otra
    // moneda se calcula con la tasa BCV para evitar saldos de apertura incoherentes.
    const bs = bankData.currency === 'USD'
      ? Math.round(rawUsd * rate * 100) / 100
      : Math.round(rawBs * 100) / 100;
    const usd = bankData.currency === 'USD'
      ? Math.round(rawUsd * 1000000) / 1000000
      : (rate > 0 ? Math.round((bs / rate) * 1000000) / 1000000 : 0);

    const parentCode = bankData.currency === 'USD' ? '1.1.1.07' : '1.1.1.06';
    const controlName = bankData.currency === 'USD' ? 'Bancos Moneda Extranjera (control)' : 'Bancos Moneda Nacional (control)';
    const existingParent = accounts.find(a => a.code === parentCode);
    const parent: Account = existingParent
      ? { ...existingParent, name: controlName, isMovement: false, level: 4, parentCode: '1.1.1' }
      : { code: parentCode, name: controlName, type: 'ACTIVO', level: 4, isMovement: false, parentCode: '1.1.1' };
    const children = accounts.filter(a => a.parentCode === parentCode && /^\d+$/.test(a.code.split('.').at(-1) || ''));
    const nextAux = children.reduce((max, a) => Math.max(max, Number(a.code.split('.').at(-1) || 0)), 0) + 1;
    const accountCode = parentCode + '.' + String(nextAux).padStart(2, '0');
    const auxName = `${bankData.bankName.trim()} - Cta. ${accountType === 'AHORRO' ? 'Ahorro' : 'Corriente'} ${bankData.currency === 'USD' ? 'USD' : 'Bs.'}`;
    const newAux: Account = { code: accountCode, name: auxName, type: 'ACTIVO', level: 5, isMovement: true, parentCode };
    if (accounts.some(a => a.code === accountCode)) throw new Error('No se pudo generar un código auxiliar único. Actualice el catálogo e intente nuevamente.');
    const equity = hasOpeningBalance ? accounts.find(a => a.code === '3.3.1.01' && a.isMovement) : undefined;
    if (hasOpeningBalance && !equity) throw new Error('No existe la cuenta de contrapartida de apertura 3.3.1.01.');

    const newBank: BankAccount = { ...bankData, accountType, accountCode, accountNumber: digits, initialBalanceBs: bs, initialBalanceUsd: usd, id: `bank-acc-${Date.now()}-${Math.floor(Math.random()*100000)}`, companyId: currentCompany.id };
    // Registrar primero el asiento: si falla la partida doble, no deja una cuenta
    // bancaria ni un auxiliar huérfanos en el estado de la aplicación.
    if (hasOpeningBalance && equity) {
      addJournalEntry({
        entryNumber: 0, date: new Date().toISOString().slice(0,10),
        description: `Apertura de cuenta bancaria: ${auxName}`, type: 'APERTURA', bcvRate: rate,
        referenceDoc: `APERTURA-${digits}`,
        items: [
          { accountCode, accountName: auxName, debitBs: bs, creditBs: 0, debitUsd: usd, creditUsd: 0, description: 'Saldo inicial de tesorería' },
          { accountCode: equity.code, accountName: equity.name, debitBs: 0, creditBs: bs, debitUsd: 0, creditUsd: usd, description: 'Contrapartida saldo inicial de tesorería' }
        ]
      });
    }
    setAccounts(prev => [...prev.filter(a => a.code !== parentCode), parent, newAux].sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true})));
    setBankAccounts(prev => [...prev, newBank]);
    return newBank;
  };

  const registerTreasuryMovement = (draft: { bankAccountId: string; date: string; reference: string; description: string; type: 'INCOME' | 'EXPENSE' | 'TRANSFER'; amount: number; counterpartAccountCode?: string; destinationBankAccountId?: string }): JournalEntry => {
    const source = bankAccounts.find(b => b.id === draft.bankAccountId && b.companyId === currentCompany.id);
    if (!source) throw new Error('Seleccione una cuenta bancaria de la empresa activa.');
    const parsedDate = new Date(draft.date + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== draft.date) throw new Error('La fecha del movimiento no es válida.');
    if (!draft.reference?.trim() || !draft.description?.trim()) throw new Error('La referencia y el concepto son obligatorios.');
    if (!['INCOME', 'EXPENSE', 'TRANSFER'].includes(draft.type)) throw new Error('El tipo de movimiento no es válido.');
    if (!Number.isFinite(draft.amount) || draft.amount <= 0) throw new Error('El importe debe ser mayor que cero.');
    const normalizedReference = draft.reference.trim().toLocaleLowerCase();
    const duplicatedReference = journalEntries.some(entry =>
      entry.companyId === currentCompany.id &&
      entry.referenceDoc?.trim().toLocaleLowerCase() === normalizedReference &&
      entry.items.some(item => item.accountCode === source.accountCode)
    );
    if (duplicatedReference) throw new Error('Ya existe un movimiento contabilizado con esa referencia para esta cuenta bancaria.');
    const rate = Number(currentCompany.bcvRate);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('Configure una tasa BCV válida para registrar movimientos.');
    const amountBs = source.currency === 'USD' ? Math.round(draft.amount * rate * 100) / 100 : Math.round(draft.amount * 100) / 100;
    const amountUsd = source.currency === 'USD' ? Math.round(draft.amount * 1000000) / 1000000 : Math.round(amountBs / rate * 1000000) / 1000000;
    if (amountBs <= 0 || amountUsd <= 0) throw new Error('El importe es demasiado pequeño para contabilizarse en ambas monedas.');
    const bankAccount = accounts.find(a => a.code === source.accountCode && a.isMovement);
    if (!bankAccount) throw new Error('La cuenta auxiliar del banco no existe o no admite movimientos.');
    let items: JournalEntryItem[];
    if (draft.type === 'TRANSFER') {
      const destination = bankAccounts.find(b => b.id === draft.destinationBankAccountId && b.companyId === currentCompany.id);
      if (!destination || destination.id === source.id) throw new Error('Seleccione otra cuenta bancaria propia como destino.');
      if (destination.currency !== source.currency) {
        throw new Error('La transferencia directa entre cuentas de monedas distintas está bloqueada para evitar asientos descuadrados. Registre la operación cambiaria con su tasa y diferencia cambiaria documentadas antes de transferir entre monedas.');
      }
      const destAccount = accounts.find(a => a.code === destination.accountCode && a.isMovement);
      if (!destAccount) throw new Error('La cuenta auxiliar bancaria de destino no es válida.');
      const destBs = destination.currency === 'USD' ? Math.round(amountUsd * rate * 100) / 100 : amountBs;
      const destUsd = destination.currency === 'USD' ? amountUsd : Math.round(destBs / rate * 1000000) / 1000000;
      items = [
        { accountCode: destAccount.code, accountName: destAccount.name, debitBs: destBs, creditBs: 0, debitUsd: destUsd, creditUsd: 0, description: 'Entrada por transferencia entre cuentas propias' },
        { accountCode: bankAccount.code, accountName: bankAccount.name, debitBs: 0, creditBs: amountBs, debitUsd: 0, creditUsd: amountUsd, description: 'Salida por transferencia entre cuentas propias' }
      ];
    } else {
      const bankAccountCodes = new Set(bankAccounts.map(bank => bank.accountCode));
      const counterpart = accounts.find(a => a.code === draft.counterpartAccountCode && a.isMovement && a.code !== bankAccount.code && !bankAccountCodes.has(a.code));
      if (!counterpart) throw new Error('Seleccione una cuenta contable de movimiento válida que no sea una cuenta bancaria. Para mover fondos entre bancos, use Transferencia.');
      items = draft.type === 'INCOME'
        ? [
            { accountCode: bankAccount.code, accountName: bankAccount.name, debitBs: amountBs, creditBs: 0, debitUsd: amountUsd, creditUsd: 0, description: draft.description.trim() },
            { accountCode: counterpart.code, accountName: counterpart.name, debitBs: 0, creditBs: amountBs, debitUsd: 0, creditUsd: amountUsd, description: draft.description.trim() }
          ]
        : [
            { accountCode: counterpart.code, accountName: counterpart.name, debitBs: amountBs, creditBs: 0, debitUsd: amountUsd, creditUsd: 0, description: draft.description.trim() },
            { accountCode: bankAccount.code, accountName: bankAccount.name, debitBs: 0, creditBs: amountBs, debitUsd: 0, creditUsd: amountUsd, description: draft.description.trim() }
          ];
    }
    const entry = addJournalEntry({
      entryNumber: 0, date: draft.date, description: draft.description.trim(), type: 'MANUAL', bcvRate: rate,
      referenceDoc: draft.reference.trim(), items
    });
    return entry;
  };

  const addBankStatementMovement = (movData: Omit<BankStatementMovement, 'id' | 'companyId'>): BankStatementMovement => {
    const bank = bankAccounts.find(item =>
      item.id === movData.bankAccountId && item.companyId === currentCompany.id
    );
    if (!bank) throw new Error('Seleccione una cuenta bancaria de la empresa activa.');
    const parsedDate = new Date(movData.date + 'T00:00:00Z');
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(movData.date) ||
        !Number.isFinite(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== movData.date) {
      throw new Error('La fecha del movimiento bancario no es válida.');
    }
    if (movData.type !== 'DEBIT' && movData.type !== 'CREDIT') {
      throw new Error('La naturaleza del movimiento bancario debe ser débito o crédito.');
    }
    const amountBs = Number(movData.amountBs);
    const amountUsd = Number(movData.amountUsd);
    if (!Number.isFinite(amountBs) || !Number.isFinite(amountUsd) ||
        amountBs < 0 || amountUsd < 0 || (amountBs === 0 && amountUsd === 0)) {
      throw new Error('El movimiento debe tener un importe válido y positivo en al menos una moneda.');
    }
    const newMov: BankStatementMovement = {
      ...movData,
      amountBs: Math.round(amountBs * 100) / 100,
      amountUsd: Math.round(amountUsd * 1000000) / 1000000,
      id: `stmt-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      companyId: currentCompany.id,
      isReconciled: false,
      matchedBy: undefined,
      reconciledWithJournalEntryId: undefined,
      reconciledAt: undefined
    };
    setBankStatementMovements(prev => [...prev, newMov]);
    return newMov;
  };

  const deleteBankStatementMovement = (id: string) => {
    setBankStatementMovements(prev => prev.filter(m => m.id !== id));
  };

  const reconcileMovementManual = (statementMovementId: string, journalEntryId?: string) => {
    const statement = bankStatementMovements.find(m =>
      m.id === statementMovementId && m.companyId === currentCompany.id
    );
    if (!statement) throw new Error('El movimiento bancario no pertenece a la empresa activa o ya no existe.');
    if (statement.isReconciled) throw new Error('El movimiento ya está conciliado. Desconcílielo antes de vincularlo nuevamente.');

    if (journalEntryId) {
      const linkedEntry = journalEntries.find(entry =>
        entry.id === journalEntryId &&
        entry.companyId === currentCompany.id &&
        entry.items.some(item => item.accountCode === bankAccounts.find(bank =>
          bank.id === statement.bankAccountId && bank.companyId === currentCompany.id
        )?.accountCode)
      );
      if (!linkedEntry) throw new Error('El asiento seleccionado no pertenece a la empresa activa o no corresponde a la cuenta bancaria del movimiento.');
    }

    setBankStatementMovements(prev =>
      prev.map(m =>
        m.id === statementMovementId && m.companyId === currentCompany.id
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
        m.id === statementMovementId && m.companyId === currentCompany.id
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
    const targetAccount = bankAccounts.find(b => b.id === bankAccountId && b.companyId === currentCompany.id);
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
            const bankLines = entry.items.filter(it => it.accountCode === bankCode);
            if (bankLines.length === 0) return false;

            // A coincident reference is not enough: the bank-side amount and
            // direction must also agree with the statement movement.
            const isUsdAccount = targetAccount.currency === 'USD';
            const statementAmount = isUsdAccount ? stmt.amountUsd : stmt.amountBs;
            const tolerance = isUsdAccount ? 0.000001 : 0.05;
            const amountAndNatureMatch = bankLines.some(it => {
              const entryDebit = isUsdAccount ? it.debitUsd : it.debitBs;
              const entryCredit = isUsdAccount ? it.creditUsd : it.creditBs;
              return stmt.type === 'CREDIT'
                ? Math.abs(entryDebit - statementAmount) < tolerance
                : Math.abs(entryCredit - statementAmount) < tolerance;
            });
            if (!amountAndNatureMatch) return false;

            const entryRef = (entry.referenceDoc || '').trim().toLowerCase();
            const entryDesc = (entry.description || '').trim().toLowerCase();
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
            const isUsdAccount = targetAccount.currency === 'USD';
            const statementAmount = isUsdAccount ? stmt.amountUsd : stmt.amountBs;
            const entryDebit = isUsdAccount ? it.debitUsd : it.debitBs;
            const entryCredit = isUsdAccount ? it.creditUsd : it.creditBs;
            const tolerance = isUsdAccount ? 0.000001 : 0.05;
            if (stmt.type === 'CREDIT') {
              return Math.abs(entryDebit - statementAmount) < tolerance;
            }
            return Math.abs(entryCredit - statementAmount) < tolerance;
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
    if (statementMovement.companyId !== currentCompany.id) {
      throw new Error('El movimiento bancario no pertenece a la empresa activa.');
    }
    if (statementMovement.isReconciled) {
      throw new Error('El movimiento ya está conciliado y no puede generar otro asiento de ajuste.');
    }
    const targetBank = bankAccounts.find(b =>
      b.id === statementMovement.bankAccountId && b.companyId === currentCompany.id
    );
    if (!targetBank) {
      throw new Error('La cuenta bancaria no pertenece a la empresa activa.');
    }
    const bankAccountCode = targetBank.accountCode;
    const bankAccountName = targetBank.bankName;
    const contraAccount = accounts.find(a => a.code === contraAccountCode);
    const allBankAccountCodes = new Set(bankAccounts.map(bank => bank.accountCode));
    if (!contraAccount || !contraAccount.isMovement || allBankAccountCodes.has(contraAccount.code)) {
      throw new Error('Seleccione una cuenta contable de movimiento válida que no sea una cuenta bancaria.');
    }
    const contraAccountName = contraAccount.name;

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

    // The new entry is not yet present in the current render's journalEntries
    // snapshot, so reconcile directly after validating the statement and bank.
    setBankStatementMovements(prev =>
      prev.map(m =>
        m.id === statementMovement.id && m.companyId === currentCompany.id && m.bankAccountId === targetBank.id
          ? {
              ...m,
              isReconciled: true,
              matchedBy: 'MANUAL',
              reconciledWithJournalEntryId: adjustingEntry.id,
              reconciledAt: new Date().toISOString()
            }
          : m
      )
    );

    return adjustingEntry;
  };

  const resetToSampleData = () => {
    // Mantiene el comportamiento anterior del restablecimiento de datos de muestra.
    setCompanies([]);
    setCurrentCompanyId('');
    setAccounts(DEFAULT_CHART_OF_ACCOUNTS);
    setJournalEntries([]);
    setPurchases([]);
    setSales([]);
    setProducts([]);
    setMovements([]);
    setVatVouchers([]);
    setIslrVouchers([]);
    setBankAccounts([]);
    setBankStatementMovements([]);
    setCreditSettlements([]);
  };

  const resetFactoryData = () => {
    // Reset de fábrica completo de los datos del negocio: elimina TODAS las empresas
    // y todos sus registros. Conserva el usuario administrador y la licencia/prueba,
    // gestionados fuera de este contexto, para permitir volver a configurar SICOVEN.
    setCompanies([]);
    setCurrentCompanyId('');
    setAccounts(DEFAULT_CHART_OF_ACCOUNTS);
    setJournalEntries([]);
    setPurchases([]);
    setSales([]);
    setProducts([]);
    setMovements([]);
    setVatVouchers([]);
    setIslrVouchers([]);
    setBankAccounts([]);
    setBankStatementMovements([]);
    setCreditSettlements([]);
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
      bankStatementMovements,
      creditSettlements
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
      const accountByCode = new Map<string, Account>();
      for (const account of data.accounts as Account[]) {
        if (!account || typeof account.code !== 'string' || !account.code.trim() ||
            typeof account.name !== 'string' || !account.name.trim() ||
            !['ACTIVO','PASIVO','PATRIMONIO','INGRESOS','COSTOS','GASTOS'].includes(account.type) ||
            !Number.isInteger(account.level) || account.level < 1 || account.level > 5 ||
            typeof account.isMovement !== 'boolean' || accountByCode.has(account.code.toLowerCase())) {
          throw new Error('El plan de cuentas contiene códigos duplicados o cuentas con campos inválidos.');
        }
        accountByCode.set(account.code.toLowerCase(), account);
      }
      for (const account of data.accounts as Account[]) {
        if (account.parentCode && !accountByCode.has(account.parentCode.toLowerCase())) {
          throw new Error('La cuenta ' + account.code + ' referencia una cuenta padre inexistente.');
        }
      }
      for (const entry of data.journalEntries as JournalEntry[]) {
        if (!entry || !companyIds.has(entry.companyId) || !Array.isArray(entry.items) ||
            !isValidIsoDate(entry.date) ||
            !Number.isFinite(entry.bcvRate) || entry.bcvRate <= 0 || entry.items.length < 2) {
          throw new Error('Hay asientos con empresa, fecha, tasa BCV o líneas inválidas.');
        }
        let debitBs = 0, creditBs = 0, debitUsd = 0, creditUsd = 0;
        for (const line of entry.items as JournalEntryItem[]) {
          const account = accountByCode.get(String(line.accountCode || '').toLowerCase());
          const amounts = [line.debitBs, line.creditBs, line.debitUsd, line.creditUsd].map(Number);
          if (!account || !account.isMovement || amounts.some(value => !Number.isFinite(value) || value < 0) ||
              (Number(line.debitBs) > 0 && Number(line.creditBs) > 0) ||
              (Number(line.debitUsd) > 0 && Number(line.creditUsd) > 0)) {
            throw new Error('El asiento ' + entry.entryNumber + ' contiene una cuenta o línea contable inválida.');
          }
          debitBs += Number(line.debitBs); creditBs += Number(line.creditBs);
          debitUsd += Number(line.debitUsd); creditUsd += Number(line.creditUsd);
        }
        if (Math.abs(debitBs-creditBs) >= 0.01 || Math.abs(debitUsd-creditUsd) >= 0.01 || debitBs <= 0 || debitUsd <= 0) {
          throw new Error('El asiento ' + entry.entryNumber + ' no cuadra en ambas monedas. No se restauró el respaldo.');
        }
      }
      for (const key of requiredCollections) {
        const rows = data[key] as any[];
        if (rows.some(row => !row || typeof row !== 'object' || (row.companyId && !companyIds.has(row.companyId)))) {
          throw new Error(`La colección ${key} contiene registros inválidos o vinculados a empresas inexistentes.`);
        }
      }
      for (const [collectionName, documents] of [['ventas', data.sales], ['compras', data.purchases]] as const) {
        const documentKeys = new Set<string>();
        for (const document of documents as Array<SaleRecord | PurchaseRecord>) {
          const key = String(document.companyId) + '|' + String(document.invoiceNumber || '').trim().toLowerCase();
          const totalBs = Number(document.totalAmountBs), baseBs = Number(document.taxableBaseBs);
          const exemptBs = Number(document.exemptAmountBs), vatBs = Number(document.vatAmountBs);
          const totalUsd = Number(document.totalAmountUsd), baseUsd = Number(document.taxableBaseUsd);
          const vatUsd = Number(document.vatAmountUsd), rate = Number(document.bcvRate);
          if (!document.invoiceNumber?.trim() || documentKeys.has(key) ||
              !isValidIsoDate(document.invoiceDate) ||
              !Number.isFinite(rate) || rate <= 0 ||
              [totalBs,baseBs,exemptBs,vatBs,totalUsd,baseUsd,vatUsd].some(value => !Number.isFinite(value) || value < 0) ||
              Math.abs(totalBs - baseBs - exemptBs - vatBs) > 0.02 ||
              Math.abs(totalUsd - baseUsd - vatUsd - exemptBs / rate) > 0.02 ||
              (document.paymentTerm !== undefined && !['CONTADO','CREDITO'].includes(document.paymentTerm)) ||
              (document.paymentTerm === 'CREDITO' && (!Number.isInteger(document.creditDays) || Number(document.creditDays) < 1 || !isValidIsoDate(document.dueDate)))) {
            throw new Error('La colección de ' + collectionName + ' contiene facturas duplicadas, fechas, importes, tasa BCV o condiciones de crédito inválidas.');
          }
          documentKeys.add(key);
        }
      }
      // Validar todas las liquidaciones antes de tocar cualquier estado: la importación
      // debe ser todo-o-nada desde la perspectiva de la interfaz.
      const settlements = Array.isArray(data.creditSettlements) ? data.creditSettlements : [];
      const settlementIds = new Set<string>();
      const salesById = new Map<string, any>(data.sales.map((row: any) => [row.id, row]));
      const purchasesById = new Map<string, any>(data.purchases.map((row: any) => [row.id, row]));
      if (settlements.some((s: any) => {
        if (!s || typeof s.id !== 'string' || !s.id.trim() || settlementIds.has(s.id) ||
            !companyIds.has(s.companyId) ||
            !['SALE_COLLECTION', 'PURCHASE_PAYMENT'].includes(s.kind) ||
            !Number.isFinite(s.amountUsd) || s.amountUsd <= 0 ||
            !Number.isFinite(s.amountBs) || s.amountBs <= 0 ||
            !Number.isFinite(s.bcvRate) || s.bcvRate <= 0 ||
            !data.journalEntries.some((j: any) => j.id === s.journalEntryId && j.companyId === s.companyId)) return true;
        settlementIds.add(s.id);
        const source = s.kind === 'SALE_COLLECTION' ? salesById.get(s.documentId) : purchasesById.get(s.documentId);
        return !source || source.companyId !== s.companyId;
      })) throw new Error('El respaldo contiene liquidaciones duplicadas, inválidas o sin factura/asiento contable válido.');
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
      setCreditSettlements(settlements);
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
        storageError,
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
        creditSettlements: creditSettlements.filter(s => s.companyId === currentCompany.id),
        getCreditBalance,
        addCreditSettlement,
        purchases: purchases.filter(p => p.companyId === currentCompany.id),
        addPurchase,
        deletePurchase,
        sales: sales.filter(s => s.companyId === currentCompany.id),
        addSale,
        deleteSale,
        products: products.filter(p => p.companyId === currentCompany.id),
        addProduct,
        importInventoryProducts,
        importInventoryMovements,
        executeProduction,
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
        registerTreasuryMovement,
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
        resetFactoryData,
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
