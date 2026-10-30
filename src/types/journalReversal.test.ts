import test from 'node:test';
import assert from 'node:assert/strict';
import type { Account, JournalEntry, JournalEntryItem, PurchaseRecord, InventoryMovement, InventoryProduct } from './accounting';
import { buildReversalItems, assessJournalReversal, validateBankStatementReversal, validateSaleInventoryReturnReconciliation, validatePurchaseInventoryReconciliation } from './journalReversal';

const accounts: Account[] = [
  { code:'1.1', name:'Banco', type:'ACTIVO', level:2, isMovement:true },
  { code:'2.1', name:'Proveedores', type:'PASIVO', level:2, isMovement:true },
  { code:'3.1', name:'Resultados acumulados', type:'PATRIMONIO', level:2, isMovement:true },
  { code:'4.1', name:'Ingresos', type:'INGRESOS', level:2, isMovement:true },
  { code:'5.1', name:'Costo de ventas', type:'COSTOS', level:2, isMovement:true },
  { code:'1.1.4.01', name:'Inventario', type:'ACTIVO', level:4, isMovement:true },
  { code:'1.1.3.01', name:'IVA crédito fiscal', type:'ACTIVO', level:4, isMovement:true },
  { code:'2.1.1.01', name:'Cuentas por pagar proveedores', type:'PASIVO', level:4, isMovement:true }
];
const source: JournalEntry = {
  id:'j-1', companyId:'c-1', entryNumber:1, date:'2026-08-15', description:'Venta',
  type:'VENTA', bcvRate:100, createdAt:'2026-08-15T12:00:00.000Z',
  items:[
    {accountCode:'1.1',accountName:'Banco',debitBs:10000,creditBs:0,debitUsd:100,creditUsd:0},
    {accountCode:'4.1',accountName:'Ingresos',debitBs:0,creditBs:8000,debitUsd:0,creditUsd:80},
    {accountCode:'5.1',accountName:'Costo de ventas',debitBs:2000,creditBs:0,debitUsd:20,creditUsd:0},
    {accountCode:'2.1',accountName:'Proveedores',debitBs:0,creditBs:4000,debitUsd:0,creditUsd:40}
  ]
};

test('contra-asiento invierte Debe/Haber en Bs y USD sin alterar las cuentas',()=>{
 const lines=buildReversalItems(source,accounts);
 assert.deepEqual(lines.map(x=>x.accountCode),['1.1','4.1','5.1','2.1']);
 assert.equal(lines.reduce((s,x)=>s+x.debitBs,0),12000);
 assert.equal(lines.reduce((s,x)=>s+x.creditBs,0),12000);
 assert.equal(lines[0].creditBs,10000);
 assert.equal(lines[1].debitBs,8000);
 assert.equal(lines[0].creditUsd,100);
});

test('AIA conserva cuentas de balance y reclasifica ingresos/costos a resultados acumulados',()=>{
 const lines=buildReversalItems(source,accounts,true,'3.1');
 assert.equal(lines[0].accountCode,'1.1');
 assert.equal(lines[1].accountCode,'3.1');
 assert.equal(lines[2].accountCode,'3.1');
 assert.equal(lines[3].accountCode,'2.1');
 assert.equal(lines.reduce((s,x)=>s+x.debitBs,0),lines.reduce((s,x)=>s+x.creditBs,0));
 assert.equal(lines.reduce((s,x)=>s+x.debitUsd,0),lines.reduce((s,x)=>s+x.creditUsd,0));
});

test('AIA exige una cuenta de patrimonio de movimiento',()=>{
 assert.throws(()=>buildReversalItems(source,accounts,true,'1.1'),/cuenta de patrimonio/);
});

test('bloquea la reversión si el asiento original está descuadrado en Bs o USD',()=>{
 const unbalanced = { ...source, items: source.items.map((item,index)=>index===0 ? {...item,debitBs:item.debitBs+1} : item) };
 assert.throws(()=>buildReversalItems(unbalanced,accounts),/no cuadra simultáneamente/i);
});

test('bloquea líneas negativas o con Debe y Haber simultáneos',()=>{
 const negative = { ...source, items: source.items.map((item,index)=>index===0 ? {...item,debitBs:-1} : item) };
 assert.throws(()=>buildReversalItems(negative,accounts),/líneas inválidas/i);
 const bothSides = { ...source, items: source.items.map((item,index)=>index===0 ? {...item,creditBs:1} : item) };
 assert.throws(()=>buildReversalItems(bothSides,accounts),/líneas inválidas/i);
});

