const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('revelio', {
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  setPinned: (pinned) => ipcRenderer.send('window:pin', pinned),
});
