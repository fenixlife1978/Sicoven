import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpeningEntryItems } from './accountingYearOpening';
import type { Account, JournalEntry } from './accounting';

const accounts: Account[] = [
  { code: '1.1.1', name: 'Banco', type: 'ACTIVO', level: 2, isMovement: true },
  { code: '2.1.1', name: 'Proveedores', type: 'PASIVO', level: 2, isMovement: true },
  { code: '3.1.1', name: 'Resultados acumulados', type: 'PATRIMONIO', level: 2, isMovement: true },
  { code: '4.1.1', name: 'Ingresos', type: 'INGRESOS', level: 2, isMovement: true },
  { code: '6.1.1', name: 'Gastos', type: 'GASTOS', level: 2, isMovement: true }
];
const entry = (id: string, date: string, items: JournalEntry['items']): JournalEntry => ({
  id, companyId: 'co-1', entryNumber: 1, date, description: 'Histórico', type: 'MANUAL',
  bcvRate: 100, items, createdAt: date + 'T12:00:00.000Z'
});
const line = (accountCode: string, debitBs: number, creditBs: number, debitUsd: number, creditUsd: number) => ({
  accountCode, accountName: accountCode, debitBs, creditBs, debitUsd, creditUsd
});

test('traslada cuentas de balance y lleva la utilidad a resultados acumulados en ambas monedas', () => {
  const journal = [entry('e1', '2026-12-31', [
    line('1.1.1', 1500, 0, 15, 0), line('2.1.1', 0, 400, 0, 4),
    line('3.1.1', 0, 600, 0, 6), line('4.1.1', 0, 700, 0, 7),
    line('6.1.1', 200, 0, 2, 0)
  ])];
  const items = buildOpeningEntryItems({
    companyId: 'co-1', periodStartDate: '2026-01-01', periodEndDate: '2026-12-31', openingDate: '2027-01-01',
    accounts, journalEntries: journal, retainedEarningsAccountCode: '3.1.1'
  });
  assert.equal(items.length, 3);
  assert.deepEqual(items.find(item => item.accountCode === '1.1.1') && {
    debitBs: items.find(item => item.accountCode === '1.1.1')!.debitBs,
    debitUsd: items.find(item => item.accountCode === '1.1.1')!.debitUsd
  }, { debitBs: 1500, debitUsd: 15 });
  assert.equal(items.find(item => item.accountCode === '2.1.1')?.creditBs, 400);
  assert.equal(items.find(item => item.accountCode === '3.1.1')?.creditBs, 1100);
  assert.equal(items.find(item => item.accountCode === '3.1.1')?.creditUsd, 11);
});

test('exige cuenta patrimonial imputable para trasladar resultados', () => {
  const journal = [entry('e1', '2026-12-31', [
    line('1.1.1', 100, 0, 1, 0), line('4.1.1', 0, 100, 0, 1)
  ])];
  assert.throws(() => buildOpeningEntryItems({
    companyId: 'co-1', periodStartDate: '2026-01-01', periodEndDate: '2026-12-31', openingDate: '2027-01-01',
    accounts, journalEntries: journal
  }), /cuenta imputable de patrimonio/);
});

test('rechaza asientos históricos descuadrados y aperturas duplicadas', () => {
  const unbalanced = [entry('e1', '2026-12-31', [
    line('1.1.1', 100, 0, 1, 0), line('2.1.1', 0, 90, 0, 0.9)
  ])];
  assert.throws(() => buildOpeningEntryItems({
    companyId: 'co-1', periodStartDate: '2026-01-01', periodEndDate: '2026-12-31', openingDate: '2027-01-01',
    accounts, journalEntries: unbalanced
  }), /no cuadra/);
  const duplicate = entry('open-1', '2027-01-01', [
    line('1.1.1', 100, 0, 1, 0), line('2.1.1', 0, 100, 0, 1)
  ]);
  duplicate.type = 'APERTURA';
  assert.throws(() => buildOpeningEntryItems({
    companyId: 'co-1', periodStartDate: '2026-01-01', periodEndDate: '2026-12-31', openingDate: '2027-01-01',
    accounts, journalEntries: [duplicate]
  }), /Ya existe un asiento de apertura/);
});

test('no mezcla empresas ni movimientos posteriores al corte', () => {
  const later = entry('later', '2027-01-02', [
    line('1.1.1', 100, 0, 1, 0), line('2.1.1', 0, 100, 0, 1)
  ]);
  const other = entry('other', '2026-12-31', [
    line('1.1.1', 100, 0, 1, 0), line('2.1.1', 0, 100, 0, 1)
  ]);
  other.companyId = 'co-2';
  assert.throws(() => buildOpeningEntryItems({
    companyId: 'co-1', periodStartDate: '2026-01-01', periodEndDate: '2026-12-31', openingDate: '2027-01-01',
    accounts, journalEntries: [later, other]
  }), /No existen saldos/);
});