test('bloquea cuentas que ya no admiten movimientos',()=>{
 const blockedAccounts = accounts.map(account => account.code==='1.1' ? {...account,isMovement:false} : account);
 assert.throws(()=>buildReversalItems(source,blockedAccounts),/no admite movimientos/i);
});

test('rechaza una reversión si el plan ya no contiene la cuenta original',()=>{
 assert.throws(()=>buildReversalItems(source,accounts.filter(a=>a.code!=='4.1')),/No se encuentra la cuenta contable 4.1/);
});


const saleInvoice: JournalEntry = {
  id: 'sale-journal', companyId: 'c-1', entryNumber: 10, date: '2026-10-01',
  description: 'Factura de venta', type: 'VENTA', referenceDoc: 'FAC-100',
  bcvRate: 100, createdAt: '2026-10-01T10:00:00.000Z',
  items: [
    { accountCode: '1.1', accountName: 'Cuentas por cobrar', debitBs: 2000, creditBs: 0, debitUsd: 20, creditUsd: 0 },
    { accountCode: '4.1', accountName: 'Ingresos', debitBs: 0, creditBs: 2000, debitUsd: 0, creditUsd: 20 }
  ]
};
const inventoryProduct = {
  id: 'p-1', companyId: 'c-1', code: 'P-1', name: 'Producto', category: 'General', unit: 'UND',
  minStock: 0, currentStock: 0, avgCostBs: 100, avgCostUsd: 1, lastCostBs: 100, lastCostUsd: 1,
  salesPriceBs: 200, salesPriceUsd: 2, inventoryAccountCode: '1.1.4.01', costOfSalesAccountCode: '5.1.1.01'
};
const originalSaleMovement = {
  id: 'm-sale', companyId: 'c-1', productId: 'p-1', productName: 'Producto', productCode: 'P-1',
  date: '2026-10-01', type: 'SALIDA' as const, concept: 'VENTA', documentRef: 'FAC-100',
  quantity: 2, unitCostBs: 100, unitCostUsd: 1, totalCostBs: 200, totalCostUsd: 2,
  balanceQty: 0, balanceTotalBs: 0, balanceTotalUsd: 0, journalEntryId: 'j-sale-cost'
};
const originalSaleCostEntry: JournalEntry = {
  id: 'j-sale-cost', companyId: 'c-1', entryNumber: 9, date: '2026-10-01',
  description: 'Costo de venta', type: 'INVENTARIO', referenceDoc: 'FAC-100',
  bcvRate: 100, createdAt: '2026-10-01T10:00:00.000Z',
  items: [
    { accountCode: '5.1.1.01', accountName: 'Costo de ventas', debitBs: 200, creditBs: 0, debitUsd: 2, creditUsd: 0 },
    { accountCode: '1.1.4.01', accountName: 'Inventario', debitBs: 0, creditBs: 200, debitUsd: 0, creditUsd: 2 }
  ]
};
const customerReturnMovement = {
  ...originalSaleMovement, id: 'm-return', date: '2026-10-02', type: 'ENTRADA' as const,
  concept: 'DEVOLUCION_CLIENTE', documentRef: 'NC-100', quantity: 2,
  correctionForMovementId: 'm-sale', journalEntryId: 'j-return',
  balanceQty: 2, balanceTotalBs: 200, balanceTotalUsd: 2
};
const customerReturnEntry: JournalEntry = {
  id: 'j-return', companyId: 'c-1', entryNumber: 11, date: '2026-10-02',
  description: 'Devolución de cliente', type: 'INVENTARIO', referenceDoc: 'NC-100',
  bcvRate: 100, createdAt: '2026-10-02T10:00:00.000Z',
  items: [
    { accountCode: '1.1.4.01', accountName: 'Inventario', debitBs: 200, creditBs: 0, debitUsd: 2, creditUsd: 0 },
    { accountCode: '5.1.1.01', accountName: 'Costo de ventas', debitBs: 0, creditBs: 200, debitUsd: 0, creditUsd: 2 }
  ]
};

