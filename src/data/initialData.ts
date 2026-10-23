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

import { DEFAULT_LOGO_LOS_ANDES, DEFAULT_LOGO_CARIBE } from './defaultLogos';

export const INITIAL_COMPANIES: Company[] = [
  {
    id: 'comp-1',
    rif: 'J-40892182-3',
    name: 'DISTRIBUIDORA LOS ANDES, C.A.',
    tradeName: 'Los Andes Mayoristas',
    address: 'Av. Francisco de Miranda, Edificio Centro Seguros La Paz, Piso 5, Ofic. 502, Caracas, Dtto. Capital',
    phone: '(0212) 208-4450',
    email: 'administracion@losandesdist.com.ve',
    taxpayerType: 'ESPECIAL', // Contribuyente Especial SENIAT
    defaultIvaRetentionRate: 75,
    fiscalYear: 2026,
    bcvRate: 68.50,
    lastRateUpdate: '2026-10-19',
    logoUrl: DEFAULT_LOGO_LOS_ANDES
  },
  {
    id: 'comp-2',
    rif: 'J-50123849-1',
    name: 'SERVICIOS TECNOLÓGICOS DEL CARIBE, S.A.',
    tradeName: 'Caribe Tech Solutions',
    address: 'Av. Bolívar Norte, Torre Ejecutiva Valencia, Piso 8, Ofic. 8B, Valencia, Edo. Carabobo',
    phone: '(0241) 825-9910',
    email: 'contacto@caribetech.com.ve',
    taxpayerType: 'ORDINARIO', // Contribuyente Ordinario
    defaultIvaRetentionRate: 0,
    fiscalYear: 2026,
    bcvRate: 68.50,
    lastRateUpdate: '2026-10-19',
    logoUrl: DEFAULT_LOGO_CARIBE
  }
];

export const INITIAL_PURCHASES: PurchaseRecord[] = [
  {
    id: 'pur-1',
    companyId: 'comp-1',
    opNumber: 1,
    invoiceDate: '2026-10-05',
    supplierRif: 'J-30491823-1',
    supplierName: 'INVERSIONES INDUSTRIALES DE VENEZUELA, C.A.',
    supplierAddress: 'Zona Industrial San Vicente I, Galpón 14, Maracay, Edo. Aragua',
    invoiceNumber: '00034821',
    controlNumber: '00-009182',
    documentType: '01',
    totalAmountBs: 139200.00,
    exemptAmountBs: 0,
    taxableBaseBs: 120000.00,
    taxRate: 16,
    vatAmountBs: 19200.00,
    retentionRate: 75,
    vatWithheldBs: 14400.00, // 75% de 19.200
    islrConceptCode: '011',
    islrConceptName: 'Adquisición de bienes muebles por Contribuyentes Especiales (2%)',
    islrRate: 2,
    islrSubtrahendBs: 0,
    islrWithheldBs: 2400.00,
    bcvRate: 68.50,
    totalAmountUsd: 2032.12,
    taxableBaseUsd: 1751.82,
    vatAmountUsd: 280.29,
    vatWithheldUsd: 210.22,
    islrWithheldUsd: 35.04,
    voucherNumber: '20261000000001',
    journalEntryId: 'entry-pur-1',
    notes: 'Compra de inventario de mercancía nacional al mayor'
  },
  {
    id: 'pur-2',
    companyId: 'comp-1',
    opNumber: 2,
    invoiceDate: '2026-10-10',
    supplierRif: 'J-29837192-8',
    supplierName: 'ASESORÍAS Y SERVICIOS CONTABLES Y LEGALES, S.C.',
    supplierAddress: 'Av. Casanova, Torre Banco Plaza, Piso 12, Sabana Grande, Caracas',
    invoiceNumber: '00001289',
    controlNumber: '00-000412',
    documentType: '01',
    totalAmountBs: 23200.00,
    exemptAmountBs: 0,
    taxableBaseBs: 20000.00,
    taxRate: 16,
    vatAmountBs: 3200.00,
    retentionRate: 75,
    vatWithheldBs: 2400.00,
    islrConceptCode: '002',
    islrConceptName: 'Honorarios profesionales pagados a Personas Jurídicas Domiciliadas (5%)',
    islrRate: 5,
    islrSubtrahendBs: 0,
    islrWithheldBs: 1000.00,
    bcvRate: 68.50,
    totalAmountUsd: 338.69,
    taxableBaseUsd: 291.97,
    vatAmountUsd: 46.72,
    vatWithheldUsd: 35.04,
    islrWithheldUsd: 14.60,
    voucherNumber: '20261000000002',
    journalEntryId: 'entry-pur-2',
    notes: 'Servicios de auditoría y revisión fiscal VEN-NIF'
  },
  {
    id: 'pur-3',
    companyId: 'comp-2',
    opNumber: 1,
    invoiceDate: '2026-10-08',
    supplierRif: 'J-40192834-0',
    supplierName: 'DISTRIBUIDORA DE EQUIPOS TECNOLÓGICOS, C.A.',
    supplierAddress: 'Av. Las Delicias, Centro Empresarial Europa, Maracay',
    invoiceNumber: '00005520',
    controlNumber: '00-001280',
    documentType: '01',
    totalAmountBs: 69600.00,
    exemptAmountBs: 0,
    taxableBaseBs: 60000.00,
    taxRate: 16,
    vatAmountBs: 9600.00,
    retentionRate: 0, // Empresa ordinaria no retiene IVA salvo que sea designada
    vatWithheldBs: 0,
    islrConceptCode: '012',
    islrConceptName: 'Servicios en general prestados por PJ (5%)',
    islrRate: 5,
    islrSubtrahendBs: 0,
    islrWithheldBs: 3000.00,
    bcvRate: 68.50,
    totalAmountUsd: 1016.06,
    taxableBaseUsd: 875.91,
    vatAmountUsd: 140.15,
    vatWithheldUsd: 0,
    islrWithheldUsd: 43.80,
    journalEntryId: 'entry-pur-3',
    notes: 'Compra de componentes y servidores'
  }
];

