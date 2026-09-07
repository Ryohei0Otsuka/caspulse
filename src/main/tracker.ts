import { EventEmitter } from 'node:events';
import type {
  StoredComment,
  StreamMetric,
  TerminalEvent,
  TerminalKind,
  TrackedUser,
  TrackerStatus,
  TrackerUpdate,
  TwitCastingMovie,
} from '../shared/types';
import { DatabaseService } from './database';
import { TwitCastingClient } from './twitcasting';

const STATUS_INTERVAL_MS = 10_000;
const COMMENT_INTERVAL_MS = 3_000;

function newestCommentId(comments: { id: string }[]): string | undefined {
  let latest: bigint | null = null;
  for (const comment of comments) {
    try {
      const id = BigInt(comment.id);
      if (latest === null || id > latest) latest = id;
    } catch {
      // API comment IDs are numeric today. Unexpected IDs remain stored but are not used as slice_id.
    }
  }
  return latest?.toString();
}

export class TrackerService extends EventEmitter {
  private status: TrackerStatus = {
    trackedUserId: null,
    isRunning: false,
    isLive: false,
    activeMovieId: null,
    lastCheckedAt: null,
    error: null,
  };

  private target: TrackedUser | null = null;
  private liveMovie: TwitCastingMovie | null = null;
  private statusTimer: NodeJS.Timeout | null = null;
  private commentTimer: NodeJS.Timeout | null = null;
  private sliceId: string | undefined;
  private pollingStatus = false;
  private pollingComments = false;
  private firstStatusCheck = true;
  private lastLoggedError: string | null = null;

  constructor(
    private readonly api: TwitCastingClient,
    private readonly db: DatabaseService,
  ) {
    super();
  }

  getStatus(): TrackerStatus {
    return { ...this.status };
  }

  getLiveMovie(): TwitCastingMovie | null {
    return this.liveMovie ? { ...this.liveMovie } : null;
  }

  getTrackedUser(): TrackedUser | null {
    return this.target ? { ...this.target } : null;
  }

  async start(target: TrackedUser): Promise<TrackerStatus> {
    this.stop(false);
    this.target = target;
    this.db.touchTrackedUser(target.userId);
    this.firstStatusCheck = true;
    this.lastLoggedError = null;
    this.status = {
      trackedUserId: target.userId,
      isRunning: true,
      isLive: false,
      activeMovieId: null,
      lastCheckedAt: null,
      error: null,
    };
    this.log('system', 'TRACE', `@${target.screenId} の追跡を開始しました。`, `fixed uid:${target.userId}`);
    this.emitUpdate([], null);

    await this.pollStatus();
    this.statusTimer = setInterval(() => void this.pollStatus(), STATUS_INTERVAL_MS);
    this.commentTimer = setInterval(() => void this.pollComments(), COMMENT_INTERVAL_MS);
    return this.getStatus();
  }

  stop(logEvent = true): TrackerStatus {
    if (this.statusTimer) clearInterval(this.statusTimer);
    if (this.commentTimer) clearInterval(this.commentTimer);
    this.statusTimer = null;
    this.commentTimer = null;

    const previousTarget = this.target;
    const previousMovie = this.status.activeMovieId;
    if (previousMovie) this.db.markStreamEnded(previousMovie);

    this.status = {
      trackedUserId: null,
      isRunning: false,
      isLive: false,
      activeMovieId: null,
      lastCheckedAt: this.status.lastCheckedAt,
      error: null,
    };
    this.target = null;
    this.liveMovie = null;
    this.sliceId = undefined;
    this.pollingStatus = false;
    this.pollingComments = false;
    if (logEvent && previousTarget) {
      this.log('system', 'STOP', `@${previousTarget.screenId} との接続を終了しました。`);
    }
    this.emitUpdate([], null);
    return this.getStatus();
  }