test('no exige reversión de inventario si la factura no tiene movimientos de Kardex', () => {
  const result = validateSaleInventoryReturnReconciliation({
    companyId: 'c-1', invoiceNumber: '100', source: saleInvoice,
    movements: [], products: [inventoryProduct], journalEntries: [saleInvoice, originalSaleCostEntry]
  });
  assert.equal(result.ready, true);
  assert.equal(result.originalMovementCount, 0);
});

test('bloquea la reversión total de venta cuando la mercancía no ha sido devuelta', () => {
  const result = validateSaleInventoryReturnReconciliation({
    companyId: 'c-1', invoiceNumber: '100', source: saleInvoice,
    movements: [originalSaleMovement], products: [inventoryProduct], journalEntries: [saleInvoice, originalSaleCostEntry]
  });
  assert.equal(result.ready, false);
  assert.match(result.reason || '', /no está devuelta en su totalidad/);
});

test('permite la reversión de venta solo cuando la devolución total y su asiento de costo concilian', () => {
  const result = validateSaleInventoryReturnReconciliation({
    companyId: 'c-1', invoiceNumber: '100', source: saleInvoice,
    movements: [originalSaleMovement, customerReturnMovement],
    products: [inventoryProduct], journalEntries: [saleInvoice, originalSaleCostEntry, customerReturnEntry]
  });
  assert.equal(result.ready, true);
  assert.equal(result.originalMovementCount, 1);
  assert.equal(result.returnedMovementCount, 1);
});

test('bloquea devoluciones parciales y asientos de costo no balanceados', () => {
  const partial = { ...customerReturnMovement, quantity: 1 };
  const partialResult = validateSaleInventoryReturnReconciliation({
    companyId: 'c-1', invoiceNumber: '100', source: saleInvoice,
    movements: [originalSaleMovement, partial], products: [inventoryProduct],
    journalEntries: [saleInvoice, originalSaleCostEntry, customerReturnEntry]
  });
  assert.equal(partialResult.ready, false);
  const unbalancedEntry = {
    ...customerReturnEntry,
    items: customerReturnEntry.items.map((item,index)=>index===1 ? {...item,creditBs:199} : item)
  };
  const unbalancedResult = validateSaleInventoryReturnReconciliation({
    companyId: 'c-1', invoiceNumber: '100', source: saleInvoice,
    movements: [originalSaleMovement, customerReturnMovement], products: [inventoryProduct],
    journalEntries: [saleInvoice, originalSaleCostEntry, unbalancedEntry]
  });
  assert.equal(unbalancedResult.ready, false);
  assert.match(unbalancedResult.reason || '', /no concilia Debe\/Haber/);
});

test('bloquea doble reversión de costo si el asiento original ya contiene inventario/COGS', () => {
  const sourceWithCost: JournalEntry = {
    ...saleInvoice,
    items: [...saleInvoice.items,
      { accountCode: '5.1.1.01', accountName: 'Costo', debitBs: 200, creditBs: 0, debitUsd: 2, creditUsd: 0 },
      { accountCode: '1.1.4.01', accountName: 'Inventario', debitBs: 0, creditBs: 200, debitUsd: 0, creditUsd: 2 }
    ]
  };
  const result = validateSaleInventoryReturnReconciliation({
    companyId: 'c-1', invoiceNumber: '100', source: sourceWithCost,
    movements: [originalSaleMovement, customerReturnMovement],
    products: [inventoryProduct], journalEntries: [sourceWithCost, originalSaleCostEntry, customerReturnEntry]
  });
  assert.equal(result.ready, false);
  assert.match(result.reason || '', /duplicaría el efecto del Kardex/);
});


