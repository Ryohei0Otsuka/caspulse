import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  DashboardPayload,
  StoredComment,
  StreamMetric,
  TerminalEvent,
  TrackedUser,
  TrackerUpdate,
} from '../shared/types';

const EXAMPLE_URL = 'https://twitcasting.tv/g:113456859404992188053';
const THUMBNAIL_REFRESH_MS = 20_000;

const emptyDashboard: DashboardPayload = {
  trackedUsers: [],
  auth: {
    connected: true,
    account: null,
    callbackUrl: '',
    secureStorageAvailable: true,
    appClientConfigured: true,
  },
  tracker: {
    trackedUserId: null,
    isRunning: false,
    isLive: false,
    activeMovieId: null,
    lastCheckedAt: null,
    error: null,
  },
  selectedUser: null,
  liveMovie: null,
  metrics: [],
  comments: [],
};

function formatTime(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function shortTime(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function durationText(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.max(0, seconds % 60);
  return [hours, minutes, secs].map((value) => String(value).padStart(2, '0')).join(':');
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function vibeWord(value: number): string {
  if (value >= 250) return '急上昇';
  if (value >= 100) return '上昇中';
  if (value >= 35) return 'やや上向き';
  if (value <= -50) return '落ち着き気味';
  return '安定';
}

function activityWord(value: number): string {
  if (value >= 85) return 'かなり盛り上がっています';
  if (value >= 65) return '盛り上がっています';
  if (value >= 40) return 'いい流れです';
  if (value >= 15) return '少し動きがあります';
  return '落ち着いています';
}

function cleanForSpeech(message: string): string {
  return message
    .replace(/https?:\/\/\S+/gi, ' URL ')
    .replace(/w{3,}/gi, ' わら ')
    .slice(0, 180);
}

function speakComments(comments: StoredComment[], includeName: boolean): void {
  if (!('speechSynthesis' in window)) return;
  for (const comment of comments.slice(-8)) {
    const utterance = new SpeechSynthesisUtterance(
      includeName ? `${comment.name}。${cleanForSpeech(comment.message)}` : cleanForSpeech(comment.message),
    );
    utterance.lang = 'ja-JP';
    utterance.rate = 1.08;
    window.speechSynthesis.speak(utterance);
  }
}

function pointsFor(values: number[], width: number, height: number): string {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(1, max - min);
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 28) - 14;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function MultiPulseChart({ metrics }: { metrics: StreamMetric[] }) {
  const width = 860;
  const height = 240;
  const last = metrics.slice(-80);
  const viewersPoints = pointsFor(last.map((metric) => metric.currentViewers), width, height);
  const commentsPoints = pointsFor(last.map((metric) => metric.commentsPerMinute), width, height);
  const latest = last.at(-1);
  const peak = last.reduce<StreamMetric | null>((best, metric) => {
    if (!best || metric.activityScore > best.activityScore) return metric;
    return best;
  }, null);

  return (
    <article className="pulse-board sticker-card">
      <div className="pulse-board-head">
        <div>
          <div className="section-kicker">〰 コメントと視聴者の流れ</div>
          <h2>いまの盛り上がり</h2>
        </div>
        <div className="chart-legend">
          <span className="legend-dot viewers">見てる人</span>
          <span className="legend-dot comments">コメント</span>
          <span className="range-pill">直近の流れ</span>
        </div>
      </div>

      {last.length < 2 ? (
        <div className="pulse-empty">
          <div className="empty-wave">⌁⌁⌁</div>
          <strong>まだデータがありません。</strong>
          <span>配信につながると、コメントと視聴者の推移を表示します。</span>
        </div>
      ) : (
        <div className="pulse-chart-wrap">
          <svg className="pulse-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="いまの盛り上がり">
            <defs>
              <linearGradient id="viewer-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#45e7ff" stopOpacity=".30" />
                <stop offset="100%" stopColor="#45e7ff" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="comment-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff71d7" stopOpacity=".28" />
                <stop offset="100%" stopColor="#ff71d7" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
              <line key={ratio} x1="0" x2={width} y1={height * ratio} y2={height * ratio} className="chart-grid" />
            ))}
            <polygon points={`${viewersPoints} ${width},${height} 0,${height}`} fill="url(#viewer-fill)" />
            <polygon points={`${commentsPoints} ${width},${height} 0,${height}`} fill="url(#comment-fill)" />
            <polyline points={viewersPoints} className="chart-line viewers-line" />
            <polyline points={commentsPoints} className="chart-line comments-line" />
          </svg>
          {peak && (
            <div className="chart-bubble peak-bubble">
              <b>この時間帯がピーク</b>
              <span>盛り上がり {peak.activityScore}</span>
            </div>
          )}
          {latest && latest.momentum >= 100 && (
            <div className="chart-bubble now-bubble">
              <b>現在上昇中</b>
              <span>勢い +{latest.momentum}%</span>
            </div>
          )}
          <div className="chart-doodle">コメントの動きを<br />ひと目で確認</div>
        </div>
      )}
    </article>
  );
}

