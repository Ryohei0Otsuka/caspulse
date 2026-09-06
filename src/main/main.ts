import path from 'node:path';
import { app, BrowserWindow, clipboard, ipcMain, shell } from 'electron';
import type {
  DashboardPayload,
  StartTrackingResult,
  StoredComment,
  StreamMetric,
  TerminalEvent,
  TrackerUpdate,
} from '../shared/types';
import { DatabaseService } from './database';
import { parseTwitCastingTarget } from './target';
import { TrackerService } from './tracker';
import { TwitCastingClient } from './twitcasting';

let mainWindow: BrowserWindow | null = null;
let db: DatabaseService;
let api: TwitCastingClient;
let tracker: TrackerService;

function relayStatus() {
  return {
    connected: true,
    account: null,
    callbackUrl: '',
    secureStorageAvailable: true,
    appClientConfigured: true,
  };
}

function buildDashboard(userId?: string): DashboardPayload {
  const trackedUsers = db.listTrackedUsers();
  const trackerUserId = tracker.getStatus().trackedUserId;
  const selectedUser = userId
    ? db.getTrackedUser(userId)
    : trackerUserId
      ? db.getTrackedUser(trackerUserId)
      : trackedUsers[0] ?? null;

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

  ipcMain.handle('tracker:start-user', async (_event, userId: string) => {
    const stored = db.getTrackedUser(String(userId ?? ''));
    if (!stored) throw new Error('最近つないだ配信に対象ユーザーが見つかりません。');
    const latestIdentity = await api.getUser(stored.userId);
    const target = db.upsertTrackedUser(latestIdentity);
    return tracker.start(target);
  });

  ipcMain.handle('tracker:stop', async () => tracker.stop());

  ipcMain.handle('tracked:remove', async (_event, userId: string) => {
    const normalized = String(userId ?? '');
    if (tracker.getStatus().trackedUserId === normalized) tracker.stop();
    db.removeTrackedUser(normalized);
  });

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
    width: 1540,
    height: 980,
    minWidth: 1120,
    minHeight: 760,
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