export const INITIAL_SALES: SaleRecord[] = [
  {
    id: 'sale-1',
    companyId: 'comp-1',
    opNumber: 1,
    invoiceDate: '2026-10-12',
    customerRif: 'J-31482910-5',
    customerName: 'AUTOMERCADOS GRAN CARACAS, C.A.',
    customerAddress: 'Av. Rómulo Gallegos, Edif. Central, Caracas',
    invoiceNumber: '00008401',
    controlNumber: '00-001101',
    documentType: '01',
    totalAmountBs: 208800.00,
    exemptAmountBs: 0,
    taxableBaseBs: 180000.00,
    taxRate: 16,
    vatAmountBs: 28800.00,
    vatWithheldBs: 21600.00, // Cliente Especial le retuvo el 75%
    retentionRate: 75,
    retentionVoucherNumber: '20261000005412',
    bcvRate: 68.50,
    totalAmountUsd: 3048.18,
    taxableBaseUsd: 2627.74,
    vatAmountUsd: 420.44,
    vatWithheldUsd: 315.33,
    journalEntryId: 'entry-sale-1',
    notes: 'Venta de mercancías al mayor con factura fiscal'
  },
  {
    id: 'sale-2',
    companyId: 'comp-1',
    opNumber: 2,
    invoiceDate: '2026-10-15',
    customerRif: 'V-18492019-2',
    customerName: 'CARLOS ENRIQUE MÉNDEZ (BODEGA LA POPULAR)',
    customerAddress: 'Calle Real de Petare, Local 14, Caracas',
    invoiceNumber: '00008402',
    controlNumber: '00-001102',
    documentType: '01',
    totalAmountBs: 58000.00,
    exemptAmountBs: 0,
    taxableBaseBs: 50000.00,
    taxRate: 16,
    vatAmountBs: 8000.00,
    vatWithheldBs: 0, // No es contribuyente especial
    bcvRate: 68.50,
    totalAmountUsd: 846.72,
    taxableBaseUsd: 729.93,
    vatAmountUsd: 116.79,
    vatWithheldUsd: 0,
    journalEntryId: 'entry-sale-2',
    notes: 'Venta a cliente persona natural contribuyente ordinario'
  },
  {
    id: 'sale-3',
    companyId: 'comp-2',
    opNumber: 1,
    invoiceDate: '2026-10-14',
    customerRif: 'J-40918231-9',
    customerName: 'CORPORACIÓN VENEZOLANA DE ALIMENTOS, S.A.',
    customerAddress: 'Av. Bolívar, Valencia',
    invoiceNumber: '00001050',
    controlNumber: '00-000300',
    documentType: '01',
    totalAmountBs: 116000.00,
    exemptAmountBs: 0,
    taxableBaseBs: 100000.00,
    taxRate: 16,
    vatAmountBs: 16000.00,
    vatWithheldBs: 12000.00,
    retentionRate: 75,
    retentionVoucherNumber: '20261000001890',
    bcvRate: 68.50,
    totalAmountUsd: 1693.43,
    taxableBaseUsd: 1459.85,
    vatAmountUsd: 233.58,
    vatWithheldUsd: 175.18,
    journalEntryId: 'entry-sale-3',
    notes: 'Servicio de desarrollo e implementación tecnológica'
  }
];

