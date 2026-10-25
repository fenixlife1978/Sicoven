const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sicovenStore', Object.freeze({
  getLicenseStatus: () => ipcRenderer.invoke('sicoven:license-status'),
  activateLicense: (key) => ipcRenderer.invoke('sicoven:license-activate', key),
  revalidateLicense: () => ipcRenderer.invoke('sicoven:license-revalidate'),
  onLicenseStatusChanged: (callback) => { const listener = (_event, status) => callback(status); ipcRenderer.on('sicoven:license-status-changed', listener); return () => ipcRenderer.removeListener('sicoven:license-status-changed', listener); },
  login: (credentials) => ipcRenderer.invoke('sicoven:auth-login', credentials),
  restoreSession: (token) => ipcRenderer.invoke('sicoven:auth-restore', token),
  logout: (token) => ipcRenderer.invoke('sicoven:auth-logout', token),
  listAdmins: (token) => ipcRenderer.invoke('sicoven:auth-list-admins', token),
  createAdmin: (token, input) => ipcRenderer.invoke('sicoven:auth-create-admin', token, input),
  deleteSeedAdmin: (token) => ipcRenderer.invoke('sicoven:auth-delete-seed', token),
  load: (token) => ipcRenderer.invoke('sicoven:load-state', token),
  save: (token, state) => ipcRenderer.invoke('sicoven:save-state', token, state),
  getDemoUsage: () => ipcRenderer.sendSync('sicoven:demo-get-usage'),
  consumeDemoAction: (moduleKey) => ipcRenderer.sendSync('sicoven:demo-consume-action', moduleKey)
}));
