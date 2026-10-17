const { app, BrowserWindow } = require('electron');
const windowState = require('./main/window');
const { registerIpc } = require('./main/ipc');
const sessions = require('./main/sessions');

registerIpc();

app.whenReady().then(() => {
  windowState.hardenWebContents();
  windowState.buildAppMenu();
  windowState.createSplash();
  windowState.createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) windowState.createWindow();
  });
});

// Quit is held back (once) until sessions and SSH tunnels are closed, with a cap so a hung server cannot block exit.
let quitting = false;
app.on('before-quit', event => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  Promise.race([sessions.closeAll(), new Promise(resolve => setTimeout(resolve, 3000))]).finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