export const INITIAL_JOURNAL_ENTRIES: JournalEntry[] = [
  // Asiento de Apertura comp-1
  {
    id: 'entry-apertura-1',
    companyId: 'comp-1',
    entryNumber: 1,
    date: '2026-10-01',
    description: 'Asiento de Apertura del Ejercicio Económico 2026 (VEN-NIF)',
    type: 'APERTURA',
    bcvRate: 68.50,
    createdAt: '2026-10-01T08:00:00Z',
    items: [
      {
        accountCode: '1.1.1.03',
        accountName: 'Banco Nacional de Crédito - Cta. Corriente Bs.',
        debitBs: 350000.00,
        creditBs: 0,
        debitUsd: 5109.49,
        creditUsd: 0,
        description: 'Disponibilidad inicial en cuentas bancarias nacionales'
      },
      {
        accountCode: '1.1.1.05',
        accountName: 'Banco Mercantil - Cta. Moneda Extranjera ($)',
        debitBs: 274000.00,
        creditBs: 0,
        debitUsd: 4000.00,
        creditUsd: 0,
        description: 'Saldo en divisa USD a tasa oficial BCV'
      },
      {
        accountCode: '1.1.4.01',
        accountName: 'Inventario de Mercancías para la Venta',
        debitBs: 450000.00,
        creditBs: 0,
        debitUsd: 6569.34,
        creditUsd: 0,
        description: 'Inventario inicial valorado según NIC 2 / VEN-NIF'
      },
      {
        accountCode: '1.2.1.01',
        accountName: 'Mobiliario y Equipos de Oficina',
        debitBs: 80000.00,
        creditBs: 0,
        debitUsd: 1167.88,
        creditUsd: 0,
        description: 'Activos fijos operativos'
      },
      {
        accountCode: '1.2.1.05',
        accountName: '(-) Depreciación Acumulada Mobiliario',
        debitBs: 0,
        creditBs: 16000.00,
        debitUsd: 0,
        creditUsd: 233.58,
        description: 'Depreciación acumulada histórica'
      },
      {
        accountCode: '2.1.1.01',
        accountName: 'Cuentas por Pagar Proveedores Nacionales',
        debitBs: 0,
        creditBs: 138000.00,
        debitUsd: 0,
        creditUsd: 2014.60,
        description: 'Obligaciones comerciales pendientes'
      },
      {
        accountCode: '3.1.1.01',
        accountName: 'Capital Social Suscrito y Pagado',
        debitBs: 0,
        creditBs: 600000.00,
        debitUsd: 0,
        creditUsd: 8759.12,
        description: 'Aporte de los socios según Acta Constitutiva'
      },
      {
        accountCode: '3.3.1.01',
        accountName: 'Utilidades No Distribuidas de Ejercicios Anteriores',
        debitBs: 0,
        creditBs: 400000.00,
        debitUsd: 0,
        creditUsd: 5839.42,
        description: 'Resultados acumulados de períodos anteriores'
      }
    ]
  },

  // Asiento Compra comp-1
  {
    id: 'entry-pur-1',
    companyId: 'comp-1',
    entryNumber: 2,
    date: '2026-10-05',
    description: 'Registro de Factura de Compra N° 00034821 - Inversiones Industriales de Venezuela, C.A.',
    type: 'COMPRA',
    bcvRate: 68.50,
    referenceDoc: 'FAC-00034821',
    createdAt: '2026-10-05T10:30:00Z',
    items: [
      {
        accountCode: '1.1.4.01',
        accountName: 'Inventario de Mercancías para la Venta',
        debitBs: 120000.00,
        creditBs: 0,
        debitUsd: 1751.82,
        creditUsd: 0,
        description: 'Entrada de mercancías al costo de adquisición'
      },
      {
        accountCode: '1.1.3.01',
        accountName: 'Crédito Fiscal IVA Compras (Alícuota General 16%)',
        debitBs: 19200.00,
        creditBs: 0,
        debitUsd: 280.29,
        creditUsd: 0,
        description: 'IVA 16% soportado en compras'
      },
      {
        accountCode: '2.1.2.03',
        accountName: 'Retenciones de IVA por Enterar (Agente Especial)',
        debitBs: 0,
        creditBs: 14400.00,
        debitUsd: 0,
        creditUsd: 210.22,
        description: 'Retención de IVA 75% efectuada al proveedor'
      },
      {
        accountCode: '2.1.2.04',
        accountName: 'Retenciones de ISLR por Enterar (Decreto 1808)',
        debitBs: 0,
        creditBs: 2400.00,
        debitUsd: 0,
        creditUsd: 35.04,
        description: 'Retención ISLR 2% bienes adquiridos'
      },
      {
        accountCode: '2.1.1.01',
        accountName: 'Cuentas por Pagar Proveedores Nacionales',
        debitBs: 0,
        creditBs: 122400.00,
        debitUsd: 0,
        creditUsd: 1786.86,
        description: 'Neto a pagar al proveedor deducidas retenciones'
      }
    ]
  },

  // Asiento Honorarios comp-1
  {
    id: 'entry-pur-2',
    companyId: 'comp-1',
    entryNumber: 3,
    date: '2026-10-10',
    description: 'Registro de Factura N° 00001289 - Honorarios Profesionales de Auditoría',
    type: 'COMPRA',
    bcvRate: 68.50,
    referenceDoc: 'FAC-00001289',
    createdAt: '2026-10-10T14:15:00Z',
    items: [
      {
        accountCode: '6.1.1.04',
        accountName: 'Honorarios Profesionales (Contables, Legales, Asesoría)',
        debitBs: 20000.00,
        creditBs: 0,
        debitUsd: 291.97,
        creditUsd: 0,
        description: 'Auditoría fiscal y contable'
      },
      {
        accountCode: '1.1.3.01',
        accountName: 'Crédito Fiscal IVA Compras (Alícuota General 16%)',
        debitBs: 3200.00,
        creditBs: 0,
        debitUsd: 46.72,
        creditUsd: 0,
        description: 'IVA 16% sobre honorarios'
      },
      {
        accountCode: '2.1.2.03',
        accountName: 'Retenciones de IVA por Enterar (Agente Especial)',
        debitBs: 0,
        creditBs: 2400.00,
        debitUsd: 0,
        creditUsd: 35.04,
        description: 'Retención de IVA 75% efectuada'
      },
      {
        accountCode: '2.1.2.04',
        accountName: 'Retenciones de ISLR por Enterar (Decreto 1808)',
        debitBs: 0,
        creditBs: 1000.00,
        debitUsd: 0,
        creditUsd: 14.60,
        description: 'Retención de ISLR 5% PJ Honorarios'
      },
      {
        accountCode: '2.1.1.01',
        accountName: 'Cuentas por Pagar Proveedores Nacionales',
        debitBs: 0,
        creditBs: 19800.00,
        debitUsd: 0,
        creditUsd: 289.05,
        description: 'Saldo neto por pagar honorarios'
      }
    ]
  },

  // Asiento Venta comp-1
  {
    id: 'entry-sale-1',
    companyId: 'comp-1',
    entryNumber: 4,
    date: '2026-10-12',
    description: 'Factura de Venta N° 00008401 a Automercados Gran Caracas, C.A.',
    type: 'VENTA',
    bcvRate: 68.50,
    referenceDoc: 'FAC-00008401',
    createdAt: '2026-10-12T11:00:00Z',
    items: [
      {
        accountCode: '1.1.2.01',
        accountName: 'Cuentas por Cobrar Clientes Comerciales',
        debitBs: 187200.00,
        creditBs: 0,
        debitUsd: 2732.85,
        creditUsd: 0,
        description: 'Neto a cobrar deducida la retención de IVA'
      },
      {
        accountCode: '1.1.3.03',
        accountName: 'Retenciones de IVA Acumuladas por Descontar',
        debitBs: 21600.00,
        creditBs: 0,
        debitUsd: 315.33,
        creditUsd: 0,
        description: 'Comprobante de Retención IVA 75% recibido de cliente especial'
      },
      {
        accountCode: '4.1.1.01',
        accountName: 'Ventas de Mercancías (Alícuota General 16%)',
        debitBs: 0,
        creditBs: 180000.00,
        debitUsd: 0,
        creditUsd: 2627.74,
        description: 'Ingreso operacional por ventas'
      },
      {
        accountCode: '2.1.2.01',
        accountName: 'Débito Fiscal IVA Ventas (Alícuota General 16%)',
        debitBs: 0,
        creditBs: 28800.00,
        debitUsd: 0,
        creditUsd: 420.44,
        description: 'IVA 16% generado en ventas'
      }
    ]
  },

  // Asiento de Costo de Ventas comp-1
  {
    id: 'entry-costo-1',
    companyId: 'comp-1',
    entryNumber: 5,
    date: '2026-10-12',
    description: 'Costo de Ventas por Despacho de Factura N° 00008401',
    type: 'INVENTARIO',
    bcvRate: 68.50,
    referenceDoc: 'FAC-00008401',
    createdAt: '2026-10-12T11:15:00Z',
    items: [
      {
        accountCode: '5.1.1.01',
        accountName: 'Costo de Ventas de Mercancías',
        debitBs: 98000.00,
        creditBs: 0,
        debitUsd: 1430.66,
        creditUsd: 0,
        description: 'Costo promedio ponderado de la mercancía vendida'
      },
      {
        accountCode: '1.1.4.01',
        accountName: 'Inventario de Mercancías para la Venta',
        debitBs: 0,
        creditBs: 98000.00,
        debitUsd: 0,
        creditUsd: 1430.66,
        description: 'Salida de inventario valorado al costo'
      }
    ]
  },

  // Asiento de Ajuste por Depreciación comp-1
  {
    id: 'entry-ajuste-1',
    companyId: 'comp-1',
    entryNumber: 6,
    date: '2026-10-18',
    description: 'Ajuste Contable Mensual por Depreciación de Mobiliario y Equipos (VEN-NIF NIC 16)',
    type: 'AJUSTE',
    bcvRate: 68.50,
    isAdjusted: true,
    createdAt: '2026-10-18T16:00:00Z',
    items: [
      {
        accountCode: '6.1.1.06',
        accountName: 'Gasto de Depreciación de Propiedades, Planta y Equipos',
        debitBs: 1333.33,
        creditBs: 0,
        debitUsd: 19.46,
        creditUsd: 0,
        description: 'Cuota mensual de depreciación lineal'
      },
      {
        accountCode: '1.2.1.05',
        accountName: '(-) Depreciación Acumulada Mobiliario',
        debitBs: 0,
        creditBs: 1333.33,
        debitUsd: 0,
        creditUsd: 19.46,
        description: 'Depreciación acumulada Mobiliario'
      }
    ]
  }
];

