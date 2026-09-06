"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAUTH_CALLBACK_URL = void 0;
const node_path_1 = __importDefault(require("node:path"));
const electron_1 = require("electron");
const database_1 = require("./database");
const oauth_1 = require("./oauth");
Object.defineProperty(exports, "OAUTH_CALLBACK_URL", { enumerable: true, get: function () { return oauth_1.OAUTH_CALLBACK_URL; } });
const target_1 = require("./target");
const tracker_1 = require("./tracker");
const twitcasting_1 = require("./twitcasting");
const COMMENT_TOKEN_SETTING = 'comment_access_token_encrypted_v1';
let mainWindow = null;
let db;
let api;
let tracker;
let commentAccessToken = null;
let commentAccount = null;
function relayStatus() {
    return {
        connected: true,
        account: null,
        callbackUrl: '',
        secureStorageAvailable: true,
        appClientConfigured: true,
    };
}
function commentAuthStatus() {
    return {
        connected: Boolean(commentAccessToken && commentAccount),
        account: commentAccount,
        secureStorageAvailable: electron_1.safeStorage.isEncryptionAvailable(),
    };
}
function clearStoredCommentAuth() {
    commentAccessToken = null;
    commentAccount = null;
    db.deleteSetting(COMMENT_TOKEN_SETTING);
}
function persistCommentToken(token) {
    commentAccessToken = token;
    if (!electron_1.safeStorage.isEncryptionAvailable())
        return;
    const encrypted = electron_1.safeStorage.encryptString(token).toString('base64');
    db.setSetting(COMMENT_TOKEN_SETTING, encrypted);
}
async function restoreCommentAuth() {
    commentAccessToken = null;
    commentAccount = null;
    if (!electron_1.safeStorage.isEncryptionAvailable())
        return;
    const encoded = db.getSetting(COMMENT_TOKEN_SETTING);
    if (!encoded)
        return;
    try {
        const token = electron_1.safeStorage.decryptString(Buffer.from(encoded, 'base64'));
        const account = await api.verifyUserToken(token);
        commentAccessToken = token;
        commentAccount = account;
    }
    catch (error) {
        // A temporary network failure must not erase a still-valid local token.
        if (error instanceof twitcasting_1.TwitCastingApiError && error.status === 401)
            clearStoredCommentAuth();
        else {
            commentAccessToken = null;
            commentAccount = null;
        }
    }
}
function buildDashboard(userId) {
    const trackerUserId = tracker.getStatus().trackedUserId;
    const selectedUser = userId
        ? db.getTrackedUser(userId)
        : trackerUserId
            ? db.getTrackedUser(trackerUserId)
            : null;
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
            comments = db.getRecentComments(stream.movieId, 500);
        }
    }
    return {
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
    electron_1.ipcMain.handle('comment-auth:get-status', async () => commentAuthStatus());
    electron_1.ipcMain.handle('comment-auth:connect', async () => {
        const clientId = await api.getOAuthClientId();
        const token = await (0, oauth_1.runImplicitOAuth)(clientId);
        const account = await api.verifyUserToken(token);
        persistCommentToken(token);
        commentAccount = account;
        sendTerminal({
            id: `comment-auth-${Date.now()}`,
            at: Math.floor(Date.now() / 1000),
            kind: 'system',
            label: 'AUTH',
            message: `コメント投稿を @${account.screen_id} で連携しました。`,
        });
        return commentAuthStatus();
    });
    electron_1.ipcMain.handle('comment-auth:disconnect', async () => {
        const previous = commentAccount?.screen_id;
        clearStoredCommentAuth();
        if (previous) {
            sendTerminal({
                id: `comment-auth-off-${Date.now()}`,
                at: Math.floor(Date.now() / 1000),
                kind: 'system',
                label: 'AUTH',
                message: `コメント投稿の連携を解除しました。`,
            });
        }
        return commentAuthStatus();
    });
    electron_1.ipcMain.handle('comment:post', async (_event, rawMovieId, rawComment) => {
        const movieId = String(rawMovieId ?? '').trim();
        const comment = String(rawComment ?? '').trim();
        const activeMovieId = tracker.getStatus().activeMovieId;
        if (!commentAccessToken || !commentAccount)
            throw new Error('コメントするにはツイキャス連携が必要です。');
        if (!tracker.getStatus().isLive || !activeMovieId || activeMovieId !== movieId) {
            throw new Error('配信中のライブに接続してからコメントしてください。');
        }
        if (comment.length < 1 || comment.length > 140)
            throw new Error('コメントは1〜140文字で入力してください。');
        try {
            const result = await api.postComment(movieId, commentAccessToken, comment);
            const inserted = db.insertComments(movieId, [result.comment]);
            const stored = inserted[0] ?? null;
            sendTerminal({
                id: `posted-${result.comment.id}`,
                at: result.comment.created,
                kind: 'comment',
                label: 'POST',
                message: `@${result.comment.from_user.screen_id}：${result.comment.message}`,
                detail: `cid:${result.comment.id}`,
            });
            return { movieId: result.movie_id, allCount: result.all_count, comment: stored };
        }
        catch (error) {
            if (error instanceof twitcasting_1.TwitCastingApiError && (error.status === 401 || error.code === 2005)) {
                clearStoredCommentAuth();
            }
            throw error;
        }
    });
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
    electron_1.ipcMain.handle('tracker:stop', async () => tracker.stop());
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
        width: 1460,
        height: 900,
        minWidth: 1060,
        minHeight: 700,
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
    await restoreCommentAuth();
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