const bankAccount = {
  id: 'bank-1', companyId: 'c-1', accountCode: '1.1.1.01',
  bankName: 'Banco de prueba', accountNumber: '0001', currency: 'BS' as const,
  initialBalanceBs: 0, initialBalanceUsd: 0
};
const bankSource: JournalEntry = {
  id: 'bank-journal', companyId: 'c-1', entryNumber: 20, date: '2026-10-01',
  description: 'Pago bancario', type: 'MANUAL', bcvRate: 100,
  createdAt: '2026-10-01T10:00:00.000Z',
  items: [
    { accountCode: '6.1', accountName: 'Gastos', debitBs: 1000, creditBs: 0, debitUsd: 10, creditUsd: 0 },
    { accountCode: '1.1.1.01', accountName: 'Banco', debitBs: 0, creditBs: 1000, debitUsd: 0, creditUsd: 10 }
  ]
};
const bankReversalItems: JournalEntryItem[] = [
  { accountCode: '6.1', accountName: 'Gastos', debitBs: 0, creditBs: 1000, debitUsd: 0, creditUsd: 10 },
  { accountCode: '1.1.1.01', accountName: 'Banco', debitBs: 1000, creditBs: 0, debitUsd: 10, creditUsd: 0 }
];
const originalBankStatement = {
  id: 'bank-row-1', companyId: 'c-1', bankAccountId: 'bank-1',
  date: '2026-10-01', reference: 'TRX-001', description: 'Pago',
  type: 'DEBIT' as const, amountBs: 1000, amountUsd: 10, isReconciled: true,
  reconciledWithJournalEntryId: bankSource.id,
  reconciledJournalEntryIds: [bankSource.id]
};
const oppositeBankStatement = {
  ...originalBankStatement, id: 'bank-row-2', date: '2026-10-03',
  reference: 'REV-001', description: 'Reverso del pago', type: 'CREDIT' as const,
  isReconciled: false, reconciledWithJournalEntryId: undefined,
  reconciledJournalEntryIds: undefined
};

test('does not require bank reversal evidence for an entry never reconciled to a statement', () => {
  const result = validateBankStatementReversal({
    companyId: 'c-1', source: bankSource, reversalItems: bankReversalItems,
    bankAccounts: [bankAccount], statementMovements: []
  });
  assert.equal(result.ready, true);
  assert.equal(result.pairs.length, 0);
});

test('blocks a reconciled bank entry when the opposite statement transaction is missing', () => {
  const result = validateBankStatementReversal({
    companyId: 'c-1', source: bankSource, reversalItems: bankReversalItems,
    bankAccounts: [bankAccount], statementMovements: [originalBankStatement]
  });
  assert.equal(result.ready, false);
  assert.match(result.reason || '', /Falta importar el movimiento bancario inverso exacto/);
});

test('accepts only one exact opposite bank statement line and returns its reconciliation pair', () => {
  const result = validateBankStatementReversal({
    companyId: 'c-1', source: bankSource, reversalItems: bankReversalItems,
    bankAccounts: [bankAccount], statementMovements: [originalBankStatement, oppositeBankStatement]
  });
  assert.equal(result.ready, true);
  assert.deepEqual(result.pairs, [{
    originalStatementId: 'bank-row-1', reversalStatementId: 'bank-row-2', bankAccountId: 'bank-1'
  }]);
});

test('blocks ambiguous or wrong-amount bank reversal candidates', () => {
  const ambiguous = validateBankStatementReversal({
    companyId: 'c-1', source: bankSource, reversalItems: bankReversalItems,
    bankAccounts: [bankAccount],
    statementMovements: [originalBankStatement, oppositeBankStatement, { ...oppositeBankStatement, id: 'bank-row-3' }]
  });
  assert.equal(ambiguous.ready, false);
  assert.match(ambiguous.reason || '', /más de un posible/);
  const wrongAmount = validateBankStatementReversal({
    companyId: 'c-1', source: bankSource, reversalItems: bankReversalItems,
    bankAccounts: [bankAccount], statementMovements: [
      originalBankStatement, { ...oppositeBankStatement, amountBs: 900 }
    ]
  });
  assert.equal(wrongAmount.ready, false);
});

test('blocks a bank reversal when the contra-entry does not offset the bank account line', () => {
  const invalidItems = bankReversalItems.map((item,index) =>
    index === 1 ? { ...item, debitBs: 900, debitUsd: 9 } : item
  );
  const result = validateBankStatementReversal({
    companyId: 'c-1', source: bankSource, reversalItems: invalidItems,
    bankAccounts: [bankAccount], statementMovements: [originalBankStatement, oppositeBankStatement]
  });
  assert.equal(result.ready, false);
  assert.match(result.reason || '', /no compensa exactamente/);
});

test('blocks an original statement row that has been reassigned to another journal entry', () => {
  const reassigned = { ...originalBankStatement, reconciledWithJournalEntryId: 'other-entry' };
  const result = validateBankStatementReversal({
    companyId: 'c-1', source: bankSource, reversalItems: bankReversalItems,
    bankAccounts: [bankAccount], statementMovements: [reassigned, oppositeBankStatement]
  });
  assert.equal(result.ready, false);
  assert.match(result.reason || '', /vinculado posteriormente a otro asiento/);
});


