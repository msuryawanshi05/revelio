const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { Transcriber } = require('@revelio/transcriber');
const { createPipeline, getSources } = require('./audio');

// shortcut: dev only loads the Next.js dev server; packaged builds will load a static export (Phase 2).
const UI_URL = process.env.REVELIO_URL || 'http://localhost:3000';

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    title: 'Revelio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.loadURL(UI_URL);
}

ipcMain.on('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.on('window:pin', (e, pinned) => BrowserWindow.fromWebContents(e.sender)?.setAlwaysOnTop(!!pinned, 'floating'));

const broadcast = (channel, data) => BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(channel, data));
const transcriber = new Transcriber();
const audio = createPipeline({
  transcriber,
  onTranscript: (entry) => broadcast('transcript:new', entry),
  onStatus: (status) => broadcast('audio:status', status),
});
transcriber.on('error', (err) => audio.fail(err));

ipcMain.handle('audio:start', (_e, opts) => audio.start(opts));
ipcMain.handle('audio:getSources', () => getSources());
ipcMain.on('audio:pcm', (_e, source, pcm) => audio.feed(source, pcm));
ipcMain.on('audio:capture-error', (_e, source, message) => audio.feedError(source, message));
ipcMain.handle('audio:stop', () => audio.stop());
ipcMain.handle('audio:status', () => audio.status());

app.whenReady().then(createWindow);
app.on('will-quit', () => { audio.stop(); transcriber.stop(); });
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
