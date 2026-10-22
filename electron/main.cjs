const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const sessions = new Map();
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') });
const verifyPassword = (password, salt, expected) => { try { const actual = crypto.scryptSync(password, salt, 64); const target = Buffer.from(expected, 'hex'); return actual.length === target.length && crypto.timingSafeEqual(actual, target); } catch { return false; } };
const normalizeUsername = value => String(value || '').trim().toLowerCase();
const Database = require('better-sqlite3');
const {
  ensureDemoUsageSchema,
  getDemoUsage,
  consumeDemoAction,
  migrateLegacyDemoUsage
} = require('./demo-usage.cjs');

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
  `);
  db.exec(`CREATE TABLE IF NOT EXISTS auth_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin')), is_seed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  const count = db.prepare('SELECT COUNT(*) AS count FROM auth_users').get().count;
  if (count === 0) { const credential = hashPassword('Admin123'); db.prepare('INSERT INTO auth_users(username,password_hash,password_salt,role,is_seed) VALUES(?,?,?,?,1)').run('admin',credential.hash,credential.salt,'admin'); db.prepare('INSERT INTO audit_events(event_type,details_json) VALUES(?,?)').run('seed_admin_created',JSON.stringify({username:'admin'})); }
  ensureDemoUsageSchema(db);
  migrateLegacyDemoUsage(db);
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
  ipcMain.handle('sicoven:auth-login', (_event, credentials) => {
    const username = normalizeUsername(credentials?.username); const password = String(credentials?.password || '');
    if (!username || !password || username.length > 128 || password.length > 256) return {ok:false,message:'Usuario o contraseña incorrectos.'};
    const user = db.prepare('SELECT id,username,password_hash,password_salt,role,is_seed FROM auth_users WHERE username=?').get(username);
    if (!user || !verifyPassword(password,user.password_salt,user.password_hash)) { db.prepare('INSERT INTO audit_events(event_type,details_json) VALUES(?,?)').run('login_failed',JSON.stringify({username})); return {ok:false,message:'Usuario o contraseña incorrectos.'}; }
    const token=crypto.randomBytes(32).toString('hex'); sessions.set(token,{id:user.id,username:user.username,role:user.role});
    db.prepare('INSERT INTO audit_events(event_type,details_json) VALUES(?,?)').run('login_success',JSON.stringify({username:user.username}));
    return {ok:true,token,user:{username:user.username,role:user.role,isSeed:Boolean(user.is_seed)}};
  });
  ipcMain.handle('sicoven:auth-logout', (_event, token) => { sessions.delete(String(token||'')); return {ok:true}; });
  ipcMain.handle('sicoven:auth-list-admins', (_event, token) => { if(!sessions.has(String(token||''))) return {ok:false,message:'Sesión no válida.'}; return {ok:true,admins:db.prepare('SELECT id,username,is_seed AS isSeed,created_at AS createdAt FROM auth_users ORDER BY id').all().map(u=>({...u,isSeed:Boolean(u.isSeed)}))}; });
  ipcMain.handle('sicoven:auth-create-admin', (_event, token, input) => {
    if(!sessions.has(String(token||''))) return {ok:false,message:'Sesión no válida.'}; const username=String(input?.username||'').trim(); const password=String(input?.password||'');
    if(!/^[A-Za-z0-9._-]{3,32}$/.test(username)) return {ok:false,message:'El usuario debe tener 3–32 caracteres: letras, números, punto, guion o guion bajo.'}; if(password.length<10||password.length>256) return {ok:false,message:'La contraseña debe tener al menos 10 caracteres.'};
    try {const c=hashPassword(password);db.prepare('INSERT INTO auth_users(username,password_hash,password_salt,role,is_seed) VALUES(?,?,?,?,0)').run(username,c.hash,c.salt,'admin');db.prepare('INSERT INTO audit_events(event_type,details_json) VALUES(?,?)').run('admin_created',JSON.stringify({username}));return {ok:true};}catch{return {ok:false,message:'No se pudo crear el administrador. Verifique que el usuario no exista.'};}
  });
  ipcMain.handle('sicoven:auth-delete-seed', (_event, token) => {
    const actor=sessions.get(String(token||''));if(!actor)return {ok:false,message:'Sesión no válida.'};const total=db.prepare('SELECT COUNT(*) AS count FROM auth_users').get().count;const seed=db.prepare('SELECT id FROM auth_users WHERE username=? AND is_seed=1').get('admin');
    if(total<2||!seed)return {ok:false,message:'El administrador semilla solo puede eliminarse después de crear otro administrador.'};db.prepare('DELETE FROM auth_users WHERE id=?').run(seed.id);db.prepare('INSERT INTO audit_events(event_type,details_json) VALUES(?,?)').run('seed_admin_deleted',JSON.stringify({by:actor.username}));for(const [k,v] of sessions.entries())if(v.id===seed.id)sessions.delete(k);return {ok:true};
  });
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
      event.returnValue = getDemoUsage(db);
    } catch {
      event.returnValue = {};
    }
  });
  ipcMain.on('sicoven:demo-consume-action', (event, moduleKey) => {
    try {
      // El límite comercial se fija en el proceso principal; el renderer no puede elevarlo.
      event.returnValue = consumeDemoAction(db, moduleKey, 10);
    } catch {
      event.returnValue = { ok: false, error: 'No se pudo registrar la acción demo en SQLite' };
    }
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (db) { db.pragma('wal_checkpoint(TRUNCATE)'); db.close(); db = null; } });