  private async pollStatus(): Promise<void> {
    const userId = this.status.trackedUserId;
    if (!this.status.isRunning || !userId || this.pollingStatus) return;
    this.pollingStatus = true;

    try {
      const wasLive = this.status.isLive;
      const previousMovieId = this.status.activeMovieId;
      const current = await this.api.getCurrentLive(userId);
      this.status.lastCheckedAt = Math.floor(Date.now() / 1000);
      this.status.error = null;
      this.lastLoggedError = null;

      if (!current) {
        if (previousMovieId) this.db.markStreamEnded(previousMovieId);
        this.liveMovie = null;
        this.status.isLive = false;
        this.status.activeMovieId = null;
        this.sliceId = undefined;

        if (wasLive) {
          this.log('wait', 'END', '配信が終了しました。次の配信を待機します。');
        } else if (this.firstStatusCheck) {
          this.log('wait', 'WAIT', '現在はオフラインです。次の配信を待機します。');
        }

        this.firstStatusCheck = false;
        this.emitUpdate([], null);
        return;
      }

      const movieChanged = previousMovieId !== current.movie.id;
      if (movieChanged && previousMovieId) this.db.markStreamEnded(previousMovieId);

      if (this.target && current.broadcaster.screen_id !== this.target.screenId) {
        const previousScreenId = this.target.screenId;
        this.target = this.db.upsertTrackedUser(current.broadcaster);
        this.log(
          'system',
          'IDENTITY',
          `screen_id を更新：@${previousScreenId} → @${this.target.screenId}`,
          `fixed uid:${this.target.userId} unchanged`,
        );
      } else {
        this.target = this.db.upsertTrackedUser(current.broadcaster);
      }

      this.liveMovie = current.movie;
      this.status.isLive = true;
      this.status.activeMovieId = current.movie.id;
      this.db.upsertStream(current.movie);

      if (movieChanged) {
        this.sliceId = undefined;
        this.log(
          'live',
          'LIVE',
          `配信開始：「${current.movie.title || `Movie #${current.movie.id}`}」に接続しました。`,
          `movie:${current.movie.id} · 見てる人:${current.movie.current_view_count}`,
        );
        await this.pollComments();
      }

      const metric = this.buildMetric(current.movie);
      this.db.insertMetric(current.movie.id, metric);
      this.log(
        'pulse',
        'PULSE',
        `現在 ${metric.commentsPerMinute}コメ/分 · 勢い ${metric.momentum >= 0 ? '+' : ''}${metric.momentum}% · 盛り上がり ${metric.activityScore}`,
        `見てる人:${metric.currentViewers} (${metric.viewerDelta >= 0 ? '+' : ''}${metric.viewerDelta}) · 参加:${metric.uniqueCommenters}人`,
      );
      this.firstStatusCheck = false;
      this.emitUpdate([], metric);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown tracking error.';
      this.status.lastCheckedAt = Math.floor(Date.now() / 1000);
      this.status.error = message;
      if (message !== this.lastLoggedError) {
        this.log('error', 'ERROR', message);
        this.lastLoggedError = message;
      }
      this.emitUpdate([], null);
    } finally {
      this.pollingStatus = false;
    }
  }

