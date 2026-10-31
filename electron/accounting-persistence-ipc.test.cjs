const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { persistAccountingSnapshot, registerAccountingPersistenceHandler } = require('./accounting-persistence.cjs');

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
      return validSession && token === 'valid-session' ? { id: 1, username: 'auditor', role: 'admin' } : null;
    }
  });
  return { db, handler: handlers.get('sicoven:save-state'), reopenHandler: handlers.get('sicoven:reopen-accounting-period'), calls };
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

test('SQLite audit records direct supplier advance posting and its linked reversal', () => {
  const harness = createHarness();
  try {
    const accounts = [
      { code: '1.1.2.03', name: 'Anticipos a proveedores', type: 'ACTIVO', isMovement: true },
      { code: '1.1.1.01', name: 'Caja principal', type: 'ACTIVO', isMovement: true }
    ];
    const original = {
      id: 'direct-advance-entry', companyId: 'company-1', entryNumber: 1,
      date: '2026-10-10', description: 'Anticipo directo proveedor',
      type: 'ANTICIPO_PROVEEDOR', bcvRate: 100, referenceDoc: 'ADV-AUDIT-1',
      items: [
        { accountCode: '1.1.2.03', debitBs: 10000, creditBs: 0, debitUsd: 100, creditUsd: 0 },
        { accountCode: '1.1.1.01', debitBs: 0, creditBs: 10000, debitUsd: 0, creditUsd: 100 }
      ], createdAt: '2026-10-10T10:00:00.000Z'
    };
    const advance = {
      id: 'direct-advance-1', companyId: 'company-1', supplierRif: 'J-12345678-9',
      supplierName: 'Proveedor', date: '2026-10-10', amountUsd: 100,
      bookValueBs: 10000, bcvRate: 100, treasuryAccountCode: '1.1.1.01',
      paymentCurrency: 'BS', paidAmount: 10000, reference: 'ADV-AUDIT-1',
      support: 'REC-AUDIT-1', journalEntryId: original.id,
      createdAt: '2026-10-10T10:00:00.000Z'
    };
    const first = {
      ...emptyState(), accounts, journalEntries: [original],
      supplierDirectAdvances: [advance], supplierAdvanceSettlements: []
    };
    persistAccountingSnapshot(harness.db, first);
    const posted = harness.db.prepare("SELECT details_json FROM audit_events WHERE event_type='supplier_direct_advance_posted'").get();
    assert.ok(posted);
    const postedDetails = JSON.parse(posted.details_json);
    assert.equal(postedDetails.directAdvanceId, advance.id);
    assert.equal(postedDetails.journalEntryId, original.id);
    assert.equal(postedDetails.support, 'REC-AUDIT-1');

    const reversal = {
      id: 'direct-advance-reversal', companyId: 'company-1', entryNumber: 2,
      date: '2026-10-11', description: 'Reversión documentada del anticipo',
      type: 'AJUSTE', bcvRate: 100, referenceDoc: 'REV-1',
      reversalOfEntryId: original.id, reversalReason: 'Desembolso duplicado verificado.',
      workpaperNote: 'Se verificó el comprobante original antes de revertir.',
      items: [
        { accountCode: '1.1.2.03', debitBs: 0, creditBs: 10000, debitUsd: 0, creditUsd: 100 },
        { accountCode: '1.1.1.01', debitBs: 10000, creditBs: 0, debitUsd: 100, creditUsd: 0 }
      ], createdAt: '2026-10-11T10:00:00.000Z'
    };
    const reversed = {
      ...first,
      journalEntries: [
        { ...original, reversedByEntryId: reversal.id, isAdjusted: true },
        reversal
      ],
      supplierDirectAdvances: [{
        ...advance, isReversed: true, reversedByJournalEntryId: reversal.id
      }]
    };
    persistAccountingSnapshot(harness.db, reversed);
    const reversalAudit = harness.db.prepare("SELECT details_json FROM audit_events WHERE event_type='supplier_direct_advance_reversed'").get();
    assert.ok(reversalAudit);
    assert.equal(JSON.parse(reversalAudit.details_json).reversedByJournalEntryId, reversal.id);
  } finally {
    harness.db.close();
  }
});