export const INITIAL_INVENTORY_PRODUCTS: InventoryProduct[] = [
  {
    id: 'prod-1',
    companyId: 'comp-1',
    code: 'ART-001',
    name: 'Aceite de Oliva Extra Virgen 1L',
    category: 'Alimentos y Víveres',
    unit: 'Caja x 12',
    minStock: 20,
    currentStock: 85,
    avgCostBs: 1850.00,
    avgCostUsd: 27.01,
    lastCostBs: 1920.00,
    lastCostUsd: 28.03,
    salesPriceBs: 2750.00,
    salesPriceUsd: 40.15
  },
  {
    id: 'prod-2',
    companyId: 'comp-1',
    code: 'ART-002',
    name: 'Harina de Trigo Panadera Todo Uso 50Kg',
    category: 'Materia Prima',
    unit: 'Saco',
    minStock: 50,
    currentStock: 140,
    avgCostBs: 2400.00,
    avgCostUsd: 35.04,
    lastCostBs: 2450.00,
    lastCostUsd: 35.77,
    salesPriceBs: 3500.00,
    salesPriceUsd: 51.09
  },
  {
    id: 'prod-3',
    companyId: 'comp-1',
    code: 'ART-003',
    name: 'Café Grano Tostado Premium 1Kg',
    category: 'Bebidas e Infusiones',
    unit: 'Bulto x 10',
    minStock: 30,
    currentStock: 60,
    avgCostBs: 1200.00,
    avgCostUsd: 17.52,
    lastCostBs: 1250.00,
    lastCostUsd: 18.25,
    salesPriceBs: 1850.00,
    salesPriceUsd: 27.01
  },
  {
    id: 'prod-4',
    companyId: 'comp-2',
    code: 'SRV-001',
    name: 'Licencia Software Cloud Enterprise Anual',
    category: 'Software y Licencias',
    unit: 'Suscripción',
    minStock: 5,
    currentStock: 25,
    avgCostBs: 8500.00,
    avgCostUsd: 124.09,
    lastCostBs: 8500.00,
    lastCostUsd: 124.09,
    salesPriceBs: 14500.00,
    salesPriceUsd: 211.68
  }
];

