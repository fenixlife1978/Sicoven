import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCreditBalance, validateCreditSettlement, type CreditSettlement, type CreditSettlementDraft } from './creditSettlement';

const settlement = (overrides: Partial<CreditSettlement> = {}): CreditSettlement => ({
  id: 's-1', companyId: 'c-1', documentId: 'invoice-1', kind: 'SALE_COLLECTION',
  settlementDate: '2026-10-20', bcvRate: 100, amountUsd: 25, amountBs: 2500,
  method: 'BANK_TRANSFER_BS', journalEntryId: 'j-1', createdAt: '2026-10-20T10:00:00.000Z',
  ...overrides
});
const draft: CreditSettlementDraft = {
  documentId: 'invoice-1', kind: 'SALE_COLLECTION', settlementDate: '2026-10-20',
  bcvRate: 100, amountUsd: 25, amountBs: 2500, method: 'BANK_TRANSFER_BS'
};

describe('credit settlement balances and validation', () => {
  it('preserves invoice principal and values remaining Bs at the invoice rate', () => {
    const balance = calculateCreditBalance('invoice-1', 100, 8000, [
      settlement({ amountUsd: 25, amountBs: 3000, bcvRate: 120 })
    ]);
    assert.equal(balance.outstandingUsd, 75);
    assert.equal(balance.outstandingBsAtInvoiceRate, 6000);
    assert.equal(balance.settledAmountBs, 3000);
  });

  it('does not count settlements from another document', () => {
    const balance = calculateCreditBalance('invoice-1', 100, 8000, [
      settlement({ documentId: 'invoice-other', amountUsd: 90, amountBs: 9000 })
    ]);
    assert.equal(balance.outstandingUsd, 100);
    assert.equal(balance.settlementCount, 0);
  });

  it('caps outstanding principal at zero when settlement list exceeds original amount', () => {
    const balance = calculateCreditBalance('invoice-1', 100, 8000, [
      settlement({ amountUsd: 60 }), settlement({ id: 's-2', amountUsd: 60 })
    ]);
    assert.equal(balance.outstandingUsd, 0);
    assert.equal(balance.outstandingBsAtInvoiceRate, 0);
  });

  it('accepts a valid partial settlement', () => {
    assert.equal(validateCreditSettlement(draft, 100), null);
  });

  it('rejects amounts above outstanding principal', () => {
    assert.match(validateCreditSettlement({ ...draft, amountUsd: 101 }, 100) || '', /supera el saldo/);
  });

  it('fails closed when outstanding balance is invalid', () => {
    assert.match(validateCreditSettlement(draft, Number.NaN) || '', /saldo pendiente.*no es válido/i);
    assert.match(validateCreditSettlement(draft, -0.01) || '', /saldo pendiente.*no es válido/i);
  });

  it('allows a final partial payment within rounding tolerance but never a material overpayment', () => {
    assert.equal(validateCreditSettlement({ ...draft, amountUsd: 75 }, 75), null);
    assert.match(validateCreditSettlement({ ...draft, amountUsd: 75.02 }, 75) || '', /supera el saldo/);
  });

  it('rejects invalid rate, date and non-positive amounts', () => {
    assert.ok(validateCreditSettlement({ ...draft, bcvRate: 0 }, 100));
    assert.ok(validateCreditSettlement({ ...draft, settlementDate: '2026-99-99' }, 100));
    assert.ok(validateCreditSettlement({ ...draft, amountUsd: 0 }, 100));
    assert.ok(validateCreditSettlement({ ...draft, amountBs: 0 }, 100));
  });
});