const reconciledPurchase = {
  id: 'purchase-200', companyId: 'c-1', opNumber: 1, invoiceDate: '2026-10-10',
  supplierRif: 'J-12345678-9', supplierName: 'Proveedor', invoiceNumber: '200',
  controlNumber: '00-200', documentType: '01' as const,
  totalAmountBs: 232, exemptAmountBs: 0, taxableBaseBs: 200, taxRate: 16,
  vatAmountBs: 32, retentionRate: 0, vatWithheldBs: 0, bcvRate: 100,
  totalAmountUsd: 2.32, taxableBaseUsd: 2, vatAmountUsd: 0.32, vatWithheldUsd: 0,
  journalEntryId: 'purchase-journal',
  inventoryLines: [{ productId: 'p-1', quantity: 2, unitCostBs: 100 }]
} satisfies PurchaseRecord;
const reconciledInventoryProduct: InventoryProduct = {
  id: 'p-1', companyId: 'c-1', code: 'P-1', name: 'Producto',
  category: 'Mercancía', unit: 'UND', minStock: 0, currentStock: 2,
  avgCostBs: 100, avgCostUsd: 1, lastCostBs: 100, lastCostUsd: 1,
  salesPriceBs: 150, salesPriceUsd: 1.5, inventoryAccountCode: '1.1.4.02'
};
const reconciledPurchaseMovement: InventoryMovement = {
  id: 'purchase-movement', companyId: 'c-1', productId: 'p-1',
  productName: 'Producto', productCode: 'P-1', date: '2026-10-10',
  type: 'ENTRADA', concept: 'COMPRA', documentRef: ' FAC - 200 ',
  quantity: 2, unitCostBs: 100, unitCostUsd: 1, totalCostBs: 200, totalCostUsd: 2,
  balanceQty: 2, balanceTotalBs: 200, balanceTotalUsd: 2, bcvRate: 100,
  counterpartyRif: 'J-12345678-9'
};
const reconciledPurchaseJournal: JournalEntry = {
  id: 'purchase-journal', companyId: 'c-1', entryNumber: 30,
  date: '2026-10-10', description: 'Compra 200', type: 'COMPRA',
  referenceDoc: 'FAC-200', bcvRate: 100, createdAt: '2026-10-10T10:00:00.000Z',
  items: [
    { accountCode: '1.1.4.01', accountName: 'Inventario', debitBs: 200, creditBs: 0, debitUsd: 2, creditUsd: 0 },
    { accountCode: '1.1.3.01', accountName: 'IVA', debitBs: 32, creditBs: 0, debitUsd: 0.32, creditUsd: 0 },
    { accountCode: '2.1.1.01', accountName: 'CxP', debitBs: 0, creditBs: 232, debitUsd: 0, creditUsd: 2.32 }
  ]
};

test('certifica compra solo cuando factura, Kardex y asiento coinciden en ambas monedas', () => {
  const result = validatePurchaseInventoryReconciliation({
    companyId: 'c-1', purchase: reconciledPurchase,
    movements: [reconciledPurchaseMovement], journalEntries: [reconciledPurchaseJournal]
  });
  assert.equal(result.ready, true);
  assert.equal(result.lineTotal, 200);
  assert.equal(result.movementTotal, 200);
  assert.equal(result.journalInventoryDebit, 200);
  assert.equal(result.journalInventoryDebitUsd, 2);
});

test('certifica compras cuando cada artículo usa su cuenta auxiliar de inventario configurada', () => {
  const alternateJournal: JournalEntry = {
    ...reconciledPurchaseJournal,
    items: reconciledPurchaseJournal.items.map(item => item.accountCode === '1.1.4.01'
      ? { ...item, accountCode: '1.1.4.02', accountName: 'Inventario materia prima' } : item)
  };
  const result = validatePurchaseInventoryReconciliation({
    companyId: 'c-1', purchase: reconciledPurchase,
    movements: [reconciledPurchaseMovement], journalEntries: [alternateJournal],
    products: [reconciledInventoryProduct]
  });
  assert.equal(result.ready, true);
  assert.equal(result.journalInventoryDebit, 200);
  assert.equal(result.journalInventoryDebitUsd, 2);
});