export const INITIAL_INVENTORY_MOVEMENTS: InventoryMovement[] = [
  {
    id: 'mov-1',
    companyId: 'comp-1',
    productId: 'prod-1',
    productName: 'Aceite de Oliva Extra Virgen 1L',
    productCode: 'ART-001',
    date: '2026-10-01',
    type: 'ENTRADA',
    concept: 'INVENTARIO_INICIAL',
    documentRef: 'INV-INI-2026',
    quantity: 65,
    unitCostBs: 1800.00,
    unitCostUsd: 26.28,
    totalCostBs: 117000.00,
    totalCostUsd: 1708.03,
    balanceQty: 65,
    balanceTotalBs: 117000.00,
    balanceTotalUsd: 1708.03
  },
  {
    id: 'mov-2',
    companyId: 'comp-1',
    productId: 'prod-1',
    productName: 'Aceite de Oliva Extra Virgen 1L',
    productCode: 'ART-001',
    date: '2026-10-05',
    type: 'ENTRADA',
    concept: 'COMPRA',
    documentRef: 'FAC-00034821',
    quantity: 40,
    unitCostBs: 1920.00,
    unitCostUsd: 28.03,
    totalCostBs: 76800.00,
    totalCostUsd: 1121.17,
    balanceQty: 105,
    balanceTotalBs: 193800.00,
    balanceTotalUsd: 2829.20,
    journalEntryId: 'entry-pur-1'
  },
  {
    id: 'mov-3',
    companyId: 'comp-1',
    productId: 'prod-1',
    productName: 'Aceite de Oliva Extra Virgen 1L',
    productCode: 'ART-001',
    date: '2026-10-12',
    type: 'SALIDA',
    concept: 'VENTA',
    documentRef: 'FAC-00008401',
    quantity: 20,
    unitCostBs: 1845.71,
    unitCostUsd: 26.94,
    totalCostBs: 36914.20,
    totalCostUsd: 538.89,
    balanceQty: 85,
    balanceTotalBs: 156885.80,
    balanceTotalUsd: 2290.30,
    journalEntryId: 'entry-costo-1'
  }
];

