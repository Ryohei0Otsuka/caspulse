"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const node_path_1 = __importDefault(require("node:path"));
const node_sqlite_1 = require("node:sqlite");
class DatabaseService {
    db;
    constructor(userDataPath) {
        const dbPath = node_path_1.default.join(userDataPath, 'caspulse.sqlite');
        this.db = new node_sqlite_1.DatabaseSync(dbPath);
        this.db.exec('PRAGMA journal_mode = WAL;');
        this.db.exec('PRAGMA foreign_keys = ON;');
        this.db.exec('PRAGMA busy_timeout = 3000;');
        this.migrate();
    }
    migrate() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tracked_users (
        user_id TEXT PRIMARY KEY,
        screen_id TEXT NOT NULL,
        name TEXT NOT NULL,
        image TEXT NOT NULL,
        added_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS streams (
        movie_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        link TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        current_viewers INTEGER NOT NULL DEFAULT 0,
        total_viewers INTEGER NOT NULL DEFAULT 0,
        total_comments INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_streams_user_started
        ON streams(user_id, started_at);

      CREATE TABLE IF NOT EXISTS comments (
        comment_id TEXT PRIMARY KEY,
        movie_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        screen_id TEXT NOT NULL,
        name TEXT NOT NULL,
        image TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        received_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_comments_movie_created
        ON comments(movie_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_comments_user
        ON comments(user_id, created_at);

      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        movie_id TEXT NOT NULL,
        captured_at INTEGER NOT NULL,
        current_viewers INTEGER NOT NULL,
        total_viewers INTEGER NOT NULL,
        total_comments INTEGER NOT NULL,
        comments_per_minute REAL NOT NULL,
        unique_commenters INTEGER NOT NULL,
        viewer_delta INTEGER NOT NULL,
        momentum REAL NOT NULL,
        activity_score REAL NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_metrics_movie_time
        ON metrics(movie_id, captured_at);

      CREATE TABLE IF NOT EXISTS gifts (
        id INTEGER PRIMARY KEY,
        movie_id TEXT,
        item_id TEXT NOT NULL,
        item_name TEXT NOT NULL,
        item_mp INTEGER NOT NULL DEFAULT 0,
        sender_screen_id TEXT NOT NULL,
        message TEXT NOT NULL,
        received_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS moments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        movie_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        note TEXT
      );
    `);
    }
    setSetting(key, value) {
        this.db.prepare(`
      INSERT INTO settings(key, value)
      VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
    }
    getSetting(key) {
        const row = this.db.prepare('SELECT value FROM settings WHERE key = ?')
            .get(key);
        return row?.value ?? null;
    }
    deleteSetting(key) {
        this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
    }
    upsertTrackedUser(user) {
        const now = Math.floor(Date.now() / 1000);
        this.db.prepare(`
      INSERT INTO tracked_users(user_id, screen_id, name, image, added_at, last_used_at)
      VALUES(?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        screen_id = excluded.screen_id,
        name = excluded.name,
        image = excluded.image,
        last_used_at = excluded.last_used_at
    `).run(user.id, user.screen_id, user.name, user.image, now, now);
        return this.getTrackedUser(user.id);
    }
    touchTrackedUser(userId) {
        this.db.prepare('UPDATE tracked_users SET last_used_at = ? WHERE user_id = ?')
            .run(Math.floor(Date.now() / 1000), userId);
    }
    getTrackedUser(userId) {
        const row = this.db.prepare('SELECT * FROM tracked_users WHERE user_id = ?')
            .get(userId);
        return row ? this.mapTrackedUser(row) : null;
    }
    listTrackedUsers() {
        const rows = this.db.prepare('SELECT * FROM tracked_users ORDER BY last_used_at DESC')
            .all();
        return rows.map((row) => this.mapTrackedUser(row));
    }
    removeTrackedUser(userId) {
        this.db.prepare('DELETE FROM tracked_users WHERE user_id = ?').run(userId);
    }
    upsertStream(movie) {
        this.db.prepare(`
      INSERT INTO streams(
        movie_id, user_id, title, link, started_at, ended_at,
        current_viewers, total_viewers, total_comments
      ) VALUES(?, ?, ?, ?, ?, NULL, ?, ?, ?)
      ON CONFLICT(movie_id) DO UPDATE SET
        title = excluded.title,
        link = excluded.link,
        ended_at = NULL,
        current_viewers = excluded.current_viewers,
        total_viewers = excluded.total_viewers,
        total_comments = excluded.total_comments
    `).run(movie.id, movie.user_id, movie.title, movie.link, movie.created, movie.current_view_count, movie.total_view_count, movie.comment_count);
    }
    markStreamEnded(movieId) {
        this.db.prepare('UPDATE streams SET ended_at = ? WHERE movie_id = ? AND ended_at IS NULL')
            .run(Math.floor(Date.now() / 1000), movieId);
    }
    getLatestStreamForUser(userId) {
        const row = this.db.prepare('SELECT * FROM streams WHERE user_id = ? ORDER BY started_at DESC LIMIT 1').get(userId);
        return row ? this.mapStream(row) : null;
    }
    insertComments(movieId, comments) {
        const insert = this.db.prepare(`
      INSERT OR IGNORE INTO comments(
        comment_id, movie_id, user_id, screen_id, name, image,
        message, created_at, received_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const inserted = [];
        const receivedAt = Math.floor(Date.now() / 1000);
        for (const comment of [...comments].sort((a, b) => {
            if (a.created !== b.created)
                return a.created - b.created;
            try {
                return BigInt(a.id) < BigInt(b.id) ? -1 : 1;
            }
            catch {
                return a.id.localeCompare(b.id);
            }
        })) {
            const result = insert.run(comment.id, movieId, comment.from_user.id, comment.from_user.screen_id, comment.from_user.name, comment.from_user.image, comment.message, comment.created, receivedAt);
            if (Number(result.changes) > 0) {
                inserted.push({
                    commentId: comment.id,
                    movieId,
                    userId: comment.from_user.id,
                    screenId: comment.from_user.screen_id,
                    name: comment.from_user.name,
                    image: comment.from_user.image,
                    message: comment.message,
                    createdAt: comment.created,
                    receivedAt,
                });
            }
        }
        return inserted;
    }
    getRecentComments(movieId, limit = 300) {
        const safeLimit = Math.min(Math.max(limit, 1), 1000);
        const rows = this.db.prepare(`
      SELECT * FROM comments
      WHERE movie_id = ?
      ORDER BY created_at DESC, comment_id DESC
      LIMIT ?
    `).all(movieId, safeLimit);
        return rows.reverse().map((row) => this.mapComment(row));
    }
    countCommentsSince(movieId, since) {
        const row = this.db.prepare('SELECT COUNT(*) AS count FROM comments WHERE movie_id = ? AND created_at >= ?').get(movieId, since);
        return Number(row.count);
    }
    countUniqueCommentersSince(movieId, since) {
        const row = this.db.prepare(`
      SELECT COUNT(DISTINCT user_id) AS count
      FROM comments WHERE movie_id = ? AND created_at >= ?
    `).get(movieId, since);
        return Number(row.count);
    }
    countCommentsBetween(movieId, from, to) {
        const row = this.db.prepare(`
      SELECT COUNT(*) AS count FROM comments
      WHERE movie_id = ? AND created_at >= ? AND created_at < ?
    `).get(movieId, from, to);
        return Number(row.count);
    }
    insertMetric(movieId, metric) {
        this.db.prepare(`
      INSERT INTO metrics(
        movie_id, captured_at, current_viewers, total_viewers,
        total_comments, comments_per_minute, unique_commenters,
        viewer_delta, momentum, activity_score
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(movieId, metric.capturedAt, metric.currentViewers, metric.totalViewers, metric.totalComments, metric.commentsPerMinute, metric.uniqueCommenters, metric.viewerDelta, metric.momentum, metric.activityScore);
    }
    getLatestMetric(movieId) {
        const row = this.db.prepare(`
      SELECT captured_at, current_viewers, total_viewers, total_comments,
             comments_per_minute, unique_commenters, viewer_delta,
             momentum, activity_score
      FROM metrics WHERE movie_id = ? ORDER BY captured_at DESC LIMIT 1
    `).get(movieId);
        return row ? this.mapMetric(row) : null;
    }
    getRecentMetrics(movieId, limit = 180) {
        const safeLimit = Math.min(Math.max(limit, 1), 1000);
        const rows = this.db.prepare(`
      SELECT captured_at, current_viewers, total_viewers, total_comments,
             comments_per_minute, unique_commenters, viewer_delta,
             momentum, activity_score
      FROM metrics
      WHERE movie_id = ?
      ORDER BY captured_at DESC
      LIMIT ?
    `).all(movieId, safeLimit);
        return rows.reverse().map((row) => this.mapMetric(row));
    }
    close() {
        this.db.close();
    }
    mapTrackedUser(row) {
        return {
            userId: row.user_id,
            screenId: row.screen_id,
            name: row.name,
            image: row.image,
            addedAt: row.added_at,
            lastUsedAt: row.last_used_at,
        };
    }
    mapComment(row) {
        return {
            commentId: row.comment_id,
            movieId: row.movie_id,
            userId: row.user_id,
            screenId: row.screen_id,
            name: row.name,
            image: row.image,
            message: row.message,
            createdAt: row.created_at,
            receivedAt: row.received_at,
        };
    }
    mapMetric(row) {
        return {
            capturedAt: row.captured_at,
            currentViewers: row.current_viewers,
            totalViewers: row.total_viewers,
            totalComments: row.total_comments,
            commentsPerMinute: row.comments_per_minute,
            uniqueCommenters: row.unique_commenters,
            viewerDelta: row.viewer_delta,
            momentum: row.momentum,
            activityScore: row.activity_score,
        };
    }
    mapStream(row) {
        return {
            movieId: row.movie_id,
            userId: row.user_id,
            title: row.title,
            link: row.link,
            startedAt: row.started_at,
            endedAt: row.ended_at,
            currentViewers: row.current_viewers,
            totalViewers: row.total_viewers,
            totalComments: row.total_comments,
        };
    }
}
exports.DatabaseService = DatabaseService;
//# sourceMappingURL=database.js.map