test('bloquea asientos de compra con cuentas auxiliares adicionales no justificadas', () => {
  const journalWithExtraAccount: JournalEntry = {
    ...reconciledPurchaseJournal,
    items: [...reconciledPurchaseJournal.items,
      { accountCode: '6.1.1.11', accountName: 'IGTF no facturado', debitBs: 1, creditBs: 0, debitUsd: 0.01, creditUsd: 0 }]
  };
  const result = validatePurchaseInventoryReconciliation({
    companyId: 'c-1', purchase: reconciledPurchase,
    movements: [reconciledPurchaseMovement], journalEntries: [journalWithExtraAccount]
  });
  assert.equal(result.ready, false);
  assert.equal(result.journalMatchesInvoice, false);
});

test('bloquea la devolución si el asiento original usa una cuenta distinta a la del artículo', () => {
  const result = validatePurchaseInventoryReconciliation({
    companyId: 'c-1', purchase: reconciledPurchase,
    movements: [reconciledPurchaseMovement], journalEntries: [reconciledPurchaseJournal],
    products: [reconciledInventoryProduct]
  });
  assert.equal(result.ready, false);
  assert.equal(result.journalMatchesInvoice, false);
});

test('bloquea conciliación de compra si proveedor, fecha, BCV o USD del Kardex difieren', () => {
  const variants = [
    { ...reconciledPurchaseMovement, counterpartyRif: 'J-99999999-9' },
    { ...reconciledPurchaseMovement, date: '2026-10-11' },
    { ...reconciledPurchaseMovement, bcvRate: 101 },
    { ...reconciledPurchaseMovement, totalCostUsd: 1.9 }
  ];
  for (const movement of variants) {
    const result = validatePurchaseInventoryReconciliation({
      companyId: 'c-1', purchase: reconciledPurchase,
      movements: [movement], journalEntries: [reconciledPurchaseJournal]
    });
    assert.equal(result.ready, false);
  }
});

test('bloquea conciliación de compra si el asiento no reconoce el inventario en USD', () => {
  const wrongJournal = {
    ...reconciledPurchaseJournal,
    items: reconciledPurchaseJournal.items.map(item => item.accountCode === '1.1.4.01'
      ? { ...item, debitUsd: 1.5 } : item)
  };
  const result = validatePurchaseInventoryReconciliation({
    companyId: 'c-1', purchase: reconciledPurchase,
    movements: [reconciledPurchaseMovement], journalEntries: [wrongJournal]
  });
  assert.equal(result.ready, false);
  assert.equal(result.journalMatchesInvoice, false);
});


test('evaluación genérica permite un asiento sin efectos auxiliares y presenta su impacto balanceado', () => {
  const result = assessJournalReversal({
    companyId: 'c-1', source, accounts, sales: [], purchases: [],
    movements: [], products: [], journalEntries: [source],
    bankAccounts: [], bankStatementMovements: [], creditSettlements: []
  });
  assert.equal(result.ready, true);
  assert.equal(result.documentKind, 'GENERAL');
  assert.equal(result.linkedInventoryMovementCount, 0);
  assert.equal(result.linkedBankMovementCount, 0);
  assert.equal(result.debitBs, result.creditBs);
  assert.equal(result.debitUsd, result.creditUsd);
});

test('evaluación genérica bloquea una compra con líneas de inventario sin conciliación', () => {
  const purchase: PurchaseRecord = {
    id: 'purchase-1', companyId: 'c-1', opNumber: 1, invoiceDate: '2026-10-01',
    supplierRif: 'J-12345678-9', supplierName: 'Proveedor', invoiceNumber: '100',
    controlNumber: '00-100', documentType: '01', totalAmountBs: 200,
    exemptAmountBs: 0, taxableBaseBs: 200, taxRate: 16, vatAmountBs: 32,
    retentionRate: 75, vatWithheldBs: 24, bcvRate: 100,
    totalAmountUsd: 2, taxableBaseUsd: 2, vatAmountUsd: 0.32, vatWithheldUsd: 0.24,
    paymentTerm: 'CREDITO', inventoryLines: [{ productId: 'p-1', quantity: 2, unitCostBs: 100 }]
  };
  const result = assessJournalReversal({
    companyId: 'c-1', source: { ...source, type: 'COMPRA', referenceDoc: 'FAC-100' },
    accounts, sales: [], purchases: [purchase], movements: [], products: [],
    journalEntries: [source], bankAccounts: [], bankStatementMovements: [], creditSettlements: []
  });
  assert.equal(result.ready, false);
  assert.equal(result.documentKind, 'PURCHASE');
  assert.match(result.blockers.join(' '), /conciliación de compra no está aprobada/);
});

