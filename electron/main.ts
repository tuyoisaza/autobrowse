import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

let mainWindow: BrowserWindow | null = null;
let runtimeProcess: ChildProcess | null = null;

const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'AutoBrowse',
    backgroundColor: '#1a1a1a'
  });
  
  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:3847');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startRuntime() {
  const runtimePath = isDev 
    ? path.join(__dirname, '../../dist/index.js')
    : path.join(process.resourcesPath, 'app/dist/index.js');
    
  console.log('[Electron] Starting runtime:', runtimePath);
  
  runtimeProcess = spawn('node', [runtimePath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: isDev ? 'development' : 'production' }
  });
  
  runtimeProcess.stdout?.on('data', (data) => {
    const msg = data.toString();
    console.log('[Runtime]', msg);
    mainWindow?.webContents.send('runtime-log', msg);
  });
  
  runtimeProcess.stderr?.on('data', (data) => {
    console.error('[Runtime Error]', data.toString());
  });
  
  runtimeProcess.on('error', (err) => {
    console.error('[Electron] Runtime failed to start:', err);
  });
  
  runtimeProcess.on('exit', (code) => {
    console.log('[Electron] Runtime exited with code:', code);
  });
}

app.whenReady().then(() => {
  createWindow();
  
  setTimeout(() => {
    startRuntime();
  }, 1000);
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (runtimeProcess) {
    runtimeProcess.kill();
    runtimeProcess = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('open-external', (_event, url: string) => {
  shell.openExternal(url);
});