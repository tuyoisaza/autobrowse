import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  onRuntimeLog: (callback: (log: string) => void) => {
    ipcRenderer.on('runtime-log', (_event, log) => callback(log));
  }
});