import { contextBridge, ipcRenderer } from 'electron';
import type { CaspulseApi, TerminalEvent, TrackerUpdate } from '../shared/types';

const api: CaspulseApi = {
  getBootstrap: () => ipcRenderer.invoke('app:get-bootstrap'),
  getRelayStatus: () => ipcRenderer.invoke('relay:status'),
  getCommentAuthStatus: () => ipcRenderer.invoke('comment-auth:get-status'),
  connectCommentAuth: () => ipcRenderer.invoke('comment-auth:connect'),
  disconnectCommentAuth: () => ipcRenderer.invoke('comment-auth:disconnect'),
  postComment: (movieId, comment) => ipcRenderer.invoke('comment:post', movieId, comment),
  startTrackingInput: (input) => ipcRenderer.invoke('tracker:start-input', input),
  startTrackingUser: (userId) => ipcRenderer.invoke('tracker:start-user', userId),
  stopTracking: () => ipcRenderer.invoke('tracker:stop'),
  removeTrackedUser: (userId) => ipcRenderer.invoke('tracked:remove', userId),
  getDashboard: (userId) => ipcRenderer.invoke('data:get-dashboard', userId),
  getClipboardTwitCastingTarget: () => ipcRenderer.invoke('clipboard:get-twitcasting-target'),
  getLiveThumbnail: (userId) => ipcRenderer.invoke('thumbnail:get-live', userId),
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
