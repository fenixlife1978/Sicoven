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

interface AccountingContextType {
  companies: Company[];
  isStorageReady: boolean;
  storageError: string | null;
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
const DEMO_LABELS: Record<string, string> = {
  empresa: 'Empresas',
  diario: 'Libro Diario',
  compras: 'Compras',
  ventas: 'Ventas',
  inventario: 'Inventario',
  catalogo: 'Catálogo y plan de cuentas',
  retenciones: 'Retenciones',
  configuracion: 'Configuración',
  conciliacion: 'Conciliación bancaria'
};

// En escritorio, SQLite es la única fuente operativa; localStorage se reserva
// para la vista web de desarrollo y nunca inicializa datos del instalador.
const readBrowserStorage = (key: string): string | null => {
  if (typeof window !== 'undefined' && window.sicovenStore) return null;
  try { return localStorage.getItem(key); } catch { return null; }
};

export const AccountingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
  const [displayCurrency, setDisplayCurrency] = useState<'BS' | 'USD' | 'DUAL'>('DUAL');
  const [demoUsage, setDemoUsage] = useState<Record<string, number>>({});
  const demoUsageRef = useRef<Record<string, number>>({});
  const consumeDemoAction = (moduleKey: string) => {
    if (!IS_DEMO) return;
    const label = DEMO_LABELS[moduleKey] || moduleKey;
    if (window.sicovenStore) {
      const result = window.sicovenStore.consumeDemoAction(moduleKey);
      if (result?.usage && typeof result.usage === 'object') {
        demoUsageRef.current = result.usage;
        setDemoUsage(result.usage);
      }
      if (!result?.ok) {
        const message = result?.used !== undefined
          ? `La demostración agotó el máximo de ${DEMO_LIMIT} acciones en ${label}. Adquiera SICOVEN completo para continuar sin limitaciones.`
          : 'No se pudo registrar la acción demo en SQLite. La operación fue bloqueada para proteger el límite.';
        window.alert(message);
        throw new Error(message);
      }
      return;
    }

    // Respaldo para la vista web de desarrollo: el contador se escribe antes
    // de permitir la mutación y sobrevive a una recarga del navegador.
    let storedUsage: Record<string, number> = {};
    try {
      storedUsage = JSON.parse(localStorage.getItem(`${STORAGE_KEY}_demoUsage`) || '{}');
    } catch {
      storedUsage = {};
    }
    const used = Number(storedUsage[moduleKey] ?? demoUsageRef.current[moduleKey] ?? 0);
    if (used >= DEMO_LIMIT) {
      const message = `La demostración agotó el máximo de ${DEMO_LIMIT} acciones en ${label}. Adquiera SICOVEN completo para continuar sin limitaciones.`;
      window.alert(message);
      throw new Error(message);
    }
    const nextUsage = { ...storedUsage, [moduleKey]: used + 1 };
    try {
      localStorage.setItem(`${STORAGE_KEY}_demoUsage`, JSON.stringify(nextUsage));
    } catch {
      throw new Error('No se pudo guardar el contador de la demo; la operación fue bloqueada.');
    }
    demoUsageRef.current = nextUsage;
    setDemoUsage(nextUsage);
  };

  const currentCompany: Company = companies.find(c => c.id === currentCompanyId) || companies[0] || {
    id: '', rif: '', name: 'Registre una empresa para comenzar', address: '', phone: '', email: '',
    taxpayerType: 'ORDINARIO', defaultIvaRetentionRate: 0, fiscalYear: new Date().getFullYear(), bcvRate: 0
  };

  const updateCompany = (updated: Company) => {
    consumeDemoAction('empresa');
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
    vatVouchers, islrVouchers, bankAccounts, bankStatementMovements, creditSettlements, displayCurrency, autoSyncBcv, bcvSyncResult, demoUsage
  };

