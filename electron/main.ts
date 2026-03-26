import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let runtimeProcess: ChildProcess | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'AutoBrowse - Local Browser Agent',
    backgroundColor: '#1a1a2e',
    show: false
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:3847');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startRuntime() {
  const runtimeScript = isDev 
    ? path.join(__dirname, '../src/index.ts')
    : path.join(process.resourcesPath, 'app/src/index.ts');
    
  console.log('[Electron] Starting runtime:', runtimeScript);

  runtimeProcess = spawn('npx', ['tsx', runtimeScript], {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
    env: { 
      ...process.env, 
      NODE_ENV: isDev ? 'development' : 'production',
      ELECTRON: 'true',
      API_PORT: '4847'
    }
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
  }, 2000);
  
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

ipcMain.handle('get-api-port', () => 3847);

ipcMain.handle('get-app-path', () => {
  return app.getPath('userData');
});