test('SQLite audit records an accounting year opening as a dedicated event in the same snapshot transaction', () => {
  const harness = createHarness();
  try {
    const opening = {
      id: 'opening-entry-1', companyId: 'company-1', entryNumber: 1,
      date: '2027-01-01', description: 'Asiento de apertura del ejercicio',
      type: 'APERTURA', bcvRate: 100, referenceDoc: 'APERTURA:company-1:2027-01-01',
      items: [
        { accountCode: '1.1.1', accountName: 'Banco', debitBs: 1000, creditBs: 0, debitUsd: 10, creditUsd: 0 },
        { accountCode: '3.1.1', accountName: 'Patrimonio', debitBs: 0, creditBs: 1000, debitUsd: 0, creditUsd: 10 }
      ],
      createdAt: '2027-01-01T08:00:00.000Z'
    };
    const snapshot = {
      ...emptyState(),
      companies: [{ id: 'company-1', name: 'Empresa de prueba', closedThroughDate: '2026-12-31' }],
      accounts: [
        { code: '1.1.1', name: 'Banco', type: 'ACTIVO', isMovement: true },
        { code: '3.1.1', name: 'Patrimonio', type: 'PATRIMONIO', isMovement: true }
      ],
      journalEntries: [opening]
    };
    const saved = harness.handler({}, 'valid-session', snapshot);
    assert.equal(saved.ok, true);
    const event = harness.db.prepare("SELECT details_json FROM audit_events WHERE event_type='accounting_year_opening_posted'").get();
    assert.ok(event);
    const details = JSON.parse(event.details_json);
    assert.equal(details.entryId, opening.id);
    assert.equal(details.companyId, opening.companyId);
    assert.equal(details.openingDate, opening.date);
    assert.equal(details.referenceDoc, opening.referenceDoc);
    assert.deepEqual(details.actor, { userId: 1, username: 'auditor' });
    const types = harness.db.prepare("SELECT event_type FROM audit_events ORDER BY id").all().map(row => row.event_type);
    assert.deepEqual(types, ['journal_entry_posted', 'accounting_year_opening_posted', 'accounting_period_closed', 'state_saved']);
  } finally {
    harness.db.close();
  }
});


function closedCompanyState() {
  return {
    ...emptyState(),
    companies: [
      { id: 'company-1', name: 'Empresa Uno', closedThroughDate: '2026-12-31' },
      { id: 'company-2', name: 'Empresa Dos', closedThroughDate: '2026-06-30' }
    ],
    journalEntries: [{
      id: 'historical-entry', companyId: 'company-1', entryNumber: 1,
      date: '2026-05-15', description: 'Asiento histórico preservado',
      type: 'AJUSTE', items: [
        { accountCode: '1.1.1', debitBs: 100, creditBs: 0, debitUsd: 1, creditUsd: 0 },
        { accountCode: '3.1.1', debitBs: 0, creditBs: 100, debitUsd: 0, creditUsd: 1 }
      ]
    }]
  };
}

function persistClosedCompanyFixture(db) {
  const state = closedCompanyState();
  const openState = {
    ...state,
    companies: state.companies.map(({ closedThroughDate, ...company }) => company)
  };
  persistAccountingSnapshot(db, openState);
  persistAccountingSnapshot(db, state);
}

test('period reopening IPC requires an authenticated active administrator', () => {
  const unauthorized = createHarness({ validSession: false });
  try {
    persistClosedCompanyFixture(unauthorized.db);
    assert.throws(() => unauthorized.reopenHandler({}, 'expired-session', {
      companyId: 'company-1', reopenedThroughDate: '2026-09-30', reason: 'Corrección documentada del período.'
    }), /Sesión no válida/);
    assert.equal(JSON.parse(unauthorized.db.prepare("SELECT state_json FROM app_state WHERE state_key='accounting'").get().state_json)
      .companies[0].closedThroughDate, '2026-12-31');
  } finally { unauthorized.db.close(); }

  const nonAdminDb = new Database(':memory:');
  nonAdminDb.exec(`
    CREATE TABLE app_state (state_key TEXT PRIMARY KEY,state_json TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT,event_type TEXT NOT NULL,details_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now')));
  `);
  const handlers = new Map();
  registerAccountingPersistenceHandler({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    db: nonAdminDb, licenseView: () => ({ authorized: true }),
    getActiveSession: () => ({ id: 2, username: 'operator', role: 'operator' })
  });
  try {
    persistClosedCompanyFixture(nonAdminDb);
    assert.throws(() => handlers.get('sicoven:reopen-accounting-period')({}, 'valid', {
      companyId: 'company-1', reopenedThroughDate: '2026-09-30', reason: 'Corrección documentada del período.'
    }), /solo un administrador/);
  } finally { nonAdminDb.close(); }
});

