const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const plateOcr = require('./plate-ocr');
const jobs = require('./jobs');
const textOcr = require('./text-ocr');

const WIDTH = 938;
const HEIGHT = 166;

let win = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    minWidth: 600,
    minHeight: 140,
    frame: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#191919',
    title: 'Screenshot OCR',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenu(null);
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.loadFile('index.html');

  ipcMain.on('win:minimize', () => win.minimize());
  ipcMain.on('win:close', () => win.close());
  ipcMain.handle('plate:spec', () => plateOcr.plateInputSpec());
  ipcMain.handle('plate:ocr', (_e, rgb) => plateOcr.recognizePlate(rgb));
  plateOcr.warmUp();
  ipcMain.handle('text:ocr', (_e, img) => textOcr.recognizeText(img));
  textOcr.warmUp();
  jobs.register(() => win);

  ipcMain.handle('win:toggle-top', () => {
    const on = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(on, 'floating');
    return on;
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