export const INITIAL_VAT_VOUCHERS: VatRetentionVoucher[] = [
  {
    id: 'vat-vouch-1',
    companyId: 'comp-1',
    voucherNumber: '20261000000001',
    date: '2026-10-05',
    period: '202610',
    supplierRif: 'J-30491823-1',
    supplierName: 'INVERSIONES INDUSTRIALES DE VENEZUELA, C.A.',
    supplierAddress: 'Zona Industrial San Vicente I, Galpón 14, Maracay, Edo. Aragua',
    purchaseRecordId: 'pur-1',
    invoiceDate: '2026-10-05',
    invoiceNumber: '00034821',
    controlNumber: '00-009182',
    totalAmountBs: 139200.00,
    exemptAmountBs: 0,
    taxableBaseBs: 120000.00,
    taxRate: 16,
    vatAmountBs: 19200.00,
    retentionRate: 75,
    vatWithheldBs: 14400.00,
    bcvRate: 68.50,
    totalAmountUsd: 2032.12,
    vatWithheldUsd: 210.22
  },
  {
    id: 'vat-vouch-2',
    companyId: 'comp-1',
    voucherNumber: '20261000000002',
    date: '2026-10-10',
    period: '202610',
    supplierRif: 'J-29837192-8',
    supplierName: 'ASESORÍAS Y SERVICIOS CONTABLES Y LEGALES, S.C.',
    supplierAddress: 'Av. Casanova, Torre Banco Plaza, Piso 12, Sabana Grande, Caracas',
    purchaseRecordId: 'pur-2',
    invoiceDate: '2026-10-10',
    invoiceNumber: '00001289',
    controlNumber: '00-000412',
    totalAmountBs: 23200.00,
    exemptAmountBs: 0,
    taxableBaseBs: 20000.00,
    taxRate: 16,
    vatAmountBs: 3200.00,
    retentionRate: 75,
    vatWithheldBs: 2400.00,
    bcvRate: 68.50,
    totalAmountUsd: 338.69,
    vatWithheldUsd: 35.04
  }
];

