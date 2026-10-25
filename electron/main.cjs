const { app, BrowserWindow, ipcMain, shell, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const sessions = new Map();
const LICENSE_API = 'https://crm-sicoven.vercel.app/api/activations';
let licenseRecheckTimer = null;

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => ({
  salt,
  hash: crypto.scryptSync(password, salt, 64).toString('hex')
});
const verifyPassword = (password, salt, expected) => {
  try {
    const actual = crypto.scryptSync(password, salt, 64);
    const target = Buffer.from(expected, 'hex');
    return actual.length === target.length && crypto.timingSafeEqual(actual, target);
  } catch {
    return false;
  }
};
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
  db.exec(`CREATE TABLE IF NOT EXISTS license_state (id INTEGER PRIMARY KEY CHECK(id=1), installation_id TEXT NOT NULL, encrypted_key TEXT, license_id TEXT, customer TEXT, product TEXT, status TEXT NOT NULL DEFAULT 'unlicensed', last_checked_at TEXT, message TEXT);`);
  const licenseColumns = new Set(db.prepare('PRAGMA table_info(license_state)').all().map(column => String(column.name)));
  if (!licenseColumns.has('offline_days')) db.exec('ALTER TABLE license_state ADD COLUMN offline_days INTEGER NOT NULL DEFAULT 0');
  if (!licenseColumns.has('last_online_success_at')) db.exec('ALTER TABLE license_state ADD COLUMN last_online_success_at TEXT');
  if (!db.prepare('SELECT id FROM license_state WHERE id=1').get()) {
    db.prepare('INSERT INTO license_state(id,installation_id,status) VALUES(1,?,?)').run(crypto.randomUUID(), 'unlicensed');
  }

  const count = db.prepare('SELECT COUNT(*) AS count FROM auth_users').get().count;
  if (count === 0) {
    const credential = hashPassword('Admin123');
    db.prepare('INSERT INTO auth_users(username,password_hash,password_salt,role,is_seed) VALUES(?,?,?,?,1)').run('admin', credential.hash, credential.salt, 'admin');
    db.prepare('INSERT INTO audit_events(event_type,details_json) VALUES(?,?)').run('seed_admin_created', JSON.stringify({ username: 'admin' }));
  }
  ensureDemoUsageSchema(db);
  migrateLegacyDemoUsage(db);
}

function readLicenseRow() {
  return db.prepare('SELECT * FROM license_state WHERE id=1').get();
}

function licenseView(row = readLicenseRow()) {
  if (!row) {
    return {
      authorized: false,
      needsActivation: true,
      status: 'unlicensed',
      message: 'Active SICOVEN con una clave de licencia.'
    };
  }
  const hasKey = Boolean(row.encrypted_key);
  const offlineDays = Math.max(0, Math.min(365, Number(row.offline_days ?? 0)));
  const lastOnline = row.last_online_success_at ? Date.parse(String(row.last_online_success_at)) : NaN;
  const offlineExpired = hasKey && String(row.status) === 'active' &&
    (!Number.isFinite(lastOnline) || offlineDays === 0 || Date.now() > lastOnline + offlineDays * 86400000);
  const authorized = hasKey && String(row.status) === 'active' && !offlineExpired;
  return {
    authorized,
    needsActivation: !hasKey,
    status: offlineExpired ? 'offline_expired' : String(row.status || 'unlicensed'),
    customer: row.customer || '',
    product: row.product || '',
    offlineDays,
    lastOnlineSuccessAt: row.last_online_success_at || null,
    lastCheckedAt: row.last_checked_at || null,
    message: authorized
      ? (row.message || 'Licencia activada. SICOVEN puede trabajar con sus datos locales.')
      : offlineExpired
        ? 'Se venció el período de uso sin conexión autorizado por el administrador del CRM. Conecta este equipo a internet para revalidar la licencia.'
        : (row.message || 'Active SICOVEN con una clave de licencia.')
  };
}

