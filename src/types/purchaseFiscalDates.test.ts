import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPurchaseAccountCreditDate } from './accounting';

describe('purchase accounting recognition date', () => {
  it('uses the explicit account-credit date when present', () => {
    assert.equal(getPurchaseAccountCreditDate({
      invoiceDate: '2026-09-28',
      accountCreditDate: '2026-10-02'
    }), '2026-10-02');
  });

  it('preserves invoice-date fallback for historical records', () => {
    assert.equal(getPurchaseAccountCreditDate({
      invoiceDate: '2025-04-15'
    }), '2025-04-15');
  });
});
