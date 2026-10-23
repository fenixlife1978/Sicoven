'use strict';

function ensureDemoUsageSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS demo_usage (
      module_key TEXT PRIMARY KEY,
      action_count INTEGER NOT NULL DEFAULT 0 CHECK (action_count >= 0),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function getDemoUsage(db) {
  const rows = db.prepare('SELECT module_key, action_count FROM demo_usage').all();
  return Object.fromEntries(rows.map(row => [row.module_key, row.action_count]));
}

function consumeDemoAction(db, moduleKey, limit) {
  if (typeof moduleKey !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(moduleKey) ||
      !Number.isInteger(limit) || limit < 1 || limit > 1000) {
    return { ok: false, error: 'Solicitud de demo inválida' };
  }

  const consume = db.transaction(() => {
    const row = db.prepare('SELECT action_count FROM demo_usage WHERE module_key = ?').get(moduleKey);
    const used = row ? row.action_count : 0;
    if (used >= limit) return { ok: false, used, usage: getDemoUsage(db) };

    const next = used + 1;
    db.prepare(`INSERT INTO demo_usage(module_key, action_count, updated_at) VALUES(?,?,datetime('now'))
      ON CONFLICT(module_key) DO UPDATE SET action_count=excluded.action_count, updated_at=excluded.updated_at`)
      .run(moduleKey, next);
    db.prepare('INSERT INTO audit_events(event_type,details_json) VALUES(?,?)')
      .run('demo_action_consumed', JSON.stringify({ moduleKey, actionCount: next, limit }));
    return { ok: true, used: next, usage: getDemoUsage(db) };
  });
  return consume();
}

function migrateLegacyDemoUsage(db) {
  try {
    const saved = db.prepare('SELECT state_json FROM app_state WHERE state_key = ?').get('accounting');
    const legacyUsage = saved ? JSON.parse(saved.state_json).demoUsage : null;
    if (!legacyUsage || typeof legacyUsage !== 'object' || Array.isArray(legacyUsage)) return;

    const migrate = db.transaction(() => {
      for (const [moduleKey, rawCount] of Object.entries(legacyUsage)) {
        const count = Number(rawCount);
        if (!/^[a-z0-9_-]{1,64}$/.test(moduleKey) || !Number.isInteger(count) || count < 0) continue;
        db.prepare(`INSERT INTO demo_usage(module_key, action_count, updated_at) VALUES(?,?,datetime('now'))
          ON CONFLICT(module_key) DO UPDATE SET
            action_count = MAX(demo_usage.action_count, excluded.action_count),
            updated_at = datetime('now')`)
          .run(moduleKey, count);
      }
    });
    migrate();
  } catch {
    // La migración de contador nunca debe invalidar una base contable legible.
  }
}

module.exports = { ensureDemoUsageSchema, getDemoUsage, consumeDemoAction, migrateLegacyDemoUsage };