function decryptLicenseKey(row) {
  if (!row?.encrypted_key) return '';
  if (!safeStorage.isEncryptionAvailable()) throw new Error('El almacenamiento seguro de Windows no está disponible.');
  return safeStorage.decryptString(Buffer.from(row.encrypted_key, 'base64'));
}

async function callLicenseServer(key, installationId) {
  const response = await fetch(LICENSE_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify({
      licenseKey: key,
      installationId,
      deviceLabel: (process.env.COMPUTERNAME || process.env.HOSTNAME || 'Equipo SICOVEN').slice(0, 120)
    }),
    signal: AbortSignal.timeout(8000)
  });
  const result = await response.json().catch(() => ({}));
  return { response, result };
}

async function activateLicense(keyInput) {
  const key = String(keyInput || '').trim();
  if (!key || key.length > 120 || !/^[A-Za-z0-9-]+$/.test(key)) {
    return { ok: false, message: 'Introduce una clave de licencia válida.' };
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, message: 'Windows no permite almacenar la clave de forma segura. No se guardó la licencia.' };
  }
  const row = readLicenseRow();
  try {
    const { response, result } = await callLicenseServer(key, row.installation_id);
    if (!response.ok || !result.ok || !result.license?.id || result.license?.status !== 'active') {
      return { ok: false, message: result.error || 'El CRM no autorizó esta licencia.' };
    }
    const encryptedKey = safeStorage.encryptString(key).toString('base64');
    const checkedAt = new Date().toISOString();
    const offlineDays = Math.max(0, Math.min(365, Number(result.license.offlineDays ?? 0)));
    db.prepare("UPDATE license_state SET encrypted_key=?,license_id=?,customer=?,product=?,status='active',offline_days=?,last_checked_at=?,last_online_success_at=?,message=NULL WHERE id=1")
      .run(encryptedKey, String(result.license.id), String(result.license.customer || ''), String(result.license.product || ''), offlineDays, checkedAt, checkedAt);
    db.prepare('INSERT INTO audit_events(event_type,details_json) VALUES(?,?)')
      .run('license_activated', JSON.stringify({ licenseId: result.license.id, installationId: row.installation_id }));
    return { ok: true, license: licenseView() };
  } catch {
    return { ok: false, message: 'No se pudo conectar al CRM. La activación inicial requiere internet.' };
  }
}

async function revalidateLicense() {
  const row = readLicenseRow();
  if (!row?.encrypted_key) return licenseView(row);
  let key;
  try {
    key = decryptLicenseKey(row);
    const { response, result } = await callLicenseServer(key, row.installation_id);
    const checkedAt = new Date().toISOString();
    if (response.ok && result.ok && result.license?.id && result.license?.status === 'active') {
      const offlineDays = Math.max(0, Math.min(365, Number(result.license.offlineDays ?? row.offline_days ?? 0)));
      db.prepare("UPDATE license_state SET license_id=?,customer=?,product=?,status='active',offline_days=?,last_checked_at=?,last_online_success_at=?,message=NULL WHERE id=1")
        .run(String(result.license.id || row.license_id || ''), String(result.license.customer || row.customer || ''), String(result.license.product || row.product || ''), offlineDays, checkedAt, checkedAt);
      return licenseView();
    }
    if ([400, 403, 409].includes(response.status)) {
      const message = String(result.error || 'El CRM no autorizó esta licencia.');
      // El CRM confirmó que la clave almacenada ya no está autorizada.
      // Limpiar solo la credencial anterior permite introducir una licencia
      // nueva para la misma instalación; la base SQLite y sus datos se conservan.
      db.prepare("UPDATE license_state SET encrypted_key=NULL,license_id=NULL,status='unlicensed',last_checked_at=?,message=? WHERE id=1")
        .run(checkedAt, `La licencia anterior fue revocada. Introduce la nueva clave para activar este equipo. Detalle del CRM: ${message}`);
      db.prepare('INSERT INTO audit_events(event_type,details_json) VALUES(?,?)')
        .run('license_server_rejected', JSON.stringify({ status: response.status, message, installationId: row.installation_id, recovery: 'new-license-required' }));
      return licenseView();
    }
    throw new Error('El CRM no está disponible para revalidar.');
  } catch {
    const current = readLicenseRow();
    // La licencia puede trabajar offline solo durante el plazo que envió el CRM.
    if (current.encrypted_key && current.status === 'active') {
      db.prepare("UPDATE license_state SET message=? WHERE id=1")
        .run('Sin conexión. Se conserva el último estado validado dentro del período offline autorizado por el CRM.');
      return licenseView();
    }
    if (current.status === 'revoked') return licenseView(current);
    return licenseView(current);
  }
}

