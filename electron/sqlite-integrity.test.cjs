const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { assertSqliteIntegrity } = require('./sqlite-integrity.cjs');

test('SQLite integrity check accepts a healthy database', () => {
  const db = new Database(':memory:');
  try {
    db.exec('PRAGMA foreign_keys = ON; CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id INTEGER REFERENCES parent(id));');
    assert.deepEqual(assertSqliteIntegrity(db), { ok: true, quickCheck: 'ok', foreignKeyViolations: 0 });
  } finally {
    db.close();
  }
});

test('SQLite integrity check rejects foreign-key violations without changing rows', () => {
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id INTEGER REFERENCES parent(id)); INSERT INTO child(parent_id) VALUES(99); PRAGMA foreign_keys = ON;');
    assert.throws(() => assertSqliteIntegrity(db), /relaciones foráneas inconsistentes/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM child').get().count, 1);
  } finally {
    db.close();
  }
});

test('SQLite integrity check rejects an invalid quick_check result', () => {
  const fakeDb = {
    pragma(name) {
      if (name === 'quick_check') return [{ quick_check: 'database disk image is malformed' }];
      throw new Error('foreign_key_check must not run after quick_check fails');
    }
  };
  assert.throws(() => assertSqliteIntegrity(fakeDb), /no superó PRAGMA quick_check/);
});
