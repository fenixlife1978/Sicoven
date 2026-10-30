import test from 'node:test';
import assert from 'node:assert/strict';
import type { Account, JournalEntry, JournalEntryItem } from './accounting';
import { buildReversalItems, validateBankStatementReversal, validateSaleInventoryReturnReconciliation } from './journalReversal';

const accounts: Account[] = [
  { code:'1.1', name:'Banco', type:'ACTIVO', level:2, isMovement:true },
  { code:'2.1', name:'Proveedores', type:'PASIVO', level:2, isMovement:true },
  { code:'3.1', name:'Resultados acumulados', type:'PATRIMONIO', level:2, isMovement:true },
  { code:'4.1', name:'Ingresos', type:'INGRESOS', level:2, isMovement:true },
  { code:'5.1', name:'Costo de ventas', type:'COSTOS', level:2, isMovement:true }
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
