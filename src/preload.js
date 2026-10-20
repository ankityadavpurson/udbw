const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workbench', {
  isDev: process.argv.includes('--udbw-dev'),
  loadConnections: () => ipcRenderer.invoke('connections:load'),
  saveConnections: profiles => ipcRenderer.invoke('connections:save', profiles),
  test: payload => ipcRenderer.invoke('db:test', payload),
  discover: payload => ipcRenderer.invoke('db:discover', payload),
  switchDatabase: payload => ipcRenderer.invoke('db:switch-database', payload),
  connect: payload => ipcRenderer.invoke('db:connect', payload),
  revealSecret: payload => ipcRenderer.invoke('connections:reveal-secret', payload),
  disconnect: payload => ipcRenderer.invoke('db:disconnect', payload),
  query: payload => ipcRenderer.invoke('db:query', payload),
  mutateBatch: payload => ipcRenderer.invoke('db:mutate-batch', payload),
  mutate: payload => ipcRenderer.invoke('db:mutate', payload),
  cancel: payload => ipcRenderer.invoke('db:cancel', payload),
  describe: payload => ipcRenderer.invoke('db:describe', payload),
  pickServiceAccount: () => ipcRenderer.invoke('db:pick-service-account'),
  saveFile: payload => ipcRenderer.invoke('file:save', payload),
  pickSshKey: () => ipcRenderer.invoke('db:pick-ssh-key'),
  logError: entry => ipcRenderer.send('log:renderer', entry),
  appReady: () => ipcRenderer.send('app:ready'),
  onAskDiscard: callback => {
    const handler = (_event, count) => callback(count);
    ipcRenderer.on('unsaved:ask', handler);
    return () => ipcRenderer.removeListener('unsaved:ask', handler);
  },
  answerDiscard: ok => ipcRenderer.send('unsaved:answer', ok === true),
  onUpdateNotice: callback => {
    const handler = (_event, notice) => callback(notice);
    ipcRenderer.on('update:show', handler);
    return () => ipcRenderer.removeListener('update:show', handler);
  },
  onUpdateToast: callback => {
    const handler = (_event, toast) => callback(toast);
    ipcRenderer.on('update:toast', handler);
    return () => ipcRenderer.removeListener('update:toast', handler);
  },
  updateToastState: () => ipcRenderer.invoke('update:toast-state'),
  downloadUpdate: () => ipcRenderer.send('update:download'),
  installUpdate: () => ipcRenderer.send('update:install'),
  dismissUpdate: () => ipcRenderer.send('update:dismiss'),
  answerUpdate: choice => ipcRenderer.send('update:answer', choice),
  checkForUpdates: () => ipcRenderer.send('app:check-updates'),
  appVersion: () => ipcRenderer.invoke('app:version'),
  reportUnsaved: count => ipcRenderer.send('unsaved:report', count),
  reportTheme: theme => ipcRenderer.send('theme:report', theme),
  onSetTheme: callback => {
    const handler = (_event, mode) => callback(mode);
    ipcRenderer.on('theme:set', handler);
    return () => ipcRenderer.removeListener('theme:set', handler);
  }
});
