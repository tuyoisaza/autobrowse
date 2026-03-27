import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import * as https from 'https';
import * as http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let runtimeProcess: ChildProcess | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const cliInstruction = process.argv.find(a => a.startsWith('--instruction='))?.split('=')[1] || process.env.AUTOBROWSE_INSTRUCTION;

function waitForServer(port: number, timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      const req = (port === 443 ? https : http).get(`http://127.0.0.1:${port}/health`, (res) => {
        if (res.statusCode === 200) resolve();
        else retry();
      });
      req.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - startTime > timeout) reject(new Error('Timeout'));
      else setTimeout(check, 500);
    };
    check();
  });
}

async function runCliInstruction(instruction: string) {
  console.log('[CLI] Running instruction:', instruction);
  await waitForServer(5847);
  
  const data = JSON.stringify({ instruction });
  const req = http.request({
    hostname: '127.0.0.1',
    port: 5847,
    path: '/prompt',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('[CLI] Result:', body);
      app.quit();
    });
  });
  req.write(data);
  req.end();
}

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
    mainWindow.loadURL('http://127.0.0.1:5847');
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

app.whenReady().then(async () => {
  if (cliInstruction) {
    startRuntime();
    await waitForServer(5847, 60000);
    await runCliInstruction(cliInstruction);
    return;
  }
  
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

ipcMain.handle('get-api-port', () => 5847);

ipcMain.handle('get-app-path', () => {
  return app.getPath('userData');
});
