const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sicovenStore', Object.freeze({
  load: () => ipcRenderer.invoke('sicoven:load-state'),
  save: (state) => ipcRenderer.invoke('sicoven:save-state', state)
}));
