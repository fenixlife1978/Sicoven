import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateDirectSupplierAdvance,
  calculateOutstandingDirectSupplierAdvance,
  validateSupplierDirectAdvanceDraft,
  type SupplierDirectAdvance
} from './supplierDirectAdvance';
import type { Account } from './accounting';

const accounts: Account[] = [
  { code: '1.1.1.01', name: 'Caja principal', type: 'ACTIVO', level: 4, isMovement: true },
  { code: '1.1.4.01', name: 'Inventario', type: 'ACTIVO', level: 4, isMovement: true },
  { code: '2.1.1.01', name: 'Proveedores', type: 'PASIVO', level: 4, isMovement: true },
  { code: '6.1.1.01', name: 'Gastos', type: 'GASTOS', level: 4, isMovement: true }
];

const advance = (id: string, overrides: Partial<SupplierDirectAdvance> = {}): SupplierDirectAdvance => ({
  id, companyId: 'company-1', supplierRif: 'J-12345678-9', supplierName: 'Proveedor',
  date: '2026-10-01', amountUsd: 100, bookValueBs: 10000, bcvRate: 100,
  treasuryAccountCode: '1.1.1.01', paymentCurrency: 'BS', paidAmount: 10000,
  reference: 'TRX-001', journalEntryId: 'journal-' + id, createdAt: '2026-10-01T10:00:00.000Z',
  ...overrides
});

describe('supplier direct advances', () => {
  it('accepts a valid real cash/bank asset account and rejects expense, inventory and payable accounts', () => {
    const draft = {
      supplierRif: 'J-12345678-9', supplierName: 'Proveedor', date: '2026-10-01',
      amountUsd: 100, bcvRate: 100, treasuryAccountCode: '1.1.1.01',
      paymentCurrency: 'BS' as const, paidAmount: 10000, reference: 'TRX-001'
    };
    assert.equal(validateSupplierDirectAdvanceDraft(draft, 'company-1', accounts), null);
    assert.match(validateSupplierDirectAdvanceDraft({ ...draft, treasuryAccountCode: '6.1.1.01' }, 'company-1', accounts) || '', /Caja\/Banco/);
    assert.match(validateSupplierDirectAdvanceDraft({ ...draft, treasuryAccountCode: '1.1.4.01' }, 'company-1', accounts) || '', /Caja\/Banco/);
    assert.match(validateSupplierDirectAdvanceDraft({ ...draft, treasuryAccountCode: '2.1.1.01' }, 'company-1', accounts) || '', /Caja\/Banco/);
  });

  it('validates USD and Bs disbursement values against the BCV rate', () => {
    const draft = {
      supplierRif: 'J-12345678-9', supplierName: 'Proveedor', date: '2026-10-01',
      amountUsd: 12.5, bcvRate: 100, treasuryAccountCode: '1.1.1.01',
      paymentCurrency: 'BS' as const, paidAmount: 1250, reference: 'TRX-002'
    };
    assert.equal(validateSupplierDirectAdvanceDraft(draft, 'company-1', accounts), null);
    assert.match(validateSupplierDirectAdvanceDraft({ ...draft, paidAmount: 1200 }, 'company-1', accounts) || '', /no concilia/);
    assert.equal(validateSupplierDirectAdvanceDraft({ ...draft, paymentCurrency: 'USD', paidAmount: 12.5 }, 'company-1', accounts), null);
  });

  it('allocates partial and total applications FIFO at each source historical book value', () => {
    const sources = [
      advance('a1', { amountUsd: 40, bookValueBs: 3600, bcvRate: 90, date: '2026-10-01' }),
      advance('a2', { amountUsd: 60, bookValueBs: 6000, bcvRate: 100, date: '2026-10-02' })
    ];
    const partial = allocateDirectSupplierAdvance(sources, [], 'company-1', 'J-12345678-9', 50);
    assert.deepEqual(partial, [
      { directAdvanceId: 'a1', amountUsd: 40, bookValueBs: 3600 },
      { directAdvanceId: 'a2', amountUsd: 10, bookValueBs: 1000 }
    ]);
    const later = allocateDirectSupplierAdvance(sources, [{
      companyId: 'company-1', supplierRif: 'J-12345678-9', allocations: partial
    }], 'company-1', 'J-12345678-9', 50);
    assert.deepEqual(later, [{ directAdvanceId: 'a2', amountUsd: 50, bookValueBs: 5000 }]);
  });

  it('isolates companies and suppliers and restores balances after reversed consumptions', () => {
    const sources = [advance('a1'), advance('a-other-company', { companyId: 'company-2' }),
      advance('a-other-supplier', { supplierRif: 'J-87654321-0' })];
    const consumptions = [{
      companyId: 'company-1', supplierRif: 'J-12345678-9',
      allocations: [{ directAdvanceId: 'a1', amountUsd: 25, bookValueBs: 2500 }]
    }];
    const balance = calculateOutstandingDirectSupplierAdvance('company-1', 'J-12345678-9', sources, consumptions);
    assert.equal(balance.outstandingUsd, 75);
    assert.equal(balance.outstandingBookValueBs, 7500);
    const reversed = calculateOutstandingDirectSupplierAdvance('company-1', 'J-12345678-9', sources, [
      { ...consumptions[0], isReversed: true }
    ]);
    assert.equal(reversed.outstandingUsd, 100);
    assert.throws(() => allocateDirectSupplierAdvance(sources, consumptions, 'company-1', 'J-12345678-9', 76), /supera el saldo/);
  });

  it('rejects over-consumption and malformed dates or missing references', () => {
    assert.throws(() => calculateOutstandingDirectSupplierAdvance('company-1', 'J-12345678-9',
      [advance('a1')], [{ companyId: 'company-1', supplierRif: 'J-12345678-9',
        allocations: [{ directAdvanceId: 'a1', amountUsd: 101, bookValueBs: 10100 }] }]), /superan/);
    const draft = {
      supplierRif: 'J-12345678-9', supplierName: 'Proveedor', date: '2026-02-30',
      amountUsd: 100, bcvRate: 100, treasuryAccountCode: '1.1.1.01',
      paymentCurrency: 'BS' as const, paidAmount: 10000, reference: ''
    };
    assert.match(validateSupplierDirectAdvanceDraft(draft, 'company-1', accounts) || '', /fecha/);
    assert.match(validateSupplierDirectAdvanceDraft({ ...draft, date: '2026-10-01' }, 'company-1', accounts) || '', /referencia/);
  });
});