function createWindow() {
  const iconIco = path.join(__dirname, '..', 'build', 'sicoven.ico');
  const iconPng = path.join(__dirname, '..', 'build', 'sicoven.png');
  const resolvedIcon = fs.existsSync(iconIco) ? iconIco : (fs.existsSync(iconPng) ? iconPng : undefined);

  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 980, minHeight: 680,
    show: false,
    icon: resolvedIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  const logLoadFailure = (kind, details) => {
    try {
      const logPath = path.join(app.getPath('userData'), 'sicoven-startup.log');
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${kind}: ${String(details)}\\n`, 'utf8');
    } catch {}
    if (!win.isVisible()) win.show();
  };
  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame) logLoadFailure('did-fail-load', `${errorCode} ${errorDescription} URL=${validatedURL}`);
  });
  win.webContents.on('render-process-gone', (_event, details) => logLoadFailure('render-process-gone', JSON.stringify(details)));
  win.webContents.on('console-message', (_event, details) => {
    if (details.level >= 2) logLoadFailure('renderer-console', `line=${details.lineNumber} ${details.message}`);
  });
  win.webContents.on('unresponsive', () => logLoadFailure('unresponsive', 'Renderer did not respond'));
  const loadPromise = app.isPackaged
    ? win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
    : win.loadURL('http://localhost:3000');
  loadPromise.catch(error => logLoadFailure('load-promise-rejected', error && error.stack || error));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  openDatabase();

  ipcMain.handle('sicoven:license-status', () => licenseView());
  ipcMain.handle('sicoven:license-activate', async (_event, key) => activateLicense(key));
  ipcMain.handle('sicoven:license-revalidate', async () => {
    const status = await revalidateLicense();
    if (!status.authorized) {
      sessions.clear();
      BrowserWindow.getAllWindows().forEach(win => win.webContents.send('sicoven:license-status-changed', status));
    }
    return status;
  });

  ipcMain.handle('sicoven:auth-login', (_event, credentials) => {
    const licensing = licenseView();
    if (!licensing.authorized) return { ok: false, message: licensing.message || 'Licencia no autorizada.' };
    const username = normalizeUsername(credentials?.username);
    const password = String(credentials?.password || '');
    if (!username || !password || username.length > 128 || password.length > 256) return { ok: false, message: 'Usuario o contraseña incorrectos.' };
    const user = db.prepare('SELECT id,username,password_hash,password_salt,role,is_seed FROM auth_users WHERE username=?').get(username);
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      db.prepare('INSERT INTO audit_events(event_type,details_json) VALUES(?,?)').run('login_failed', JSON.stringify({ username }));
      return { ok: false, message: 'Usuario o contraseña incorrectos.' };
    }
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { id: user.id, username: user.username, role: user.role });
    db.prepare('INSERT INTO audit_events(event_type,details_json) VALUES(?,?)').run('login_success', JSON.stringify({ username: user.username }));
    return { ok: true, token, user: { username: user.username, role: user.role, isSeed: Boolean(user.is_seed) } };
  });

  ipcMain.handle('sicoven:auth-logout', (_event, token) => {
    sessions.delete(String(token || ''));
    return { ok: true };
  });

  ipcMain.handle('sicoven:auth-list-admins', (_event, token) => {
    if (!sessions.has(String(token || ''))) return { ok: false, message: 'Sesión no válida.' };
    return {
      ok: true,
      admins: db.prepare('SELECT id,username,is_seed AS isSeed,created_at AS createdAt FROM auth_users ORDER BY id').all().map(u => ({ ...u, isSeed: Boolean(u.isSeed) }))
    };
  });

  ipcMain.handle('sicoven:auth-create-admin', (_event, token, input) => {
    const actor = sessions.get(String(token || ''));
    if (!actor) return { ok: false, message: 'Sesión no válida. Cierre sesión e ingrese nuevamente.' };
    const rawUsername = String(input?.username || '').trim();
    const username = rawUsername.replace(/\s+/g, '_');
    const password = String(input?.password || '');
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) return { ok: false, message: 'El usuario debe tener entre 3 y 32 caracteres (solo letras sin acentos, números, punto, guion o guion bajo).' };
    if (password.length < 6 || password.length > 256) return { ok: false, message: 'La contraseña debe tener al menos 6 caracteres.' };
    try {
      const credential = hashPassword(password);
      const createAdmin = db.transaction(() => {
        const result = db.prepare('INSERT INTO auth_users(username,password_hash,password_salt,role,is_seed) VALUES(?,?,?,?,0)').run(username, credential.hash, credential.salt, 'admin');
        db.prepare('INSERT INTO audit_events(event_type,details_json) VALUES(?,?)').run('admin_created', JSON.stringify({ username, by: actor.username, userId: Number(result.lastInsertRowid) }));
      });
      createAdmin();
      return { ok: true };
    } catch (error) {
      const code = String(error?.code || '');
      const detail = String(error?.message || '');
      if (code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(detail)) return { ok: false, message: 'Ese nombre de usuario ya existe. Elige uno diferente.' };
      console.error('[SICOVEN] No se pudo crear administrador:', code, detail);
      return { ok: false, message: 'SQLite no pudo crear el administrador. No se guardaron cambios.' };
    }
  });

  ipcMain.handle('sicoven:auth-delete-seed', (_event, token) => {
    const actor = sessions.get(String(token || ''));
    if (!actor) return { ok: false, message: 'Sesión no válida.' };
    const total = db.prepare('SELECT COUNT(*) AS count FROM auth_users').get().count;
    const seed = db.prepare('SELECT id FROM auth_users WHERE username=? AND is_seed=1').get('admin');
    if (total < 2 || !seed) return { ok: false, message: 'El administrador semilla solo puede eliminarse después de crear otro administrador.' };
    db.prepare('DELETE FROM auth_users WHERE id=?').run(seed.id);
    db.prepare('INSERT INTO audit_events(event_type,details_json) VALUES(?,?)').run('seed_admin_deleted', JSON.stringify({ by: actor.username }));
    for (const [k, v] of sessions.entries()) if (v.id === seed.id) sessions.delete(k);
    return { ok: true };
  });

  ipcMain.handle('sicoven:load-state', () => {
    // No exponer datos contables si la instalación no tiene licencia autorizada.
    if (!licenseView().authorized) return null;
    const row = db.prepare('SELECT state_json FROM app_state WHERE state_key = ?').get('accounting');
    if (!row) return null;
    try { return JSON.parse(row.state_json); } catch { return null; }
  });

  ipcMain.handle('sicoven:save-state', (_event, state) => {
    const licensing = licenseView();
    if (!licensing.authorized) throw new Error(licensing.message || 'Licencia no autorizada.');
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
      if (!licenseView().authorized) throw new Error('Licencia no autorizada.');
      // El límite comercial se fija en el proceso principal; el renderer no puede elevarlo.
      event.returnValue = consumeDemoAction(db, moduleKey, 10);
    } catch {
      event.returnValue = { ok: false, error: 'No se pudo registrar la acción demo en SQLite' };
    }
  });

  await revalidateLicense();
  createWindow();

  licenseRecheckTimer = setInterval(async () => {
    const status = await revalidateLicense();
    if (!status.authorized) {
      sessions.clear();
      BrowserWindow.getAllWindows().forEach(win => win.webContents.send('sicoven:license-status-changed', status));
    }
  }, 60 * 60 * 1000);

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => {
  if (licenseRecheckTimer) clearInterval(licenseRecheckTimer);
  if (db) {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    db = null;
  }
});
