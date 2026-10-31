import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prepareAccountForCatalog } from './chartOfAccounts';
import type { Account } from './accounting';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../data/defaultChartOfAccounts';

const account = (overrides: Partial<Account> = {}): Account => ({
  code: '1.1.1.06',
  name: 'Banco adicional',
  type: 'ACTIVO',
  level: 4,
  isMovement: true,
  ...overrides
});

describe('chart of accounts hierarchy validation', () => {
  it('resolves the nearest existing parent even when the catalog skips an intermediate code level', () => {
    const result = prepareAccountForCatalog(account(), DEFAULT_CHART_OF_ACCOUNTS);
    assert.equal(result.parentCode, '1.1.1');
    assert.equal(result.level, 4);
    assert.equal(result.name, 'BANCO ADICIONAL');
  });

  it('accepts a valid new top-level classification', () => {
    const result = prepareAccountForCatalog(account({
      code: '6', name: 'Gastos', type: 'GASTOS', level: 1, isMovement: false
    }), []);
    assert.equal(result.parentCode, undefined);
    assert.equal(result.level, 1);
  });

  it('rejects duplicate account codes rather than silently replacing an existing account', () => {
    assert.throws(
      () => prepareAccountForCatalog(account({ code: '1.1.1.01' }), DEFAULT_CHART_OF_ACCOUNTS),
      /Ya existe una cuenta/
    );
  });

  it('rejects malformed account codes and unsupported root classifications', () => {
    assert.throws(() => prepareAccountForCatalog(account({ code: '1..1.06' }), DEFAULT_CHART_OF_ACCOUNTS), /código/);
    assert.throws(() => prepareAccountForCatalog(account({ code: '7.1', type: 'ACTIVO' }), DEFAULT_CHART_OF_ACCOUNTS), /clasificación/);
  });

  it('requires an existing parent and does not permit a movement account to become a parent', () => {
    assert.throws(() => prepareAccountForCatalog(account({ code: '1.9.01' }), DEFAULT_CHART_OF_ACCOUNTS), /No existe una cuenta agrupadora/);
    const movementParent = [account({ code: '1.1', level: 2, isMovement: true })];
    assert.throws(() => prepareAccountForCatalog(account({ code: '1.1.01', level: 3 }), movementParent), /imputable/);
  });

  it('rejects blank names and a root account with an incompatible type', () => {
    assert.throws(
      () => prepareAccountForCatalog(account({ name: '   ' }), DEFAULT_CHART_OF_ACCOUNTS),
      /denominación/
    );
    assert.throws(
      () => prepareAccountForCatalog(account({ code: '1', type: 'PASIVO', level: 1 }), []),
      /clasificación/
    );
  });

  it('keeps the new account under the same accounting classification as its parent', () => {
    assert.throws(
      () => prepareAccountForCatalog(account({ code: '2.1.1.06', type: 'ACTIVO' }), DEFAULT_CHART_OF_ACCOUNTS),
      /clasificación/
    );
  });

  it('validates every default account can be used as a parent for subsequent additions without rewriting legacy data', () => {
    const codes = new Set(DEFAULT_CHART_OF_ACCOUNTS.map(item => item.code));
    for (const item of DEFAULT_CHART_OF_ACCOUNTS) {
      if (item.level === 1) continue;
      assert.ok(item.parentCode && codes.has(item.parentCode), `Falta padre para ${item.code}`);
      const parent = DEFAULT_CHART_OF_ACCOUNTS.find(candidate => candidate.code === item.parentCode);
      assert.ok(parent && !parent.isMovement, `Padre inválido para ${item.code}`);
      assert.ok(item.code.startsWith(parent!.code + '.'), `El padre no es prefijo de ${item.code}`);
    }
  });
});
