const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sicovenStore', Object.freeze({
  getLicenseStatus: () => ipcRenderer.invoke('sicoven:license-status'),
  activateLicense: (key) => ipcRenderer.invoke('sicoven:license-activate', key),
  revalidateLicense: () => ipcRenderer.invoke('sicoven:license-revalidate'),
  onLicenseStatusChanged: (callback) => { const listener = (_event, status) => callback(status); ipcRenderer.on('sicoven:license-status-changed', listener); return () => ipcRenderer.removeListener('sicoven:license-status-changed', listener); },
  getAuthSetupStatus: () => ipcRenderer.invoke('sicoven:auth-setup-status'),
  initializeAdmin: (input) => ipcRenderer.invoke('sicoven:auth-initialize', input),
  login: (credentials) => ipcRenderer.invoke('sicoven:auth-login', credentials),
  restoreSession: (token) => ipcRenderer.invoke('sicoven:auth-restore', token),
  logout: (token) => ipcRenderer.invoke('sicoven:auth-logout', token),
  listAdmins: (token) => ipcRenderer.invoke('sicoven:auth-list-admins', token),
  createAdmin: (token, input) => ipcRenderer.invoke('sicoven:auth-create-admin', token, input),
  deleteSeedAdmin: (token) => ipcRenderer.invoke('sicoven:auth-delete-seed', token),
  load: (token) => ipcRenderer.invoke('sicoven:load-state', token),
  listAuditEvents: (token, limit) => ipcRenderer.invoke('sicoven:audit-list', token, limit),
  save: (token, state) => ipcRenderer.invoke('sicoven:save-state', token, state),
  reopenAccountingPeriod: (token, input) => ipcRenderer.invoke('sicoven:reopen-accounting-period', token, input),
  resetAccounting: (token) => ipcRenderer.invoke('sicoven:reset-accounting', token)
}));