test('period reopening requires a reason and an effective earlier date', () => {
  const harness = createHarness();
  try {
    persistClosedCompanyFixture(harness.db);
    assert.throws(() => harness.reopenHandler({}, 'valid-session', {
      companyId: 'company-1', reopenedThroughDate: '2026-12-31', reason: 'Reapertura válida por ajuste.'
    }), /anterior al cierre vigente/);
    assert.throws(() => harness.reopenHandler({}, 'valid-session', {
      companyId: 'company-1', reopenedThroughDate: '2026-09-30', reason: 'corto'
    }), /motivo de reapertura es obligatorio/);
    assert.throws(() => harness.reopenHandler({}, 'valid-session', {
      companyId: 'company-1', reopenedThroughDate: '2026-02-30', reason: 'Corrección documentada del período.'
    }), /no existe en el calendario/);
    assert.equal(harness.db.prepare('SELECT COUNT(*) AS count FROM period_reopenings').get().count, 0);
  } finally { harness.db.close(); }
});

test('period reopening is transactional, company-scoped, audited and preserves closure and accounting history', () => {
  const harness = createHarness();
  try {
    persistClosedCompanyFixture(harness.db);
    const result = harness.reopenHandler({}, 'valid-session', {
      companyId: 'company-1', reopenedThroughDate: '2026-09-30',
      reason: 'Se detectó un documento omitido; soporte de auditoría REF-2026-09.'
    });
    assert.equal(result.ok, true);
    assert.equal(result.company.closedThroughDate, '2026-09-30');
    const saved = JSON.parse(harness.db.prepare("SELECT state_json FROM app_state WHERE state_key='accounting'").get().state_json);
    assert.equal(saved.companies.find(item => item.id === 'company-1').closedThroughDate, '2026-09-30');
    assert.equal(saved.companies.find(item => item.id === 'company-2').closedThroughDate, '2026-06-30');
    assert.equal(saved.journalEntries[0].id, 'historical-entry');
    const closureHistory = harness.db.prepare("SELECT details_json FROM audit_events WHERE event_type='accounting_period_closed'").get();
    assert.ok(closureHistory);
    assert.equal(JSON.parse(closureHistory.details_json).closedThroughDate, '2026-12-31');
    const reopening = harness.db.prepare('SELECT * FROM period_reopenings').get();
    assert.equal(reopening.company_id, 'company-1');
    assert.equal(reopening.previous_closed_through_date, '2026-12-31');
    assert.equal(reopening.reopened_through_date, '2026-09-30');
    assert.equal(reopening.actor_user_id, 1);
    assert.equal(reopening.actor_username, 'auditor');
    const event = harness.db.prepare("SELECT details_json FROM audit_events WHERE event_type='accounting_period_reopened'").get();
    assert.ok(event);
    assert.equal(JSON.parse(event.details_json).reason, 'Se detectó un documento omitido; soporte de auditoría REF-2026-09.');
    assert.throws(() => harness.db.prepare("UPDATE period_reopenings SET reason='alterado' WHERE id=?").run(reopening.id), /append-only/);
    assert.throws(() => harness.db.prepare("DELETE FROM period_reopenings WHERE id=?").run(reopening.id), /append-only/);
    assert.throws(() => harness.reopenHandler({}, 'valid-session', {
      companyId: 'company-1', reopenedThroughDate: '2026-09-30',
      reason: 'Segundo intento duplicado que no debe producir otro evento.'
    }), /anterior al cierre vigente/);
    assert.equal(harness.db.prepare('SELECT COUNT(*) AS count FROM period_reopenings').get().count, 1);
  } finally { harness.db.close(); }
});

test('full period reopening clears only the active boundary and retains its immutable closure record', () => {
  const harness = createHarness();
  try {
    persistClosedCompanyFixture(harness.db);
    const result = harness.reopenHandler({}, 'valid-session', {
      companyId: 'company-1', reopenedThroughDate: null,
      reason: 'Reapertura integral autorizada para corregir el ejercicio completo.'
    });
    assert.equal(result.ok, true);
    assert.equal(result.company.closedThroughDate, undefined);
    const saved = JSON.parse(harness.db.prepare("SELECT state_json FROM app_state WHERE state_key='accounting'").get().state_json);
    assert.equal(saved.companies.find(item => item.id === 'company-1').closedThroughDate, undefined);
    assert.equal(saved.companies.find(item => item.id === 'company-2').closedThroughDate, '2026-06-30');
    assert.equal(harness.db.prepare('SELECT COUNT(*) AS count FROM period_reopenings').get().count, 1);
    assert.equal(harness.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE event_type='accounting_period_closed'").get().count, 1);
  } finally { harness.db.close(); }
});
