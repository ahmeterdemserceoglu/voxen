const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('voxenDesktop', {
  windowAction(action) {
    if (['minimize', 'maximize', 'close'].includes(action)) ipcRenderer.send('voxen:window-action', action);
  },
});
