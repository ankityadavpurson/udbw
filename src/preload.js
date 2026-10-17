const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workbench', {
  connect: (payload) => ipcRenderer.invoke('db:connect', payload),
  disconnect: (payload) => ipcRenderer.invoke('db:disconnect', payload),
  query: (payload) => ipcRenderer.invoke('db:query', payload),
  pickServiceAccount: () => ipcRenderer.invoke('db:pick-service-account')
});