function atmosphereLines(metric: StreamMetric | null, isLive: boolean): Array<{ icon: string; text: string }> {
  if (!isLive) {
    return [
      { icon: '🌙', text: '現在はオフラインです。次の配信を待機しています。' },
      { icon: '🔗', text: '一度登録した配信者は固定IDで追跡します。' },
      { icon: '💾', text: 'コメントと推移データはこのPCに保存します。' },
    ];
  }
  if (!metric) {
    return [
      { icon: '📡', text: '配信に接続しました。データを取得しています。' },
      { icon: '💬', text: 'コメントが届くと、ここに現在の傾向を表示します。' },
    ];
  }

  const lines: Array<{ icon: string; text: string }> = [];
  if (metric.commentsPerMinute >= 30) lines.push({ icon: '💬', text: `コメントが活発です。現在 ${metric.commentsPerMinute} コメ/分。` });
  else if (metric.commentsPerMinute > 0) lines.push({ icon: '☁️', text: `コメントは現在 ${metric.commentsPerMinute} コメ/分です。` });
  else lines.push({ icon: '🍵', text: '現在、コメントの動きはありません。' });

  if (metric.viewerDelta > 0) lines.push({ icon: '👀', text: `視聴者が直近で +${metric.viewerDelta} 人増えています。` });
  else if (metric.viewerDelta < 0) lines.push({ icon: '🌿', text: '視聴者数は直近でやや減少しています。' });
  else lines.push({ icon: '✨', text: '視聴者数はおおむね横ばいです。' });

  if (metric.momentum >= 100) lines.push({ icon: '🔥', text: 'コメントの勢いが大きく上昇しています。' });
  else if (metric.momentum >= 25) lines.push({ icon: '📈', text: 'コメントの勢いが上向いています。' });
  else if (metric.momentum <= -50) lines.push({ icon: '🫧', text: 'コメントの勢いは直前より落ち着いています。' });
  else lines.push({ icon: '💜', text: 'コメントの勢いは安定しています。' });

  return lines.slice(0, 4);
}

function friendlyLabel(label: string): string {
  const map: Record<string, string> = {
    AUTH: '接続',
    INPUT: '入力',
    RESOLVE: '確認',
    TRACE: '追跡',
    LIVE: 'LIVE',
    CHAT: 'コメント',
    PULSE: '勢い',
    WAIT: '待機',
    END: '終了',
    STOP: 'ストップ',
    IDENTITY: 'ID更新',
    SYNC: 'まとめて',
    ERROR: 'エラー',
    COMMENT: 'コメント',
  };
  return map[label] ?? label.toLowerCase();
}