  private async pollComments(): Promise<void> {
    const movieId = this.status.activeMovieId;
    if (!this.status.isRunning || !this.status.isLive || !movieId || this.pollingComments) return;
    this.pollingComments = true;

    try {
      const isInitialSync = this.sliceId === undefined;
      const response = await this.api.getComments(movieId, this.sliceId);
      const inserted = this.db.insertComments(movieId, response.comments);
      const latest = newestCommentId(response.comments);
      if (latest) this.sliceId = latest;
      this.status.error = null;
      this.lastLoggedError = null;

      if (inserted.length > 0) {
        const lines = isInitialSync && inserted.length > 25 ? inserted.slice(-25) : inserted;
        if (isInitialSync && inserted.length > lines.length) {
          this.log('system', 'SYNC', `${inserted.length}件のコメントを取得。最新${lines.length}件を表示します。`);
        }
        for (const comment of lines) {
          this.log(
            'comment',
            'CHAT',
            `@${comment.screenId}：${comment.message}`,
            `uid:${comment.userId} · cid:${comment.commentId}`,
            comment.createdAt,
          );
        }
        const metric = this.liveMovie ? this.buildMetric(this.liveMovie, 'comment') : null;
        if (metric && this.liveMovie) this.db.insertMetric(this.liveMovie.id, metric);
        this.emitUpdate(inserted, metric);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Comment polling failed.';
      this.status.error = message;
      if (message !== this.lastLoggedError) {
        this.log('error', 'COMMENT', message);
        this.lastLoggedError = message;
      }
      this.emitUpdate([], null);
    } finally {
      this.pollingComments = false;
    }
  }

  private buildMetric(movie: TwitCastingMovie, source: 'status' | 'comment' = 'status'): StreamMetric {
    const now = Math.floor(Date.now() / 1000);
    const commentsPerMinute = this.db.countCommentsSince(movie.id, now - 60);
    const uniqueCommenters = this.db.countUniqueCommentersSince(movie.id, now - 60);
    const recent15 = this.db.countCommentsSince(movie.id, now - 15);
    const previous60 = this.db.countCommentsBetween(movie.id, now - 75, now - 15);
    const baseline15 = previous60 / 4;
    const previousMetric = this.db.getLatestMetric(movie.id);
    // Viewer counts are refreshed by the slower status poll. Comment-driven metrics
    // preserve the most recent viewer movement while updating comment activity immediately.
    const viewerDelta = source === 'comment'
      ? (previousMetric?.viewerDelta ?? 0)
      : (previousMetric ? movie.current_view_count - previousMetric.currentViewers : 0);
    const previousViewers = source === 'comment'
      ? Math.max(0, movie.current_view_count - viewerDelta)
      : (previousMetric?.currentViewers ?? movie.current_view_count);
    const viewerChangePercent = previousViewers > 0 ? (viewerDelta / previousViewers) * 100 : 0;

    // Momentum v2: low-volume streams get a gentle ramp instead of +100% per comment.
    let momentum = 0;
    if (previous60 < 4) {
      if (recent15 === 1) momentum = 25;
      else if (recent15 === 2) momentum = 50;
      else if (recent15 >= 3) momentum = Math.min(150, 50 + (recent15 - 2) * 25);
    } else {
      const smoothedBaseline = Math.max(1, baseline15);
      momentum = ((recent15 - smoothedBaseline) / smoothedBaseline) * 100;
    }
    momentum = Math.max(-100, Math.min(400, Math.round(momentum)));

    // Activity v2: saturating scores reduce the tendency to hit 70+ too easily.
    const commentScore = 45 * (1 - Math.exp(-commentsPerMinute / 22));
    const uniqueScore = 20 * (1 - Math.exp(-uniqueCommenters / 7));
    const viewerScore = Math.min(15, Math.max(0, viewerChangePercent) * 1.5);
    const momentumScore = Math.min(20, Math.max(0, momentum) / 12.5);
    const activityScore = Math.max(0, Math.min(100, Math.round(
      commentScore + uniqueScore + viewerScore + momentumScore,
    )));

    return {
      capturedAt: now,
      currentViewers: movie.current_view_count,
      totalViewers: movie.total_view_count,
      totalComments: movie.comment_count,
      commentsPerMinute,
      uniqueCommenters,
      viewerDelta,
      momentum,
      activityScore,
    };
  }

  private emitUpdate(newComments: StoredComment[], latestMetric: StreamMetric | null): void {
    const payload: TrackerUpdate = {
      tracker: this.getStatus(),
      trackedUser: this.getTrackedUser(),
      liveMovie: this.getLiveMovie(),
      latestMetric,
      newComments,
    };
    this.emit('update', payload);
  }

  private log(
    kind: TerminalKind,
    label: string,
    message: string,
    detail?: string,
    at = Math.floor(Date.now() / 1000),
  ): void {
    const event: TerminalEvent = {
      id: `${at}-${Math.random().toString(36).slice(2, 10)}`,
      at,
      kind,
      label,
      message,
      detail,
    };
    this.emit('terminal', event);
  }
}