export const INITIAL_ISLR_VOUCHERS: IslrRetentionVoucher[] = [
  {
    id: 'islr-vouch-1',
    companyId: 'comp-1',
    voucherNumber: 'ISLR-2026-000001',
    date: '2026-10-05',
    period: '202610',
    supplierRif: 'J-30491823-1',
    supplierName: 'INVERSIONES INDUSTRIALES DE VENEZUELA, C.A.',
    supplierAddress: 'Zona Industrial San Vicente I, Galpón 14, Maracay, Edo. Aragua',
    isPersonNatural: false,
    isResident: true,
    conceptCode: '011',
    conceptDescription: 'Adquisición de bienes muebles por Contribuyentes Especiales (Art. 9 Num. 22)',
    invoiceNumber: '00034821',
    controlNumber: '00-009182',
    invoiceDate: '2026-10-05',
    baseAmountBs: 120000.00,
    retentionRate: 2,
    subtrahendBs: 0,
    withheldAmountBs: 2400.00,
    bcvRate: 68.50,
    baseAmountUsd: 1751.82,
    withheldAmountUsd: 35.04
  },
  {
    id: 'islr-vouch-2',
    companyId: 'comp-1',
    voucherNumber: 'ISLR-2026-000002',
    date: '2026-10-10',
    period: '202610',
    supplierRif: 'J-29837192-8',
    supplierName: 'ASESORÍAS Y SERVICIOS CONTABLES Y LEGALES, S.C.',
    supplierAddress: 'Av. Casanova, Torre Banco Plaza, Piso 12, Sabana Grande, Caracas',
    isPersonNatural: false,
    isResident: true,
    conceptCode: '002',
    conceptDescription: 'Honorarios profesionales pagados a Personas Jurídicas Domiciliadas (Art. 9 Num. 1)',
    invoiceNumber: '00001289',
    controlNumber: '00-000412',
    invoiceDate: '2026-10-10',
    baseAmountBs: 20000.00,
    retentionRate: 5,
    subtrahendBs: 0,
    withheldAmountBs: 1000.00,
    bcvRate: 68.50,
    baseAmountUsd: 291.97,
    withheldAmountUsd: 14.60
  }
];

