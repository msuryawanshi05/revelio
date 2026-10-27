const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('revelio', {
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  setPinned: (pinned) => ipcRenderer.send('window:pin', pinned),
  startAudio: () => ipcRenderer.invoke('audio:start'),
  stopAudio: () => ipcRenderer.invoke('audio:stop'),
  audioStatus: () => ipcRenderer.invoke('audio:status'),
  onTranscript: (cb) => on('transcript:new', cb),
  onAudioStatus: (cb) => on('audio:status', cb),
});

// Returns an unsubscribe function so React effects can clean up.
function on(channel, cb) {
  const listener = (_e, data) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