  useEffect(() => {
    let cancelled = false;
    let initialized = false;
    const hydrate = async () => {
      try {
        if (window.sicovenStore) {
          let saved = await window.sicovenStore.load();
          if (cancelled) return;
          // Instalaciones que ya guardaron la firma completa de los datos de demostración
          // en la edición completa se limpian una sola vez. No se toca información real:
          // deben coincidir las dos empresas de muestra y los registros semilla conocidos.
          const bundledDemoSignature = !IS_DEMO && saved && typeof saved === 'object'
            && Array.isArray(saved.companies)
            && saved.companies.length === 2
            && saved.companies.some((company: Company) => company.id === 'comp-1' && company.name === 'DISTRIBUIDORA LOS ANDES, C.A.')
            && saved.companies.some((company: Company) => company.id === 'comp-2' && company.name === 'SERVICIOS TECNOLÓGICOS DEL CARIBE, S.A.')
            && Array.isArray(saved.purchases) && saved.purchases.some((item: PurchaseRecord) => item.id === 'pur-1' && item.companyId === 'comp-1')
            && Array.isArray(saved.sales) && saved.sales.some((item: SaleRecord) => item.id === 'sale-1' && item.companyId === 'comp-1')
            && Array.isArray(saved.journalEntries) && saved.journalEntries.some((item: JournalEntry) => item.id === 'entry-apertura-1');
          if (bundledDemoSignature) {
            saved = {
              companies: [], currentCompanyId: '', accounts: DEFAULT_CHART_OF_ACCOUNTS,
              journalEntries: [], purchases: [], sales: [], products: [], movements: [],
              vatVouchers: [], islrVouchers: [], bankAccounts: [], bankStatementMovements: [],
              creditSettlements: [], displayCurrency: 'DUAL', autoSyncBcv: true,
              bcvSyncResult: null, demoUsage: {}
            };
            await window.sicovenStore.save(saved);
          }
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
            if (Array.isArray(saved.creditSettlements)) setCreditSettlements(saved.creditSettlements as CreditSettlement[]);
            if (saved.displayCurrency === 'BS' || saved.displayCurrency === 'USD' || saved.displayCurrency === 'DUAL') setDisplayCurrency(saved.displayCurrency);
            if (typeof saved.autoSyncBcv === 'boolean') setAutoSyncBcv(saved.autoSyncBcv);
            if (saved.bcvSyncResult && typeof saved.bcvSyncResult === 'object') setBcvSyncResult(saved.bcvSyncResult as BcvSyncResult);
            if (saved.demoUsage && typeof saved.demoUsage === 'object') { const usage = saved.demoUsage as Record<string, number>; demoUsageRef.current = usage; setDemoUsage(usage); }
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
          if (IS_DEMO) {
            const usage = window.sicovenStore.getDemoUsage();
            demoUsageRef.current = usage;
            setDemoUsage(usage);
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
  }, [storageReady, companies, currentCompanyId, accounts, journalEntries, purchases, sales, products, movements, vatVouchers, islrVouchers, bankAccounts, bankStatementMovements, creditSettlements, displayCurrency, autoSyncBcv, bcvSyncResult, demoUsage]);

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
    consumeDemoAction('configuracion');
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
    const originalAmountUsd = Math.max(0, Number(document.totalAmountUsd || 0) - withheldUsd);
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
    consumeDemoAction('diario');
    setJournalEntries(prev => prev.filter(e => e.id !== id));
  };

  // Registrar compra y generar asiento automático y comprobantes de retención
  const addPurchase = (purchaseData: Omit<PurchaseRecord, 'id' | 'companyId' | 'opNumber'>): PurchaseRecord => {
    consumeDemoAction('compras');
    if ((purchaseData.vatWithheldBs || 0) > 0 || (purchaseData.islrWithheldBs || 0) > 0) consumeDemoAction('retenciones');
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
    consumeDemoAction('compras');
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
    consumeDemoAction('ventas');
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
    consumeDemoAction('inventario');
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
    consumeDemoAction('retenciones');
    setVatVouchers(prev => prev.filter(v => v.id !== id));
  };

  const deleteIslrVoucher = (id: string) => {
    consumeDemoAction('retenciones');
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
    consumeDemoAction('conciliacion');
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
    consumeDemoAction('conciliacion');
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
    // Restaurar la muestra también es una acción y nunca reinicia los contadores.
    consumeDemoAction('configuracion');
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
      bankStatementMovements,
      creditSettlements
    };
    return JSON.stringify(backup, null, 2);
  };

  const importBackupJson = (jsonData: string): boolean => {
    if (IS_DEMO) {
      window.alert('La importación de respaldos está deshabilitada en SICOVEN DEMO. Adquiera la versión completa para importar sus propios datos.');
      return false;
    }
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
