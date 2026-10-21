const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

let db;
function openDatabase() {
  const dataDir = app.getPath('userData');
  fs.mkdirSync(dataDir, { recursive: true });
  db = new Database(path.join(dataDir, 'sicoven.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = FULL');
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
    CREATE TABLE IF NOT EXISTS demo_usage (
      module_key TEXT PRIMARY KEY,
      action_count INTEGER NOT NULL DEFAULT 0 CHECK (action_count >= 0),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrar el contador de versiones previas sin permitir que una actualización
  // reinicie las acciones ya consumidas en la edición DEMO.
  try {
    const saved = db.prepare('SELECT state_json FROM app_state WHERE state_key = ?').get('accounting');
    const legacyUsage = saved ? JSON.parse(saved.state_json).demoUsage : null;
    if (legacyUsage && typeof legacyUsage === 'object' && !Array.isArray(legacyUsage)) {
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
    }
  } catch {
    // Una tabla de contador vacía no debe impedir abrir una base contable válida.
  }
}
function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 980, minHeight: 680,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  win.once('ready-to-show', () => win.show());
  if (app.isPackaged) win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  else win.loadURL('http://localhost:3000');
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
}
app.whenReady().then(() => {
  openDatabase();
  ipcMain.handle('sicoven:load-state', () => {
    const row = db.prepare('SELECT state_json FROM app_state WHERE state_key = ?').get('accounting');
    if (!row) return null;
    try { return JSON.parse(row.state_json); } catch { return null; }
  });
  ipcMain.handle('sicoven:save-state', (_event, state) => {
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Estado contable inválido');
    const json = JSON.stringify(state);
    if (json.length > 50 * 1024 * 1024) throw new Error('El respaldo supera el límite permitido');
    const save = db.transaction(() => {
      db.prepare(`INSERT INTO app_state(state_key,state_json,updated_at) VALUES(?,?,datetime('now'))
        ON CONFLICT(state_key) DO UPDATE SET state_json=excluded.state_json, updated_at=excluded.updated_at`)
        .run('accounting', json);
      db.prepare('INSERT INTO audit_events(event_type,details_json) VALUES(?,?)')
        .run('state_saved', JSON.stringify({ bytes: Buffer.byteLength(json) }));
    });
    save();
    return { ok: true, savedAt: new Date().toISOString() };
  });
  ipcMain.on('sicoven:demo-get-usage', (event) => {
    try {
      const rows = db.prepare('SELECT module_key, action_count FROM demo_usage').all();
      event.returnValue = Object.fromEntries(rows.map(row => [row.module_key, row.action_count]));
    } catch {
      event.returnValue = {};
    }
  });
  ipcMain.on('sicoven:demo-consume-action', (event, moduleKey, limit) => {
    try {
      if (typeof moduleKey !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(moduleKey) ||
          !Number.isInteger(limit) || limit < 1 || limit > 1000) {
        event.returnValue = { ok: false, error: 'Solicitud de demo inválida' };
        return;
      }
      const consume = db.transaction(() => {
        const row = db.prepare('SELECT action_count FROM demo_usage WHERE module_key = ?').get(moduleKey);
        const used = row ? row.action_count : 0;
        if (used >= limit) {
          const rows = db.prepare('SELECT module_key, action_count FROM demo_usage').all();
          return { ok: false, used, usage: Object.fromEntries(rows.map(item => [item.module_key, item.action_count])) };
        }
        const next = used + 1;
        db.prepare(`INSERT INTO demo_usage(module_key, action_count, updated_at) VALUES(?,?,datetime('now'))
          ON CONFLICT(module_key) DO UPDATE SET action_count=excluded.action_count, updated_at=excluded.updated_at`)
          .run(moduleKey, next);
        db.prepare('INSERT INTO audit_events(event_type,details_json) VALUES(?,?)')
          .run('demo_action_consumed', JSON.stringify({ moduleKey, actionCount: next, limit }));
        const rows = db.prepare('SELECT module_key, action_count FROM demo_usage').all();
        return { ok: true, used: next, usage: Object.fromEntries(rows.map(item => [item.module_key, item.action_count])) };
      });
      event.returnValue = consume();
    } catch {
      event.returnValue = { ok: false, error: 'No se pudo registrar la acción demo en SQLite' };
    }
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (db) { db.pragma('wal_checkpoint(TRUNCATE)'); db.close(); db = null; } });
