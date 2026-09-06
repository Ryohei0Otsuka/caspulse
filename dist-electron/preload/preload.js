"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    getBootstrap: () => electron_1.ipcRenderer.invoke('app:get-bootstrap'),
    authStart: () => electron_1.ipcRenderer.invoke('auth:start'),
    authImportToken: (token) => electron_1.ipcRenderer.invoke('auth:import-token', token),
    authDisconnect: () => electron_1.ipcRenderer.invoke('auth:disconnect'),
    startTrackingInput: (input) => electron_1.ipcRenderer.invoke('tracker:start-input', input),
    startTrackingUser: (userId) => electron_1.ipcRenderer.invoke('tracker:start-user', userId),
    stopTracking: () => electron_1.ipcRenderer.invoke('tracker:stop'),
    removeTrackedUser: (userId) => electron_1.ipcRenderer.invoke('tracked:remove', userId),
    getDashboard: (userId) => electron_1.ipcRenderer.invoke('data:get-dashboard', userId),
    getClipboardTwitCastingTarget: () => electron_1.ipcRenderer.invoke('clipboard:get-twitcasting-target'),
    getLiveThumbnail: (userId) => electron_1.ipcRenderer.invoke('thumbnail:get-live', userId),
    openExternal: (url) => electron_1.ipcRenderer.invoke('open:external', url),
    onTrackerUpdate: (listener) => {
        const wrapped = (_event, update) => listener(update);
        electron_1.ipcRenderer.on('tracker:update', wrapped);
        return () => electron_1.ipcRenderer.removeListener('tracker:update', wrapped);
    },
    onTerminalEvent: (listener) => {
        const wrapped = (_event, event) => listener(event);
        electron_1.ipcRenderer.on('terminal:event', wrapped);
        return () => electron_1.ipcRenderer.removeListener('terminal:event', wrapped);
    },
};
electron_1.contextBridge.exposeInMainWorld('caspulse', api);
//# sourceMappingURL=preload.js.map