test('evaluación genérica detecta una liquidación vigente vinculada a la factura', () => {
  const sale = {
    id: 'sale-1', companyId: 'c-1', opNumber: 1, invoiceDate: '2026-10-01',
    customerRif: 'J-12345678-9', customerName: 'Cliente', invoiceNumber: '100',
    controlNumber: '00-100', documentType: '01', totalAmountBs: 2000,
    exemptAmountBs: 0, taxableBaseBs: 2000, taxRate: 16, vatAmountBs: 0,
    vatWithheldBs: 0, bcvRate: 100, totalAmountUsd: 20, taxableBaseUsd: 20,
    vatAmountUsd: 0, vatWithheldUsd: 0, journalEntryId: source.id
  } as import('./accounting').SaleRecord;
  const result = assessJournalReversal({
    companyId: 'c-1', source, accounts, sales: [sale], purchases: [],
    movements: [], products: [], journalEntries: [source],
    bankAccounts: [], bankStatementMovements: [],
    creditSettlements: [{ companyId: 'c-1', documentId: sale.id, kind: 'SALE_COLLECTION', isReversed: false }]
  });
  assert.equal(result.ready, false);
  assert.equal(result.activeSettlementCount, 1);
  assert.match(result.blockers.join(' '), /cobro\(s\)\/pago\(s\) vigente/);
});


test('la reversión genérica bloquea el asiento propio de una nota de crédito de proveedor', () => {
  const creditNoteJournal: JournalEntry = {
    ...reconciledPurchaseJournal, id: 'supplier-credit-journal',
    entryNumber: 31, type: 'AJUSTE', referenceDoc: 'NC-PROV-NC-200',
    description: 'Nota de crédito proveedor NC-200'
  };
  const creditNote: PurchaseRecord = {
    ...reconciledPurchase, id: 'supplier-credit-note', opNumber: 2,
    invoiceNumber: 'NC-200', documentType: '03',
    originalPurchaseId: reconciledPurchase.id,
    affectedInvoiceNumber: reconciledPurchase.invoiceNumber,
    creditNoteNumber: 'NC-200', inventoryLines: undefined,
    journalEntryId: creditNoteJournal.id
  };
  const result = assessJournalReversal({
    companyId: 'c-1', source: creditNoteJournal, accounts, sales: [],
    purchases: [reconciledPurchase, creditNote], movements: [],
    products: [], journalEntries: [reconciledPurchaseJournal, creditNoteJournal],
    bankAccounts: [], bankStatementMovements: [], creditSettlements: []
  });
  assert.equal(result.ready, false);
  assert.match(result.blockers.join(' '), /nota de crédito de proveedor/);
});

test('la evaluación genérica detecta notas de crédito fiscales relacionadas con la factura original', () => {
  const creditNote: PurchaseRecord = {
    ...reconciledPurchase,
    id: 'purchase-credit-200', opNumber: 2, invoiceNumber: 'NC-200',
    documentType: '03', originalPurchaseId: reconciledPurchase.id,
    affectedInvoiceNumber: reconciledPurchase.invoiceNumber,
    creditNoteNumber: 'NC-200', inventoryLines: undefined
  };
  const result = assessJournalReversal({
    companyId: 'c-1', source: reconciledPurchaseJournal, accounts, sales: [],
    purchases: [reconciledPurchase, creditNote], movements: [reconciledPurchaseMovement],
    products: [], journalEntries: [reconciledPurchaseJournal],
    bankAccounts: [], bankStatementMovements: [], creditSettlements: []
  });
  assert.equal(result.documentKind, 'PURCHASE');
  assert.equal(result.linkedCreditNoteCount, 1);
  assert.equal(result.ready, false);
  assert.match(result.blockers.join(' '), /nota\(s\) de crédito de proveedor vinculada\(s\)/);
});

test('bloquea una compra si el RIF de proveedor falta en factura y Kardex', () => {
  const result = validatePurchaseInventoryReconciliation({
    companyId: 'c-1',
    purchase: { ...reconciledPurchase, supplierRif: '' },
    movements: [{ ...reconciledPurchaseMovement, counterpartyRif: '' }],
    journalEntries: [reconciledPurchaseJournal]
  });
  assert.equal(result.ready, false);
  assert.equal(result.movementMatchesLines, false);
});

