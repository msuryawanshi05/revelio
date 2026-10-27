const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

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

app.whenReady().then(createWindow);
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
