const path = require('path');
const { app, BrowserWindow, shell } = require('electron');

let mainWindow;
let localServer;

async function createWindow() {
  process.env.VOXEN_PLAYER_PORT = '0';
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
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    fullscreenable: true,
    webPreferences: {
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
    if (!url.startsWith(localOrigin)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  await mainWindow.loadURL(localOrigin);
  mainWindow.maximize();
  mainWindow.show();
}

app.whenReady().then(createWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  if (localServer?.listening) localServer.close();
});