test('bloquea una compra si el asiento no concilia IVA o CxP aunque inventario cuadre', () => {
  const wrongPayable = {
    ...reconciledPurchaseJournal,
    items: reconciledPurchaseJournal.items.map(item => item.accountCode === '2.1.1.01'
      ? { ...item, creditBs: 200, creditUsd: 2 } : item)
  };
  const wrongVat = {
    ...reconciledPurchaseJournal,
    items: reconciledPurchaseJournal.items.map(item => item.accountCode === '1.1.3.01'
      ? { ...item, debitBs: 20, debitUsd: 0.2 } : item)
  };
  for (const journal of [wrongPayable, wrongVat]) {
    const result = validatePurchaseInventoryReconciliation({
      companyId: 'c-1', purchase: reconciledPurchase,
      movements: [reconciledPurchaseMovement], journalEntries: [journal]
    });
    assert.equal(result.ready, false);
    assert.equal(result.journalMatchesInvoice, false);
  }
});

test('bloquea una compra con total fiscal incoherente aunque el inventario cuadre', () => {
  const result = validatePurchaseInventoryReconciliation({
    companyId: 'c-1', purchase: { ...reconciledPurchase, totalAmountBs: 200 },
    movements: [reconciledPurchaseMovement], journalEntries: [reconciledPurchaseJournal]
  });
  assert.equal(result.ready, false);
  assert.equal(result.journalMatchesInvoice, false);
});

test('bloquea reversar una compra mientras conserve aplicaciones de anticipo vigentes', () => {
  const purchase = { ...reconciledPurchase, inventoryLines: undefined };
  const settlement = {
    companyId: 'c-1', journalEntryId: 'advance-settlement-journal',
    targetPurchaseId: purchase.id, kind: 'APPLIED_TO_PURCHASE', isReversed: false
  };
  const result = assessJournalReversal({
    companyId: 'c-1', source: reconciledPurchaseJournal, accounts, sales: [],
    purchases: [purchase], movements: [], products: [],
    journalEntries: [reconciledPurchaseJournal], bankAccounts: [],
    bankStatementMovements: [], creditSettlements: [],
    supplierAdvanceSettlements: [settlement]
  });
  assert.equal(result.ready, false);
  assert.equal(result.activeSupplierAdvanceSettlementCount, 1);
  assert.match(result.blockers.join(' '), /aplicación\(es\) de anticipo vigente\(s\)/);
});

test('no bloquea reversar una compra cuando su aplicación de anticipo ya fue reversada', () => {
  const purchase = { ...reconciledPurchase, inventoryLines: undefined };
  const result = assessJournalReversal({
    companyId: 'c-1', source: reconciledPurchaseJournal, accounts, sales: [],
    purchases: [purchase], movements: [], products: [],
    journalEntries: [reconciledPurchaseJournal], bankAccounts: [],
    bankStatementMovements: [], creditSettlements: [],
    supplierAdvanceSettlements: [{
      companyId: 'c-1', journalEntryId: 'advance-settlement-journal',
      targetPurchaseId: purchase.id, kind: 'APPLIED_TO_PURCHASE', isReversed: true
    }]
  });
  assert.equal(result.ready, true);
  assert.equal(result.activeSupplierAdvanceSettlementCount, 0);
});

test('permite evaluar la reversión del propio asiento de liquidación de anticipo', () => {
  const settlementJournal: JournalEntry = {
    ...source, id: 'advance-settlement-journal', type: 'ANTICIPO_PROVEEDOR',
    description: 'Aplicación de anticipo a proveedor'
  };
  const result = assessJournalReversal({
    companyId: 'c-1', source: settlementJournal, accounts, sales: [],
    purchases: [], movements: [], products: [],
    journalEntries: [settlementJournal], bankAccounts: [],
    bankStatementMovements: [], creditSettlements: [],
    supplierAdvanceSettlements: [{
      companyId: 'c-1', journalEntryId: settlementJournal.id,
      targetPurchaseId: reconciledPurchase.id, kind: 'APPLIED_TO_PURCHASE', isReversed: false
    }]
  });
  assert.equal(result.ready, true);
  assert.equal(result.activeSupplierAdvanceSettlementCount, 1);
});

