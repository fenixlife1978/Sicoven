const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const login = read('src/components/LoginScreen.tsx');
assert.match(login, /El acceso web no está habilitado/);
assert.doesNotMatch(login, /onLogin\(['"]session-token['"]/);

const app = read('src/App.tsx');
assert.match(app, /restoreSession\(token\)/);
assert.match(app, /if \(!auth\) return/);
assert.ok(app.indexOf('if (!auth) return') < app.lastIndexOf('<AccountingProvider token={auth.token}>'),
  'AccountingProvider must mount only after authentication');

const main = read('electron/main.cjs');
assert.match(main, /CREATE TABLE IF NOT EXISTS auth_sessions/);
assert.match(main, /sicoven:auth-restore/);
assert.match(main, /DELETE FROM auth_sessions WHERE token_hash=\?/);
assert.match(main, /actor\.role !== 'admin'/);
assert.match(main, /sicoven:load-state', \(_event, token\)/);
const persistence = read('electron/accounting-persistence.cjs');
assert.match(main, /registerAccountingPersistenceHandler\(\{ ipcMain, db, licenseView, getActiveSession \}\)/);
assert.match(persistence, /ipcMain\.handle\('sicoven:save-state', \(_event, token, state\)/);
assert.match(persistence, /if \(!licensing\.authorized\)/);
assert.match(persistence, /if \(!getActiveSession\(token\)\)/);
assert.match(persistence, /persistAccountingSnapshot\(db, state\)/);

assert.match(main, /function getActiveSession/);
assert.match(main, /expiry <= Date/);
assert.match(main, /!licenseView/);

const admins = read('src/components/AdminUsers.tsx');
assert.doesNotMatch(admins, /sicoven_web_admin_users/);
assert.doesNotMatch(admins, /localStorage\.setItem\(WEB_ADMINS_STORAGE_KEY/);

const preload = read('electron/preload.cjs');
assert.match(preload, /restoreSession: \(token\) => ipcRenderer\.invoke\('sicoven:auth-restore', token\)/);

console.log('SICOVEN auth hardening checks passed.');
