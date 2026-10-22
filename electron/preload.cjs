const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sicovenStore', Object.freeze({
  login: (credentials) => ipcRenderer.invoke('sicoven:auth-login', credentials),
  logout: (token) => ipcRenderer.invoke('sicoven:auth-logout', token),
  listAdmins: (token) => ipcRenderer.invoke('sicoven:auth-list-admins', token),
  createAdmin: (token, input) => ipcRenderer.invoke('sicoven:auth-create-admin', token, input),
  deleteSeedAdmin: (token) => ipcRenderer.invoke('sicoven:auth-delete-seed', token),
  load: () => ipcRenderer.invoke('sicoven:load-state'),
  save: (state) => ipcRenderer.invoke('sicoven:save-state', state),
  getDemoUsage: () => ipcRenderer.sendSync('sicoven:demo-get-usage'),
  consumeDemoAction: (moduleKey) => ipcRenderer.sendSync('sicoven:demo-consume-action', moduleKey)
}));
