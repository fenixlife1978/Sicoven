const test = require('node:test');
const assert = require('node:assert/strict');
const { validateNewAccountCatalogEntries } = require('./accounting-integrity.cjs');

const root = { code: '1', name: 'ACTIVO', type: 'ACTIVO', level: 1, isMovement: false };
const group = { code: '1.1', name: 'ACTIVO CORRIENTE', type: 'ACTIVO', level: 2, isMovement: false, parentCode: '1' };
const leaf = { code: '1.1.1.01', name: 'Caja', type: 'ACTIVO', level: 3, isMovement: true, parentCode: '1.1' };

test('SQLite integrity accepts a correctly linked new movement account', () => {
  assert.doesNotThrow(() => validateNewAccountCatalogEntries([root, group], [root, group, leaf]));
});

test('SQLite integrity rejects a new account without its canonical parent link', () => {
  assert.throws(
    () => validateNewAccountCatalogEntries([root, group], [root, group, { ...leaf, parentCode: '1' }]),
    /cuenta padre agrupadora/
  );
});

test('SQLite integrity rejects a new account beneath a movement account', () => {
  const movementParent = { ...group, isMovement: true };
  const child = { ...leaf, code: '1.1.01', level: 3, parentCode: '1.1' };
  assert.throws(
    () => validateNewAccountCatalogEntries([root, movementParent], [root, movementParent, child]),
    /cuenta padre agrupadora/
  );
});

test('SQLite integrity rejects duplicate account codes', () => {
  assert.throws(
    () => validateNewAccountCatalogEntries([], [root, root]),
    /códigos de cuenta duplicados/
  );
});

test('SQLite integrity rejects malformed levels and classification mismatch', () => {
  assert.throws(
    () => validateNewAccountCatalogEntries([root, group], [root, group, { ...leaf, level: 3 }]),
    /estructura inválida/
  );
  assert.throws(
    () => validateNewAccountCatalogEntries([root, group], [root, group, { ...leaf, type: 'PASIVO' }]),
    /clasificación/
  );
});

test('SQLite integrity does not retroactively rewrite legacy account records', () => {
  const legacyLeaf = { code: '1.1.01', name: 'Cuenta histórica', type: 'ACTIVO', level: 3, isMovement: true };
  assert.doesNotThrow(() => validateNewAccountCatalogEntries([root, group, legacyLeaf], [root, group, legacyLeaf]));
});
