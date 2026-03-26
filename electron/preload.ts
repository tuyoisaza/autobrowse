import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  getApiPort: () => ipcRenderer.invoke('get-api-port'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  onRuntimeLog: (callback: (log: string) => void) => {
    ipcRenderer.on('runtime-log', (_event, log) => callback(log));
  }
});

declare global {
  interface Window {
    electronAPI: {
      getVersion: () => Promise<string>;
      openExternal: (url: string) => Promise<void>;
      getApiPort: () => Promise<number>;
      getAppPath: () => Promise<string>;
      onRuntimeLog: (callback: (log: string) => void) => void;
    };
  }
}