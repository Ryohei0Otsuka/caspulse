import path from 'node:path';
import { app, BrowserWindow, clipboard, ipcMain, safeStorage, shell } from 'electron';
import type {
  CommentAuthStatus,
  DashboardPayload,
  PostCommentResult,
  StartTrackingResult,
  StoredComment,
  StreamMetric,
  TerminalEvent,
  TrackerUpdate,
  TwitCastingUser,
} from '../shared/types';
import { DatabaseService } from './database';
import { OAUTH_CALLBACK_URL, runImplicitOAuth } from './oauth';
import { parseTwitCastingTarget } from './target';
import { TrackerService } from './tracker';
import { TwitCastingApiError, TwitCastingClient } from './twitcasting';

const COMMENT_TOKEN_SETTING = 'comment_access_token_encrypted_v1';

let mainWindow: BrowserWindow | null = null;
let db: DatabaseService;
let api: TwitCastingClient;
let tracker: TrackerService;
let commentAccessToken: string | null = null;
let commentAccount: TwitCastingUser | null = null;

function relayStatus() {
  return {
    connected: true,
    account: null,
    callbackUrl: '',
    secureStorageAvailable: true,
    appClientConfigured: true,
  };
}

function commentAuthStatus(): CommentAuthStatus {
  return {
    connected: Boolean(commentAccessToken && commentAccount),
    account: commentAccount,
    secureStorageAvailable: safeStorage.isEncryptionAvailable(),
  };
}

function clearStoredCommentAuth(): void {
  commentAccessToken = null;
  commentAccount = null;
  db.deleteSetting(COMMENT_TOKEN_SETTING);
}

function persistCommentToken(token: string): void {
  commentAccessToken = token;
  if (!safeStorage.isEncryptionAvailable()) return;
  const encrypted = safeStorage.encryptString(token).toString('base64');
  db.setSetting(COMMENT_TOKEN_SETTING, encrypted);
}

async function restoreCommentAuth(): Promise<void> {
  commentAccessToken = null;
  commentAccount = null;
  if (!safeStorage.isEncryptionAvailable()) return;

  const encoded = db.getSetting(COMMENT_TOKEN_SETTING);
  if (!encoded) return;

  try {
    const token = safeStorage.decryptString(Buffer.from(encoded, 'base64'));
    const account = await api.verifyUserToken(token);
    commentAccessToken = token;
    commentAccount = account;
  } catch (error) {
    // A temporary network failure must not erase a still-valid local token.
    if (error instanceof TwitCastingApiError && error.status === 401) clearStoredCommentAuth();
    else {
      commentAccessToken = null;
      commentAccount = null;
    }
  }
}

function buildDashboard(userId?: string): DashboardPayload {
  const trackerUserId = tracker.getStatus().trackedUserId;
  const selectedUser = userId
    ? db.getTrackedUser(userId)
    : trackerUserId
      ? db.getTrackedUser(trackerUserId)
      : null;

  let liveMovie = null;
  let metrics: StreamMetric[] = [];
  let comments: StoredComment[] = [];

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

function sendTerminal(event: TerminalEvent): void {
  if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send('terminal:event', event);
}

async function clipboardTwitCastingTarget(): Promise<string | null> {
  const raw = (await clipboard.readText()).trim();
  if (!raw || raw.length > 2048 || !/twitcasting\.tv/i.test(raw)) return null;
  try {
    return parseTwitCastingTarget(raw).originalInput;
  } catch {
    return null;
  }
}

function registerIpc(): void {
  ipcMain.handle('app:get-bootstrap', async () => buildDashboard());
  ipcMain.handle('data:get-dashboard', async (_event, userId?: string) => buildDashboard(userId));

  ipcMain.handle('relay:status', async () => ({
    ok: await api.health(),
    baseUrl: api.getRelayBaseUrl(),
  }));

  ipcMain.handle('comment-auth:get-status', async () => commentAuthStatus());

  ipcMain.handle('comment-auth:connect', async () => {
    const clientId = await api.getOAuthClientId();
    const token = await runImplicitOAuth(clientId);
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

  ipcMain.handle('comment-auth:disconnect', async () => {
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

  ipcMain.handle('comment:post', async (_event, rawMovieId: string, rawComment: string): Promise<PostCommentResult> => {
    const movieId = String(rawMovieId ?? '').trim();
    const comment = String(rawComment ?? '').trim();
    const activeMovieId = tracker.getStatus().activeMovieId;

    if (!commentAccessToken || !commentAccount) throw new Error('コメントするにはツイキャス連携が必要です。');
    if (!tracker.getStatus().isLive || !activeMovieId || activeMovieId !== movieId) {
      throw new Error('配信中のライブに接続してからコメントしてください。');
    }
    if (comment.length < 1 || comment.length > 140) throw new Error('コメントは1〜140文字で入力してください。');

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
    } catch (error) {
      if (error instanceof TwitCastingApiError && (error.status === 401 || error.code === 2005)) {
        clearStoredCommentAuth();
      }
      throw error;
    }
  });

  ipcMain.handle('tracker:start-input', async (_event, rawInput: string): Promise<StartTrackingResult> => {
    const parsed = parseTwitCastingTarget(String(rawInput ?? ''));
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

  ipcMain.handle('tracker:stop', async () => tracker.stop());

  ipcMain.handle('clipboard:get-twitcasting-target', async () => await clipboardTwitCastingTarget());

  ipcMain.handle('thumbnail:get-live', async (_event, userId: string) => {
    const normalized = String(userId ?? '').trim();
    if (!normalized || normalized.length > 180) return null;
    return api.getLiveThumbnailDataUrl(normalized);
  });

  ipcMain.handle('open:external', async (_event, rawUrl: string) => {
    const parsed = new URL(String(rawUrl ?? ''));
    const allowed = parsed.protocol === 'https:' && (
      parsed.hostname === 'twitcasting.tv'
      || parsed.hostname.endsWith('.twitcasting.tv')
      || parsed.hostname === 'github.com'
    );
    if (!allowed) throw new Error('許可されていない外部URLです。');
    await shell.openExternal(parsed.toString());
  });
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 900,
    minWidth: 1060,
    minHeight: 700,
    backgroundColor: '#0d1230',
    title: 'CASPULSE',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && (
        parsed.hostname === 'twitcasting.tv'
        || parsed.hostname.endsWith('.twitcasting.tv')
        || parsed.hostname === 'github.com'
      )) void shell.openExternal(parsed.toString());
    } catch {
      // Ignore malformed external links.
    }
    return { action: 'deny' };
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) await mainWindow.loadURL(devServer);
  else await mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
}

app.whenReady().then(async () => {
  app.setAppUserModelId('app.caspulse.desktop');
  db = new DatabaseService(app.getPath('userData'));
  api = new TwitCastingClient();
  tracker = new TrackerService(api, db);
  await restoreCommentAuth();

  tracker.on('update', (update: TrackerUpdate) => {
    if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send('tracker:update', update);
  });
  tracker.on('terminal', (event: TerminalEvent) => sendTerminal(event));

  registerIpc();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  tracker?.stop(false);
  db?.close();
});

export { OAUTH_CALLBACK_URL };
