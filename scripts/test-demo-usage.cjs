'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const {
  ensureDemoUsageSchema,
  getDemoUsage,
  consumeDemoAction,
  migrateLegacyDemoUsage
} = require('../electron/demo-usage.cjs');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sicoven-demo-counter-'));
const dbPath = path.join(tempDir, 'test.sqlite');
let db;

try {
  db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      state_key TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  ensureDemoUsageSchema(db);

  assert.deepEqual(getDemoUsage(db), {});
  for (let i = 1; i <= 10; i++) {
    const result = consumeDemoAction(db, 'ventas', 10);
    assert.equal(result.ok, true, `action ${i} should be allowed`);
    assert.equal(result.used, i);
  }
  const blocked = consumeDemoAction(db, 'ventas', 10);
  assert.equal(blocked.ok, false, 'the 11th action must be blocked');
  assert.equal(blocked.used, 10);
  assert.equal(consumeDemoAction(db, 'inventario', 10).ok, true, 'module limits must be independent');
  db.close();

  // Simulate closing and reopening SICOVEN: the counter must remain in SQLite.
  db = new Database(dbPath);
  ensureDemoUsageSchema(db);
  assert.equal(getDemoUsage(db).ventas, 10);
  assert.equal(consumeDemoAction(db, 'ventas', 10).ok, false);

  // Migrate counters saved by the previous app-state implementation, taking
  // the maximum so an update cannot lower an already consumed counter.
  db.prepare('INSERT INTO app_state(state_key,state_json) VALUES(?,?)').run(
    'accounting',
    JSON.stringify({ demoUsage: { ventas: 6, compras: 4, diario: 2 } })
  );
  db.prepare('UPDATE demo_usage SET action_count = 8 WHERE module_key = ?').run('ventas');
  migrateLegacyDemoUsage(db);
  assert.equal(getDemoUsage(db).ventas, 10);
  assert.equal(getDemoUsage(db).compras, 4);
  assert.equal(getDemoUsage(db).diario, 2);

  assert.equal(consumeDemoAction(db, '../invalid', 10).ok, false, 'invalid module keys must be rejected');
  console.log('SICOVEN DEMO SQLite counter tests passed.');
} finally {
  if (db && db.open) db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
