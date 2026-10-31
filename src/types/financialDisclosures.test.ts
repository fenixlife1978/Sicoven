import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Account, JournalEntry } from './accounting';
import { buildDisclosureAccountMovements } from './financialDisclosures';

const accounts: Account[] = [
  { code: '1.1', name: 'Caja', type: 'ACTIVO', level: 2, isMovement: true },
  { code: '4.1', name: 'Ingresos', type: 'INGRESOS', level: 2, isMovement: true }
];

const entry = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  id: 'entry-1', companyId: 'company-a', entryNumber: 1, date: '2026-06-15',
  description: 'Asiento de prueba', type: 'MANUAL', bcvRate: 100,
  items: [
    { accountCode: '1.1', accountName: 'Caja', debitBs: 100, creditBs: 0, debitUsd: 10, creditUsd: 0 },
    { accountCode: '4.1', accountName: 'Ingresos', debitBs: 0, creditBs: 100, debitUsd: 0, creditUsd: 10 }
  ],
  createdAt: '2026-06-15T12:00:00.000Z',
  ...overrides
});

describe('financial disclosure account movements', () => {
  it('aggregates Bs and USD independently and preserves entry traceability', () => {
    const rows = buildDisclosureAccountMovements([entry()], accounts, 'company-a', 2026);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
      accountCode: '1.1', accountName: 'Caja',
      debitBs: 100, creditBs: 0, debitUsd: 10, creditUsd: 0,
      balanceBs: 100, balanceUsd: 10, entryIds: ['entry-1']
    });
    assert.equal(rows.find(row => row.accountCode === '4.1')?.balanceBs, -100);
    assert.equal(rows.find(row => row.accountCode === '4.1')?.balanceUsd, -10);
  });

  it('isolates company and fiscal year and excludes closing entries', () => {
    const rows = buildDisclosureAccountMovements([
      entry(),
      entry({ id: 'other-company', companyId: 'company-b' }),
      entry({ id: 'prior-year', date: '2025-12-31' }),
      entry({ id: 'closing', type: 'CIERRE', date: '2026-12-31' })
    ], accounts, 'company-a', 2026);
    assert.deepEqual(rows.flatMap(row => row.entryIds), ['entry-1', 'entry-1']);
  });

  it('rejects NaN, Infinity and negative values instead of silently converting them to zero', () => {
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1]) {
      const invalidEntry = entry({
        items: [{ ...entry().items[0], debitBs: invalid }]
      });
      assert.throws(
        () => buildDisclosureAccountMovements([invalidEntry], accounts, 'company-a', 2026),
        /debitBs debe ser un importe finito y no negativo/
      );
    }
  });

  it('rejects missing account references and invalid fiscal years', () => {
    const invalidEntry = entry({
      items: [{ ...entry().items[0], accountCode: '9.9' }]
    });
    assert.throws(() => buildDisclosureAccountMovements([invalidEntry], accounts, 'company-a', 2026), /cuenta inexistente/);
    assert.throws(() => buildDisclosureAccountMovements([entry()], accounts, 'company-a', 0), /ejercicio.*no es válido/);
  });
});
