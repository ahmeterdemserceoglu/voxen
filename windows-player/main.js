const path = require('path');
const { app, BrowserWindow, shell, ipcMain } = require('electron');

let mainWindow;
let localServer;

async function createWindow() {
  // Browser storage (including Firebase Auth) belongs to an origin. Keep it stable.
  process.env.VOXEN_PLAYER_PORT = process.env.VOXEN_PLAYER_PORT || '48731';
  process.env.VOXEN_WEB_ROOT = app.isPackaged
    ? path.join(process.resourcesPath, 'web')
    : path.join(__dirname, '..', 'dist-windows');
  process.env.VOXEN_DATA_ROOT = path.join(app.getPath('userData'), 'media');

  const backend = require('./server');
  localServer = backend.server;
  const address = await backend.startServer();
  const localOrigin = `http://127.0.0.1:${address.port}`;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== localOrigin) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  await mainWindow.loadURL(localOrigin);
  mainWindow.maximize();
  mainWindow.show();
  void backend.warmAudioResolver();
}

const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
else app.whenReady().then(createWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('second-instance', () => {
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.focus();
});

ipcMain.on('voxen:window-action', (event, action) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return;
  if (action === 'minimize') mainWindow.minimize();
  else if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  else if (action === 'close') mainWindow.close();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  if (localServer?.listening) localServer.close();
});
