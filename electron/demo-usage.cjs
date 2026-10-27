'use strict';

const VALID_MODULE_KEY = /^[a-z][a-z0-9_-]{0,63}$/;

function ensureDemoUsageSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS demo_usage (
      module_key TEXT PRIMARY KEY,
      used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function getDemoUsage(db) {
  ensureDemoUsageSchema(db);
  const rows = db.prepare('SELECT module_key, used_count FROM demo_usage ORDER BY module_key').all();
  return Object.fromEntries(rows.map(row => [row.module_key, Number(row.used_count)]));
}

function consumeDemoAction(db, moduleKey, limit) {
  ensureDemoUsageSchema(db);
  if (typeof moduleKey !== 'string' || !VALID_MODULE_KEY.test(moduleKey) ||
      !Number.isSafeInteger(limit) || limit < 1) {
    return { ok: false, used: 0, limit: Number.isSafeInteger(limit) ? limit : null };
  }

  const consume = db.transaction(() => {
    const row = db.prepare('SELECT used_count FROM demo_usage WHERE module_key = ?').get(moduleKey);
    const used = row ? Number(row.used_count) : 0;
    if (used >= limit) return { ok: false, used, limit };

    const nextUsed = used + 1;
    db.prepare(`
      INSERT INTO demo_usage (module_key, used_count, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(module_key) DO UPDATE SET
        used_count = excluded.used_count,
        updated_at = datetime('now')
    `).run(moduleKey, nextUsed);

    try {
      db.prepare('INSERT INTO audit_events (event_type, details_json) VALUES (?, ?)')
        .run('demo_action_consumed', JSON.stringify({ module: moduleKey, used: nextUsed, limit }));
    } catch (error) {
      // Tests and older databases may not yet have the audit table. Usage persistence
      // must still be atomic and reliable independently of optional audit logging.
      if (!/no such table: audit_events/i.test(String(error && error.message))) throw error;
    }
    return { ok: true, used: nextUsed, limit };
  });

  return consume();
}

function migrateLegacyDemoUsage(db) {
  ensureDemoUsageSchema(db);
  const legacy = db.prepare('SELECT state_json FROM app_state WHERE state_key = ?').get('accounting');
  if (!legacy) return getDemoUsage(db);

  let parsed;
  try {
    parsed = JSON.parse(legacy.state_json);
  } catch {
    return getDemoUsage(db);
  }
  const usage = parsed && parsed.demoUsage;
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return getDemoUsage(db);

  const migrate = db.transaction(() => {
    const upsert = db.prepare(`
      INSERT INTO demo_usage (module_key, used_count, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(module_key) DO UPDATE SET
        used_count = MAX(demo_usage.used_count, excluded.used_count),
        updated_at = datetime('now')
    `);
    for (const [moduleKey, rawCount] of Object.entries(usage)) {
      if (!VALID_MODULE_KEY.test(moduleKey)) continue;
      const count = Number(rawCount);
      if (!Number.isSafeInteger(count) || count < 0) continue;
      upsert.run(moduleKey, count);
    }
  });
  migrate();
  return getDemoUsage(db);
}

module.exports = { ensureDemoUsageSchema, getDemoUsage, consumeDemoAction, migrateLegacyDemoUsage };
