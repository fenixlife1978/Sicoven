const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { registerAccountingPersistenceHandler } = require('./accounting-persistence.cjs');

const emptyState = () => ({
  companies: [], currentCompanyId: '', accounts: [],
  journalEntries: [], purchases: [], sales: [], products: [], movements: [],
  vatVouchers: [], islrVouchers: [], bankAccounts: [], bankStatementMovements: [],
  creditSettlements: [], displayCurrency: 'DUAL'
});

function createHarness({ authorized = true, validSession = true } = {}) {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE app_state (
      state_key TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const handlers = new Map();
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const calls = { license: 0, session: [] };
  registerAccountingPersistenceHandler({
    ipcMain, db,
    licenseView: () => {
      calls.license += 1;
      return { authorized, message: authorized ? '' : 'Licencia no autorizada.' };
    },
    getActiveSession: token => {
      calls.session.push(token);
      return validSession && token === 'valid-session' ? { id: 1 } : null;
    }
  });
  return { db, handler: handlers.get('sicoven:save-state'), calls };
}

test('Electron IPC rejects persistence without an authorized license', () => {
  const harness = createHarness({ authorized: false });
  try {
    assert.throws(() => harness.handler({}, 'valid-session', emptyState()), /Licencia no autorizada/);
    assert.equal(harness.db.prepare('SELECT COUNT(*) AS count FROM app_state').get().count, 0);
    assert.deepEqual(harness.calls.session, []);
  } finally {
    harness.db.close();
  }
});

test('Electron IPC rejects persistence without a valid active session', () => {
  const harness = createHarness({ validSession: false });
  try {
    assert.throws(() => harness.handler({}, 'expired-session', emptyState()), /Sesión no válida/);
    assert.equal(harness.db.prepare('SELECT COUNT(*) AS count FROM app_state').get().count, 0);
    assert.deepEqual(harness.calls.session, ['expired-session']);
  } finally {
    harness.db.close();
  }
});

test('Electron IPC rejects malformed state before writing SQLite', () => {
  const harness = createHarness();
  try {
    assert.throws(() => harness.handler({}, 'valid-session', []), /Estado contable inválido/);
    assert.equal(harness.db.prepare('SELECT COUNT(*) AS count FROM app_state').get().count, 0);
  } finally {
    harness.db.close();
  }
});

test('Electron IPC persists an authorized accounting snapshot through the production SQLite transaction', () => {
  const harness = createHarness();
  try {
    const result = harness.handler({}, 'valid-session', emptyState());
    assert.equal(result.ok, true);
    const saved = JSON.parse(harness.db.prepare("SELECT state_json FROM app_state WHERE state_key='accounting'").get().state_json);
    assert.deepEqual(saved.companies, []);
    assert.deepEqual(saved.purchases, []);
    const audit = harness.db.prepare("SELECT event_type FROM audit_events ORDER BY id").all().map(row => row.event_type);
    assert.deepEqual(audit, ['state_saved']);
  } finally {
    harness.db.close();
  }
});