export const INITIAL_BANK_ACCOUNTS: BankAccount[] = [
  {
    id: 'bank-acc-1',
    companyId: 'comp-1',
    accountCode: '1.1.1.03',
    bankName: 'Banco Nacional de Crédito (BNC) - Cta. Corriente',
    accountNumber: '0191-0001-22-1234567890',
    currency: 'BS',
    initialBalanceBs: 350000.00,
    initialBalanceUsd: 5109.49
  },
  {
    id: 'bank-acc-2',
    companyId: 'comp-1',
    accountCode: '1.1.1.04',
    bankName: 'Banesco Banco Universal - Cta. Corriente',
    accountNumber: '0134-0010-55-9876543210',
    currency: 'BS',
    initialBalanceBs: 0,
    initialBalanceUsd: 0
  },
  {
    id: 'bank-acc-3',
    companyId: 'comp-1',
    accountCode: '1.1.1.05',
    bankName: 'Banco Mercantil - Cta. Moneda Extranjera ($)',
    accountNumber: '0105-0045-88-5544332211',
    currency: 'USD',
    initialBalanceBs: 274000.00,
    initialBalanceUsd: 4000.00
  },
  {
    id: 'bank-acc-4',
    companyId: 'comp-2',
    accountCode: '1.1.1.03',
    bankName: 'Banco Nacional de Crédito (BNC) - Valencia',
    accountNumber: '0191-0088-33-4455667788',
    currency: 'BS',
    initialBalanceBs: 150000.00,
    initialBalanceUsd: 2189.78
  }
];

export const INITIAL_STATEMENT_MOVEMENTS: BankStatementMovement[] = [
  {
    id: 'stmt-1',
    companyId: 'comp-1',
    bankAccountId: 'bank-acc-1',
    date: '2026-10-01',
    reference: 'SALDO-INI',
    description: 'Saldo inicial según extracto bancario BNC al 01/10/2026',
    type: 'CREDIT',
    amountBs: 350000.00,
    amountUsd: 5109.49,
    isReconciled: true,
    reconciledWithJournalEntryId: 'entry-apertura-1',
    matchedBy: 'AUTO_REF',
    reconciledAt: '2026-10-01T08:00:00Z',
    notes: 'Apertura conciliada con libros'
  },
  {
    id: 'stmt-2',
    companyId: 'comp-1',
    bankAccountId: 'bank-acc-1',
    date: '2026-10-12',
    reference: '00008401',
    description: 'Depósito / Transferencia Recibida de Automercados Gran Caracas C.A.',
    type: 'CREDIT',
    amountBs: 187200.00,
    amountUsd: 2732.85,
    isReconciled: false,
    notes: 'Cobro de Factura 00008401'
  },
  {
    id: 'stmt-3',
    companyId: 'comp-1',
    bankAccountId: 'bank-acc-1',
    date: '2026-10-06',
    reference: '00034821',
    description: 'Transferencia Enviada a Inversiones Industriales C.A.',
    type: 'DEBIT',
    amountBs: 122400.00,
    amountUsd: 1786.86,
    isReconciled: false,
    notes: 'Pago de compra de inventario'
  },
  {
    id: 'stmt-4',
    companyId: 'comp-1',
    bankAccountId: 'bank-acc-1',
    date: '2026-10-15',
    reference: 'ND-089124',
    description: 'Nota de Débito BNC: Comisión Mantenimiento de Cuenta',
    type: 'DEBIT',
    amountBs: 350.00,
    amountUsd: 5.11,
    isReconciled: false,
    notes: 'Gasto bancario pendiente de registrar en libros'
  },
  {
    id: 'stmt-5',
    companyId: 'comp-1',
    bankAccountId: 'bank-acc-1',
    date: '2026-10-15',
    reference: 'ND-089125',
    description: 'Nota de Débito BNC: Comisión por Transferencias Interbancarias',
    type: 'DEBIT',
    amountBs: 120.00,
    amountUsd: 1.75,
    isReconciled: false,
    notes: 'Comisión bancaria por registrar'
  },
  {
    id: 'stmt-6',
    companyId: 'comp-1',
    bankAccountId: 'bank-acc-1',
    date: '2026-10-16',
    reference: 'NC-044012',
    description: 'Nota de Crédito BNC: Intereses Ganados del Período',
    type: 'CREDIT',
    amountBs: 45.00,
    amountUsd: 0.66,
    isReconciled: false,
    notes: 'Ingreso financiero pendiente de registrar en libros'
  }
];

