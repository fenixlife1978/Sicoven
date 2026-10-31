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
  bcvRate: 100, amountUsd: 25, amountBs: 2500, method: 'CASH_BS'
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

  it('keeps reversed settlements in history but excludes them from the payable/receivable balance', () => {
    const balance = calculateCreditBalance('invoice-1', 100, 8000, [
      settlement({ amountUsd: 25, amountBs: 2500 }),
      settlement({ id: 's-reversed', amountUsd: 40, amountBs: 4000, isReversed: true, reversedByJournalEntryId: 'j-reversal' })
    ]);
    assert.equal(balance.settledAmountUsd, 25);
    assert.equal(balance.settledAmountBs, 2500);
    assert.equal(balance.outstandingUsd, 75);
    assert.equal(balance.settlementCount, 1);
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

  it('requires a specific bank auxiliary for bank transfers', () => {
    assert.match(validateCreditSettlement({ ...draft, method: 'BANK_TRANSFER_BS' }, 100) || '', /Seleccione la cuenta bancaria auxiliar/i);
    assert.match(validateCreditSettlement({ ...draft, method: 'BANK_TRANSFER_USD' }, 100) || '', /Seleccione la cuenta bancaria auxiliar/i);
    assert.match(validateCreditSettlement({ ...draft, method: 'BANK_TRANSFER_BS', bankAccountId: 'bank-bs-1' }, 100) || '', /referencia o comprobante/i);
  });

  it('accepts a transfer draft only when a bank auxiliary is selected', () => {
    assert.equal(validateCreditSettlement({ ...draft, method: 'BANK_TRANSFER_BS', bankAccountId: 'bank-bs-1', reference: 'TRX-001' }, 100), null);
    assert.equal(validateCreditSettlement({ ...draft, method: 'BANK_TRANSFER_USD', bankAccountId: 'bank-usd-1', reference: 'TRX-002' }, 100), null);
  });

  it('requires a transfer reference even when a bank auxiliary is selected', () => {
    assert.match(validateCreditSettlement({ ...draft, method: 'BANK_TRANSFER_BS', bankAccountId: 'bank-bs-1' }, 100) || '', /referencia o comprobante/i);
    assert.equal(validateCreditSettlement({ ...draft, method: 'BANK_TRANSFER_BS', bankAccountId: 'bank-bs-1', reference: 'TRX-003' }, 100), null);
  });

  it('blocks unspecified treasury methods', () => {
    assert.match(validateCreditSettlement({ ...draft, method: 'OTHER' }, 100) || '', /no identifica una cuenta de tesorería/i);
  });

  it('rejects amounts above outstanding principal', () => {
    assert.match(validateCreditSettlement({ ...draft, amountUsd: 101 }, 100) || '', /supera el saldo/);
  });

  it('fails closed when outstanding balance is invalid', () => {
    assert.match(validateCreditSettlement(draft, Number.NaN) || '', /saldo pendiente.*no es válido/i);
    assert.match(validateCreditSettlement(draft, -0.01) || '', /saldo pendiente.*no es válido/i);
  });

  it('allows a final partial payment within rounding tolerance but never a material overpayment', () => {
    assert.equal(validateCreditSettlement({ ...draft, amountUsd: 75, amountBs: 7500 }, 75), null);
    assert.match(validateCreditSettlement({ ...draft, amountUsd: 75.02, amountBs: 7502 }, 75) || '', /supera el saldo/);
  });


  it('sums settlements for the requested document (company and kind are scoped by caller)', () => {
    const sale = settlement({ documentId: 'invoice-1', kind: 'SALE_COLLECTION', amountUsd: 20 });
    const purchase = settlement({ documentId: 'invoice-1', kind: 'PURCHASE_PAYMENT', amountUsd: 30 });
    const otherCompany = settlement({ documentId: 'invoice-1', companyId: 'c-2', amountUsd: 40 });
    const balance = calculateCreditBalance('invoice-1', 100, 8000, [sale, purchase, otherCompany]);
    // The pure calculator filters by document; the accounting context must additionally
    // filter by active company and kind before calling it.
    assert.equal(balance.settledAmountUsd, 90);
  });

  it('rounds the remaining USD and Bs values to cents', () => {
    const balance = calculateCreditBalance('invoice-1', 116, 102080, [
      settlement({ amountUsd: 33.33, amountBs: 3066360 / 100, bcvRate: 920 })
    ]);
    assert.equal(balance.outstandingUsd, 82.67);
    assert.equal(balance.outstandingBsAtInvoiceRate, 72749.60);
  });

  it('rejects a settlement dated with a calendar-invalid but well-shaped date', () => {
    assert.match(validateCreditSettlement({ ...draft, settlementDate: '2026-02-30' }, 100) || '', /fecha.*no es válida/i);
  });

  it('rejects malformed draft, unsupported settlement kind and unsupported payment method', () => {
    assert.match(validateCreditSettlement(null as unknown as CreditSettlementDraft, 100) || '', /datos de la liquidación/i);
    assert.match(validateCreditSettlement({ ...draft, documentId: undefined as unknown as string }, 100) || '', /factura/i);
    assert.match(validateCreditSettlement({ ...draft, kind: 'UNKNOWN' as CreditSettlementDraft['kind'] }, 100) || '', /tipo de liquidación/i);
    assert.match(validateCreditSettlement({ ...draft, method: 'CRYPTO' as CreditSettlementDraft['method'] }, 100) || '', /medio de pago válido/i);
  });

  it('rejects a Bs amount that does not match the USD amount and recorded rate', () => {
    assert.match(validateCreditSettlement({ ...draft, amountBs: 2400 }, 100) || '', /no coincide con el equivalente/i);
  });

  it('rejects an excessively long or malformed reference', () => {
    assert.match(validateCreditSettlement({ ...draft, reference: 'x'.repeat(201) }, 100) || '', /200 caracteres/i);
    assert.match(validateCreditSettlement({ ...draft, reference: 123 as unknown as string }, 100) || '', /200 caracteres/i);
  });

  it('rejects invalid rate, date and non-positive amounts', () => {
    assert.ok(validateCreditSettlement({ ...draft, bcvRate: 0 }, 100));
    assert.ok(validateCreditSettlement({ ...draft, settlementDate: '2026-99-99' }, 100));
    assert.ok(validateCreditSettlement({ ...draft, amountUsd: 0 }, 100));
    assert.ok(validateCreditSettlement({ ...draft, amountBs: 0 }, 100));
  });
});
