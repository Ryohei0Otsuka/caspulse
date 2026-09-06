import { contextBridge, ipcRenderer } from 'electron';
import type { CaspulseApi, TerminalEvent, TrackerUpdate } from '../shared/types';

const api: CaspulseApi = {
  getBootstrap: () => ipcRenderer.invoke('app:get-bootstrap'),
  authStart: (clientId) => ipcRenderer.invoke('auth:start', clientId),
  authImportToken: (token) => ipcRenderer.invoke('auth:import-token', token),
  authDisconnect: () => ipcRenderer.invoke('auth:disconnect'),
  startTrackingInput: (input) => ipcRenderer.invoke('tracker:start-input', input),
  startTrackingUser: (userId) => ipcRenderer.invoke('tracker:start-user', userId),
  stopTracking: () => ipcRenderer.invoke('tracker:stop'),
  removeTrackedUser: (userId) => ipcRenderer.invoke('tracked:remove', userId),
  getDashboard: (userId) => ipcRenderer.invoke('data:get-dashboard', userId),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  onTrackerUpdate: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, update: TrackerUpdate) => listener(update);
    ipcRenderer.on('tracker:update', wrapped);
    return () => ipcRenderer.removeListener('tracker:update', wrapped);
  },
  onTerminalEvent: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, event: TerminalEvent) => listener(event);
    ipcRenderer.on('terminal:event', wrapped);
    return () => ipcRenderer.removeListener('terminal:event', wrapped);
  },
};

contextBridge.exposeInMainWorld('caspulse', api);
