"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const electron_1 = require("electron");
const database_1 = require("./database");
const target_1 = require("./target");
const tracker_1 = require("./tracker");
const twitcasting_1 = require("./twitcasting");
let mainWindow = null;
let db;
let api;
let tracker;
function relayStatus() {
    return {
        connected: true,
        account: null,
        callbackUrl: '',
        secureStorageAvailable: true,
        appClientConfigured: true,
    };
}
function buildDashboard(userId) {
    const trackedUsers = db.listTrackedUsers();
    const trackerUserId = tracker.getStatus().trackedUserId;
    const selectedUser = userId
        ? db.getTrackedUser(userId)
        : trackerUserId
            ? db.getTrackedUser(trackerUserId)
            : trackedUsers[0] ?? null;
    let liveMovie = null;
    let metrics = [];
    let comments = [];
    if (selectedUser) {
        liveMovie = trackerUserId === selectedUser.userId ? tracker.getLiveMovie() : null;
        const stream = liveMovie
            ? { movieId: liveMovie.id }
            : db.getLatestStreamForUser(selectedUser.userId);
        if (stream) {
            metrics = db.getRecentMetrics(stream.movieId, 180);
            comments = db.getRecentComments(stream.movieId, 300);
        }
    }
    return {
        trackedUsers,
        auth: relayStatus(),
        tracker: tracker.getStatus(),
        selectedUser,
        liveMovie,
        metrics,
        comments,
    };
}
function sendTerminal(event) {
    if (!mainWindow?.isDestroyed())
        mainWindow?.webContents.send('terminal:event', event);
}
async function clipboardTwitCastingTarget() {
    const raw = (await electron_1.clipboard.readText()).trim();
    if (!raw || raw.length > 2048 || !/twitcasting\.tv/i.test(raw))
        return null;
    try {
        return (0, target_1.parseTwitCastingTarget)(raw).originalInput;
    }
    catch {
        return null;
    }
}
function registerIpc() {
    electron_1.ipcMain.handle('app:get-bootstrap', async () => buildDashboard());
    electron_1.ipcMain.handle('data:get-dashboard', async (_event, userId) => buildDashboard(userId));
    electron_1.ipcMain.handle('relay:status', async () => ({
        ok: await api.health(),
        baseUrl: api.getRelayBaseUrl(),
    }));
    electron_1.ipcMain.handle('tracker:start-input', async (_event, rawInput) => {
        const parsed = (0, target_1.parseTwitCastingTarget)(String(rawInput ?? ''));
        sendTerminal({
            id: `input-${Date.now()}`,
            at: Math.floor(Date.now() / 1000),
            kind: 'system',
            label: 'INPUT',
            message: `URLを確認：${parsed.originalInput}`,
        });
        const user = await api.getUser(parsed.screenIdOrUserId);
        const target = db.upsertTrackedUser(user);
        sendTerminal({
            id: `resolve-${Date.now()}`,
            at: Math.floor(Date.now() / 1000),
            kind: 'system',
            label: 'RESOLVE',
            message: `配信者を確認：@${user.screen_id}`,
            detail: `${user.name} · fixed uid:${user.id}`,
        });
        await tracker.start(target);
        return { dashboard: buildDashboard(target.userId), target };
    });
    electron_1.ipcMain.handle('tracker:start-user', async (_event, userId) => {
        const stored = db.getTrackedUser(String(userId ?? ''));
        if (!stored)
            throw new Error('最近つないだ配信に対象ユーザーが見つかりません。');
        const latestIdentity = await api.getUser(stored.userId);
        const target = db.upsertTrackedUser(latestIdentity);
        return tracker.start(target);
    });
    electron_1.ipcMain.handle('tracker:stop', async () => tracker.stop());
    electron_1.ipcMain.handle('tracked:remove', async (_event, userId) => {
        const normalized = String(userId ?? '');
        if (tracker.getStatus().trackedUserId === normalized)
            tracker.stop();
        db.removeTrackedUser(normalized);
    });
    electron_1.ipcMain.handle('clipboard:get-twitcasting-target', async () => await clipboardTwitCastingTarget());
    electron_1.ipcMain.handle('thumbnail:get-live', async (_event, userId) => {
        const normalized = String(userId ?? '').trim();
        if (!normalized || normalized.length > 180)
            return null;
        return api.getLiveThumbnailDataUrl(normalized);
    });
    electron_1.ipcMain.handle('open:external', async (_event, rawUrl) => {
        const parsed = new URL(String(rawUrl ?? ''));
        const allowed = parsed.protocol === 'https:' && (parsed.hostname === 'twitcasting.tv'
            || parsed.hostname.endsWith('.twitcasting.tv')
            || parsed.hostname === 'github.com');
        if (!allowed)
            throw new Error('許可されていない外部URLです。');
        await electron_1.shell.openExternal(parsed.toString());
    });
}
async function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1540,
        height: 980,
        minWidth: 1120,
        minHeight: 760,
        backgroundColor: '#0d1230',
        title: 'CASPULSE',
        webPreferences: {
            preload: node_path_1.default.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const parsed = new URL(url);
            if (parsed.protocol === 'https:' && (parsed.hostname === 'twitcasting.tv'
                || parsed.hostname.endsWith('.twitcasting.tv')
                || parsed.hostname === 'github.com'))
                void electron_1.shell.openExternal(parsed.toString());
        }
        catch {
            // Ignore malformed external links.
        }
        return { action: 'deny' };
    });
    const devServer = process.env.VITE_DEV_SERVER_URL;
    if (devServer)
        await mainWindow.loadURL(devServer);
    else
        await mainWindow.loadFile(node_path_1.default.join(__dirname, '../../dist/index.html'));
}
electron_1.app.whenReady().then(async () => {
    electron_1.app.setAppUserModelId('app.caspulse.desktop');
    db = new database_1.DatabaseService(electron_1.app.getPath('userData'));
    api = new twitcasting_1.TwitCastingClient();
    tracker = new tracker_1.TrackerService(api, db);
    tracker.on('update', (update) => {
        if (!mainWindow?.isDestroyed())
            mainWindow?.webContents.send('tracker:update', update);
    });
    tracker.on('terminal', (event) => sendTerminal(event));
    registerIpc();
    await createWindow();
    electron_1.app.on('activate', async () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            await createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
electron_1.app.on('before-quit', () => {
    tracker?.stop(false);
    db?.close();
});
//# sourceMappingURL=main.js.map