export function App() {
  const [dashboard, setDashboard] = useState<DashboardPayload>(emptyDashboard);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [targetInput, setTargetInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terminal, setTerminal] = useState<TerminalEvent[]>([]);
  const [terminalFilter, setTerminalFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsIncludeName, setTtsIncludeName] = useState(false);
  const [clipboardCandidate, setClipboardCandidate] = useState<string | null>(null);
  const [liveThumbnail, setLiveThumbnail] = useState<string | null>(null);
  const [relayOnline, setRelayOnline] = useState<boolean | null>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  const refresh = async (userId?: string) => {
    const data = await window.caspulse.getDashboard(userId);
    setDashboard(data);
    if (data.selectedUser) setSelectedUserId(data.selectedUser.userId);
  };

  useEffect(() => {
    void window.caspulse.getBootstrap().then((data) => {
      setDashboard(data);
      setSelectedUserId(data.selectedUser?.userId ?? null);
      return Promise.all([
        window.caspulse.getClipboardTwitCastingTarget(),
        window.caspulse.getRelayStatus(),
      ]);
    }).then(([candidate, relay]) => {
      setClipboardCandidate(candidate);
      setRelayOnline(relay.ok);
    })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));

    const offTracker = window.caspulse.onTrackerUpdate((update: TrackerUpdate) => {
      setDashboard((current) => {
        const selectedMatches = current.selectedUser?.userId === update.tracker.trackedUserId;
        const nextComments = selectedMatches && update.newComments.length
          ? [...current.comments, ...update.newComments].slice(-500)
          : current.comments;
        const nextMetrics = selectedMatches && update.latestMetric
          ? [...current.metrics, update.latestMetric].slice(-180)
          : current.metrics;

        if (ttsEnabled && selectedMatches && update.newComments.length) {
          speakComments(update.newComments, ttsIncludeName);
        }

        const nextTrackedUsers = update.trackedUser
          ? [update.trackedUser, ...current.trackedUsers.filter((user) => user.userId !== update.trackedUser?.userId)]
          : current.trackedUsers;

        return {
          ...current,
          trackedUsers: nextTrackedUsers,
          selectedUser: selectedMatches && update.trackedUser ? update.trackedUser : current.selectedUser,
          tracker: update.tracker,
          liveMovie: selectedMatches ? update.liveMovie : current.liveMovie,
          comments: nextComments,
          metrics: nextMetrics,
        };
      });
    });

    const offTerminal = window.caspulse.onTerminalEvent((event) => {
      setTerminal((current) => [...current, event].slice(-800));
    });

    return () => {
      offTracker();
      offTerminal();
    };
  }, [ttsEnabled, ttsIncludeName]);

  useEffect(() => {
    if (autoScroll) terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminal, autoScroll]);

  useEffect(() => {
    if (!selectedUserId) return;
    void refresh(selectedUserId).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [selectedUserId]);

  const latestMetric = dashboard.metrics.at(-1) ?? null;
  const selectedUser = dashboard.selectedUser;
  const trackingSelected = Boolean(
    selectedUserId
    && dashboard.tracker.isRunning
    && dashboard.tracker.trackedUserId === selectedUserId,
  );
  const live = Boolean(trackingSelected && dashboard.tracker.isLive && dashboard.liveMovie);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const updateThumbnail = async () => {
      if (!live || !selectedUser?.userId) {
        if (!cancelled) setLiveThumbnail(null);
        return;
      }

      // current_live already contains movie thumbnails. Show that immediately,
      // then replace it with the official latest live-thumbnail endpoint.
      const movieFallback = dashboard.liveMovie?.large_thumbnail || dashboard.liveMovie?.small_thumbnail || null;
      if (!cancelled && movieFallback) setLiveThumbnail(movieFallback.replace(/^http:/, 'https:'));

      try {
        const image = await window.caspulse.getLiveThumbnail(selectedUser.userId);
        if (!cancelled && image) setLiveThumbnail(image);
      } catch {
        // Keep the current_live movie thumbnail if the refresh endpoint fails.
      }
    };

    void updateThumbnail();
    if (live) timer = window.setInterval(() => void updateThumbnail(), THUMBNAIL_REFRESH_MS);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [live, dashboard.liveMovie?.id, selectedUser?.userId]);

  const filteredTerminal = useMemo(() => {
    const query = terminalFilter.trim().toLowerCase();
    if (!query) return terminal;
    return terminal.filter((line) => `${line.label} ${line.message} ${line.detail ?? ''}`.toLowerCase().includes(query));
  }, [terminal, terminalFilter]);

  const recentComments = dashboard.comments.slice(-11).reverse();
  const atmosphere = atmosphereLines(latestMetric, live);

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleTrace = (event: FormEvent) => {
    event.preventDefault();
    void runAction(async () => {
      const result = await window.caspulse.startTrackingInput(targetInput);
      setDashboard(result.dashboard);
      setSelectedUserId(result.target.userId);
      setTargetInput(`https://twitcasting.tv/${result.target.screenId}`);
      setClipboardCandidate(null);
    });
  };

  const pasteTwitCastingUrl = () => {
    void runAction(async () => {
      const candidate = await window.caspulse.getClipboardTwitCastingTarget();
      if (!candidate) {
        throw new Error('クリップボードにツイキャスの配信URLが見つかりません。先に配信ページのURLをコピーしてください。');
      }
      setTargetInput(candidate);
      setClipboardCandidate(null);
    });
  };

  const startRecent = (user: TrackedUser) => {
    void runAction(async () => {
      setSelectedUserId(user.userId);
      setTargetInput(`https://twitcasting.tv/${user.screenId}`);
      await window.caspulse.startTrackingUser(user.userId);
      await refresh(user.userId);
    });
  };

  const stopTrace = () => {
    void runAction(async () => {
      await window.caspulse.stopTracking();
      await refresh(selectedUserId ?? undefined);
    });
  };

  const removeRecent = (user: TrackedUser) => {
    void runAction(async () => {
      await window.caspulse.removeTrackedUser(user.userId);
      const next = dashboard.trackedUsers.find((candidate) => candidate.userId !== user.userId);
      setSelectedUserId(next?.userId ?? null);
      await refresh(next?.userId);
    });
  };

  const openStream = () => {
    if (dashboard.liveMovie?.link) void window.caspulse.openExternal(dashboard.liveMovie.link.replace(/^http:/, 'https:'));
    else if (selectedUser) void window.caspulse.openExternal(`https://twitcasting.tv/${selectedUser.screenId}`);
  };

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="ambient ambient-three" />
      <div className="sparkles" aria-hidden="true">✦　·　⌁　✧　·　✦</div>

      <header className="topbar">
        <div className="brand-wrap">
          <img className="brand-icon" src="./assets/caspulse-icon.png" alt="CASPULSE" />
          <div className="brand-copy">
            <div className="brand-line"><h1>CASPULSE</h1><span className="heartbeat">⌁</span></div>
            <p>ツイキャスの“いま”を、見やすく楽しく。</p>
          </div>
          <div className="brand-sticker">配信の流れを、<br /><b>ひと目で。</b></div>
        </div>

        <nav className="nav-tabs" aria-label="CASPULSE navigation">
          <button type="button" className="nav-tab active">⌂ <span>ホーム</span></button>
          <button type="button" className="nav-tab soon" title="これから追加予定">◷ <span>履歴</span><small>soon</small></button>
          <button type="button" className="nav-tab" onClick={() => setSettingsOpen(true)}>⚙ <span>設定</span></button>
        </nav>

        <div className="top-message">
          <span>配信の流れを、</span>
          <b>ひと目で見やすく。</b>
          <small className={relayOnline ? 'connected' : ''}>
            {relayOnline === null ? '○ Relayを確認中…' : relayOnline ? '● URLを貼るだけでOK' : '○ Relayにつながらない'}
          </small>
        </div>
      </header>

      <main className="page-wrap">
        <section className={`hero-wrap ${!dashboard.tracker.isRunning ? 'start-here' : ''}`}>
          {!dashboard.tracker.isRunning && (
            <div className="start-guide" aria-label="CASPULSEの使い方">
              <div className="start-guide-title"><span>START</span><b>ツイキャスの配信URLを貼ってスタート</b></div>
              <div className="start-steps">
                <span><i>1</i> ツイキャスで見たい配信を開く</span>
                <em>→</em>
                <span><i>2</i> URLをコピー</span>
                <em>→</em>
                <span className="active"><i>3</i> ここに貼る</span>
              </div>
            </div>
          )}
          <form className="url-hero" onSubmit={handleTrace}>
            <div className="url-label">🔗 <b>ツイキャスの配信URL</b><small>例：twitcasting.tv/○○○</small></div>
            <div className="url-input-shell">
              <span className="link-mark">↗</span>
              <input
                value={targetInput}
                onChange={(event) => setTargetInput(event.target.value)}
                placeholder="https://twitcasting.tv/○○○  ← この形のURLを貼る"
                disabled={busy}
                autoFocus
                aria-label="ツイキャスの配信URLを貼る欄"
                autoComplete="off"
                spellCheck={false}
              />
              {!targetInput && (
                <button type="button" className="paste-button" onClick={pasteTwitCastingUrl} disabled={busy}>📋 貼り付け</button>
              )}
              {targetInput && <button type="button" className="clear-input" onClick={() => setTargetInput('')} aria-label="入力を消す">×</button>}
            </div>
            {dashboard.tracker.isRunning ? (
              <button type="button" className="peek-button stop" onClick={stopTrace} disabled={busy}>
                <span className="peek-cat">zzz</span>
                <span>いったん休む</span>
              </button>
            ) : (
              <button type="submit" className="peek-button" disabled={busy || !targetInput.trim()}>
                <span className="peek-cat">▶</span>
                <span>{busy ? '接続中…' : '視聴しに行く！'}</span>
                <i>✦</i>
              </button>
            )}
          </form>
          {!dashboard.tracker.isRunning && <div className="hero-note">配信URLはここへ<br /><b>貼り付けて開始 ✦</b><span>↙</span></div>}
        </section>

        <div className="vibe-ribbon" aria-hidden="true">
          <span>✦ コメントが流れる</span>
          <span>⌁ 配信の流れが見える</span>
          <span>⌁ 盛り上がりをあとから振り返れる</span>
          <i>CASPULSEは、配信の流れを見やすくするローカルビューア。</i>
        </div>

        {clipboardCandidate && !targetInput && (
          <button type="button" className="clipboard-toast" onClick={() => {
            setTargetInput(clipboardCandidate);
            setClipboardCandidate(null);
          }}>
            <span>📎</span><div><b>ツイキャスURLを検出</b><small>クリップボードから貼り付け</small></div><em>入力する →</em>
          </button>
        )}

        {error && (
          <div className="error-banner">
            <span className="error-face">!</span>
            <div><b>接続できませんでした。</b><span>{error}</span></div>
            <button type="button" onClick={() => setError(null)}>×</button>
          </div>
        )}

        <section className="dashboard-grid">
          <aside className="left-rail">
            <article className={`stream-card sticker-card ${live ? 'is-live' : ''}`}>
              <div className="stream-card-head">
                <span className="live-badge">{live ? '● 配信中' : dashboard.tracker.isRunning ? '☾ 配信待機中' : '☆ 未接続'}</span>
                <time>{live && dashboard.liveMovie ? durationText(dashboard.liveMovie.duration) : '--:--:--'}</time>
              </div>
              <div className="stream-visual">
                {live && liveThumbnail ? (
                  <>
                    <img src={liveThumbnail} alt={`${selectedUser?.name ?? ''}の配信サムネイル`} />
                    <div className="thumbnail-shine" />
                    <span className="thumbnail-live">LIVE</span>
                    <span className="thumbnail-note">現在の配信サムネイル</span><span className="thumbnail-sticker">LIVE NOW ✦</span>
                  </>
                ) : selectedUser?.image ? (
                  <div className="offline-portrait">
                    <img src={selectedUser.image} alt="" />
                    <div><span>現在はオフライン</span><b>配信開始を待機中</b></div>
                  </div>
                ) : (
                  <div className="empty-stream-art">
                    <img src="./assets/caspulse-icon.png" alt="" />
                    <b>配信URLを入力してください</b>
                    <span>上の入力欄にツイキャスURLを貼り付けます。</span>
                  </div>
                )}
              </div>
              <div className="stream-title">{dashboard.liveMovie?.title || (selectedUser ? `${selectedUser.name} の次の配信を待機中` : '配信URLを入力してください')}</div>
              <div className="stream-person">
                {selectedUser ? (
                  <>
                    <img src={selectedUser.image} alt="" />
                    <div><b>{selectedUser.name}</b><span>@{selectedUser.screenId}</span></div>
                    <button type="button" onClick={openStream} title="ツイキャスで開く">↗</button>
                  </>
                ) : <div className="no-person">追跡中の配信者はいません。</div>}
              </div>
              {selectedUser && (
                <div className="stream-tags">
                  <span>{live ? '配信中' : '待機中'}</span>
                  <span>固定IDで追跡</span>
                  {dashboard.liveMovie?.subtitle && <span>{dashboard.liveMovie.subtitle}</span>}
                </div>
              )}
            </article>

            <article className="comments-card sticker-card">
              <div className="card-title-row">
                <div><span className="section-kicker">リアルタイムコメント</span><h3>💬 コメント</h3></div>
                <span>{dashboard.comments.length ? `${dashboard.comments.length}件` : '待機中'}</span>
              </div>
              <div className="comment-list">
                {recentComments.length === 0 ? (
                  <div className="comments-empty"><span>☁</span><b>コメント待機中</b><small>配信につながると、ここにコメントを表示します。</small></div>
                ) : recentComments.map((comment) => (
                  <div className="comment-row" key={comment.commentId}>
                    <img src={comment.image} alt="" />
                    <time>{shortTime(comment.createdAt)}</time>
                    <b>{comment.name}</b>
                    <span>{comment.message}</span>
                  </div>
                ))}
              </div>
              <div className="comment-footnote">コメントは時系列で表示されます。</div>
            </article>
          </aside>

          <section className="center-stage">
            <div className="metric-row">
              <article className="metric-card cyan sticker-card">
                <div className="metric-icon">👥</div>
                <div><span>見てる人</span><strong>{latestMetric ? compactNumber(latestMetric.currentViewers) : '—'}</strong></div>
                <small>{latestMetric ? `${latestMetric.viewerDelta >= 0 ? '↑ +' : '↓ '}${latestMetric.viewerDelta} / 10秒` : 'つながると見えるよ'}</small>
                <em>{latestMetric?.viewerDelta && latestMetric.viewerDelta > 0 ? 'UP' : 'LIVE'}</em><i className="metric-doodle">✦</i>
              </article>
              <article className="metric-card pink sticker-card">
                <div className="metric-icon">💬</div>
                <div><span>コメ / 分</span><strong>{latestMetric ? latestMetric.commentsPerMinute : '—'}</strong></div>
                <small>{latestMetric ? `${latestMetric.uniqueCommenters}人が参加中` : 'コメントの流れ'}</small>
                <em>{latestMetric && latestMetric.commentsPerMinute >= 20 ? 'ACTIVE' : 'STEADY'}</em><i className="metric-doodle">●</i>
              </article>
              <article className="metric-card yellow sticker-card">
                <div className="metric-icon">🔥</div>
                <div><span>勢い</span><strong>{latestMetric ? `${latestMetric.momentum >= 0 ? '+' : ''}${latestMetric.momentum}%` : '—'}</strong></div>
                <small>{latestMetric ? vibeWord(latestMetric.momentum) : '次の波は？'}</small>
                <em>{latestMetric && latestMetric.momentum >= 100 ? 'RISING' : 'STABLE'}</em><i className="metric-doodle">↗</i>
              </article>
              <article className="metric-card mint sticker-card">
                <div className="metric-icon">📡</div>
                <div><span>いま</span><strong>{live ? '配信中' : dashboard.tracker.isRunning ? '待機中' : 'READY'}</strong></div>
                <small>{live ? 'ライブデータ取得中' : dashboard.tracker.isRunning ? '次の配信を待機中' : 'URL入力で開始'}</small>
                <em>{live ? 'LIVE' : '—'}</em><i className="metric-doodle">⌁</i>
              </article>
            </div>

            <MultiPulseChart metrics={dashboard.metrics} />

            <article className="terminal-section sticker-card">
              <div className="terminal-head">
                <div className="terminal-title">
                  <span className="terminal-prompt">&gt;_</span>
                  <div><h3>ライブログ</h3><small>配信イベントとコメントを時系列で表示。</small></div>
                </div>
                <div className="terminal-switches">
                  <label><input type="checkbox" checked={ttsEnabled} onChange={(event) => setTtsEnabled(event.target.checked)} /> 読み上げ</label>
                  <label><input type="checkbox" checked={ttsIncludeName} onChange={(event) => setTtsIncludeName(event.target.checked)} disabled={!ttsEnabled} /> 名前も</label>
                  <label><input type="checkbox" checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)} /> 自動スクロール</label>
                </div>
              </div>
              <div className="terminal-tools">
                <span>配信ログをリアルタイム表示</span>
                <input value={terminalFilter} onChange={(event) => setTerminalFilter(event.target.value)} placeholder="ログを検索…" />
                <button type="button" onClick={() => setTerminal([])}>クリア</button>
              </div>
              <div className="terminal-body">
                {filteredTerminal.length === 0 && (
                  <div className="terminal-placeholder"><b>CASPULSE&gt;</b> 接続待機中。<br /><span>配信URLを入力して「視聴しに行く！」を押してください。</span></div>
                )}
                {filteredTerminal.map((line) => (
                  <div className={`terminal-line kind-${line.kind}`} key={line.id}>
                    <time>{formatTime(line.at)}</time>
                    <b>[{friendlyLabel(line.label)}]</b>
                    <span className="line-message">{line.message}</span>
                    {line.detail && <small>{line.detail}</small>}
                  </div>
                ))}
                <div ref={terminalEndRef} />
              </div>
              <div className="terminal-doodle">LIVE<br />PULSE <span>⌁</span></div>
            </article>
          </section>

          <aside className="right-rail">
            <article className="mood-card sticker-card">
              <div className="card-title-row mood-title">
                <div><span className="section-kicker">現在のデータから</span><h3>✦ 配信の様子</h3></div>
                <span className="beta-pill">BETA</span>
              </div>
              <div className="mood-speech">
                <img src="./assets/caspulse-icon.png" alt="" />
                <p>{live && latestMetric
                  ? `${activityWord(latestMetric.activityScore)}。現在の配信状況です。`
                  : dashboard.tracker.isRunning
                    ? '現在はオフラインです。次の配信を待機しています。'
                    : '配信に接続すると、現在の傾向を表示します。'}</p>
              </div>
              <div className="mood-lines">
                {atmosphere.map((line, index) => <div key={`${line.icon}-${index}`}><span>{line.icon}</span><p>{line.text}</p></div>)}
              </div>
              <div className="mood-note">現在は数値ベースの表示です。文脈サマリーは今後追加予定です。</div>
            </article>

            <article className="recent-card sticker-card">
              <div className="card-title-row"><h3>◷ 最近つないだ配信</h3><span>{dashboard.trackedUsers.length}</span></div>
              <div className="recent-list">
                {dashboard.trackedUsers.length === 0 ? (
                  <div className="recent-empty">履歴はまだありません。</div>
                ) : dashboard.trackedUsers.slice(0, 6).map((user) => {
                  const active = dashboard.tracker.trackedUserId === user.userId && dashboard.tracker.isRunning;
                  return (
                    <div className={`recent-user ${user.userId === selectedUserId ? 'selected' : ''}`} key={user.userId}>
                      <button type="button" className="recent-main" onClick={() => startRecent(user)} disabled={busy}>
                        <img src={user.image} alt="" />
                        <span><b>{user.name}</b><small>@{user.screenId}</small></span>
                        {active && <i>●</i>}
                      </button>
                      <button type="button" className="remove-recent" onClick={() => removeRecent(user)} title="履歴から外す">×</button>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="cozy-card sticker-card">
              <div className="cozy-sign">好きな配信を<br /><b>自分のペースで。</b></div>
              <div className="cozy-art"><span className="headphones">🎧</span><img src="./assets/caspulse-icon.png" alt="" /><span className="mug">☕</span></div>
              <p>コメントと盛り上がりを、<br />ひとつの画面で。</p>
              <b className="cozy-brand">CASPULSE⌁</b>
            </article>
          </aside>
        </section>
      </main>

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSettingsOpen(false);
        }}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-label="CASPULSE settings">
            <div className="modal-head">
              <div><span className="modal-kicker">⚙ SETTINGS</span><h2>CASPULSEの設定</h2></div>
              <button type="button" onClick={() => setSettingsOpen(false)}>×</button>
            </div>

            <div className="connection-card">
              <div className={`connection-orb ${relayOnline ? 'online' : ''}`}>{relayOnline ? '✓' : '○'}</div>
              <div>
                <b>{relayOnline ? 'CASPULSE Relay 接続済み' : 'CASPULSE Relayに接続できません'}</b>
                <span>ツイキャスへのログイン・Client ID入力は不要。</span>
              </div>
              <span className="setting-value">{relayOnline ? 'READY' : 'CHECK'}</span>
            </div>

            <div className="simple-setting-row"><div><b>💬 コメント読み上げ</b><span>ホーム画面からON/OFFを切り替えられます。</span></div><span className="setting-value">{ttsEnabled ? 'ON' : 'OFF'}</span></div>
            <div className="simple-setting-row"><div><b>💾 保存</b><span>コメントと盛り上がり記録はローカルSQLite。</span></div><span className="setting-value">LOCAL</span></div>

            <details className="advanced-settings">
              <summary>このアプリについて</summary>
              <p>配信情報の取得にはCASPULSE Relayを使用します。コメント履歴と盛り上がり記録はこのPCのSQLiteに保存します。</p>
              <div className="dev-info-row"><span>MODE</span><b>ANONYMOUS VIEWER</b></div>
              <div className="dev-info-row"><span>RELAY</span><code>https://caspulse-relay.vercel.app</code></div>
              <small>CASPULSE独自のアカウント登録やツイキャスOAuthは不要。</small>
            </details>
          </section>
        </div>
      )}
    </div>
  );
}
