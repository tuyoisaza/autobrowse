import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let runtimeProcess: ChildProcess | null = null;
let tray: Tray | null = null;
let isQuitting = false;

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

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADfSURBVDiNpZMxDoJAEEXfLhZQGO/AUmygnsDKA9h6Ag9g4Qk8gYUn0MNKbCyFGDDG7CZZXYwpd/Nm8mcy829nZwH+qoC6q8wCmAGH+gfXAD7AYBdw7gFsJqCdY0YCeCWAywTwlAAuE8BTAvjKArhMAN8JYCWAywTwlQBWCWB9A/hJANcCWCWAVQJYJYBVAlj1A/hJANcJ4DoBXCeA6wRwnQCuE8B1ArhOj66DdQK4To+ug3UCuE4AVwngdN3dHf0Cq7h+V3f+AL5dN2L3D3KkAAAAAElFTkSuQmCC');
  
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open AutoBrowse',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'New Task',
      click: () => {
        console.log('New task clicked');
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('AutoBrowse');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
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
      PORT: '5847'
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
  createTray();
  
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
