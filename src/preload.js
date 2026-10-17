const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workbench', {
  loadConnections: () => ipcRenderer.invoke('connections:load'),
  saveConnections: (profiles) => ipcRenderer.invoke('connections:save', profiles),
  test: payload => ipcRenderer.invoke('db:test', payload),
  discover: (payload) => ipcRenderer.invoke('db:discover', payload),
  switchDatabase: (payload) => ipcRenderer.invoke('db:switch-database', payload),
  connect: (payload) => ipcRenderer.invoke('db:connect', payload),
  disconnect: (payload) => ipcRenderer.invoke('db:disconnect', payload),
  query: (payload) => ipcRenderer.invoke('db:query', payload),
  mutate: (payload) => ipcRenderer.invoke('db:mutate', payload),
  pickServiceAccount: () => ipcRenderer.invoke('db:pick-service-account'),
  pickSshKey: () => ipcRenderer.invoke('db:pick-ssh-key'),
  appReady: () => ipcRenderer.send('app:ready'),
  reportTheme: theme => ipcRenderer.send('theme:report', theme),
  onSetTheme: callback => {
    const handler = (_event, mode) => callback(mode);
    ipcRenderer.on('theme:set', handler);
    return () => ipcRenderer.removeListener('theme:set', handler);
  }
});
