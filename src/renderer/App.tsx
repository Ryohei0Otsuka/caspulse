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
  if (value >= 250) return '爆アガり';
  if (value >= 100) return 'ぐんぐん';
  if (value >= 35) return 'いい感じ';
  if (value <= -50) return 'ひとやすみ';
  return 'まったり';
}

function activityWord(value: number): string {
  if (value >= 85) return 'お祭りみたい！';
  if (value >= 65) return 'かなりわいわい';
  if (value >= 40) return 'いいノリ';
  if (value >= 15) return 'じわじわきてる';
  return 'のんびりタイム';
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
          <div className="section-kicker">〰 みんなの声が、波になる。</div>
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
          <strong>まだ波はしずか。</strong>
          <span>配信につながると、ここにコメントと視聴者の波が出てくるよ。</span>
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
              <b>このへん、わいわい！</b>
              <span>ノリ {peak.activityScore}</span>
            </div>
          )}
          {latest && latest.momentum >= 100 && (
            <div className="chart-bubble now-bubble">
              <b>いま伸びてる！</b>
              <span>勢い +{latest.momentum}%</span>
            </div>
          )}
          <div className="chart-doodle">みんなの声が<br />波になる！♡</div>
        </div>
      )}
    </article>
  );
}

function atmosphereLines(metric: StreamMetric | null, isLive: boolean): Array<{ icon: string; text: string }> {
  if (!isLive) {
    return [
      { icon: '🌙', text: 'いまは配信待ち。次の配信をのんびり待ってるよ。' },
      { icon: '🔗', text: '一度つないだ人は、固定IDで次回も追いかける。' },
      { icon: '💾', text: 'コメントや波の記録は、このPCの中に保存。' },
    ];
  }
  if (!metric) {
    return [
      { icon: '📡', text: '配信につながった！ いま空気を見ているところ。' },
      { icon: '💬', text: 'コメントが流れ始めると、ここもだんだん賑やかになるよ。' },
    ];
  }

  const lines: Array<{ icon: string; text: string }> = [];
  if (metric.commentsPerMinute >= 30) lines.push({ icon: '💬', text: `コメント多め！ いま ${metric.commentsPerMinute} コメ/分。` });
  else if (metric.commentsPerMinute > 0) lines.push({ icon: '☁️', text: `コメントは ${metric.commentsPerMinute} コメ/分。まったり流れてる。` });
  else lines.push({ icon: '🍵', text: 'コメントはひと休み中。静かな時間も配信のうち。' });

  if (metric.viewerDelta > 0) lines.push({ icon: '👀', text: `見てる人が増えてる。直近で +${metric.viewerDelta} 人。` });
  else if (metric.viewerDelta < 0) lines.push({ icon: '🌿', text: '見てる人数はいま少し落ち着き気味。' });
  else lines.push({ icon: '✨', text: '見てる人数はだいたいキープ中。' });

  if (metric.momentum >= 100) lines.push({ icon: '🔥', text: 'コメントの勢いが一気に上向き！ 何か起きてるかも。' });
  else if (metric.momentum >= 25) lines.push({ icon: '📈', text: 'じわっと盛り上がってきてる。' });
  else if (metric.momentum <= -50) lines.push({ icon: '🫧', text: 'さっきより少し静か。次の波待ち。' });
  else lines.push({ icon: '💜', text: 'ノリは安定。みんなでゆるっと見てる感じ。' });

  return lines.slice(0, 4);
}

function friendlyLabel(label: string): string {
  const map: Record<string, string> = {
    AUTH: 'つないだ',
    INPUT: 'ぺたっ',
    RESOLVE: 'みつけた',
    TRACE: 'おいかけ',
    LIVE: '配信きた！',
    CHAT: 'コメ',
    PULSE: 'ノリ',
    WAIT: 'まち',
    END: 'おつかれ',
    STOP: 'ストップ',
    IDENTITY: 'ID更新',
    SYNC: 'まとめて',
    ERROR: 'あれ？',
    COMMENT: 'コメ？',
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
      <div className="sparkles" aria-hidden="true">✦　·　♡　✧　·　✦</div>

      <header className="topbar">
        <div className="brand-wrap">
          <img className="brand-icon" src="./assets/caspulse-icon.png" alt="CASPULSE" />
          <div className="brand-copy">
            <div className="brand-line"><h1>CASPULSE</h1><span className="heartbeat">⌁</span></div>
            <p>ツイキャスの“いま”を、いっしょに楽しもう。</p>
          </div>
          <div className="brand-sticker">すきな配信、<br /><b>もっとたのしく。♡</b></div>
        </div>

        <nav className="nav-tabs" aria-label="CASPULSE navigation">
          <button type="button" className="nav-tab active">⌂ <span>ホーム</span></button>
          <button type="button" className="nav-tab soon" title="これから追加予定">◷ <span>履歴</span><small>soon</small></button>
          <button type="button" className="nav-tab" onClick={() => setSettingsOpen(true)}>⚙ <span>設定</span></button>
        </nav>

        <div className="top-message">
          <span>好きな配信が、</span>
          <b>もっと好きになる。♡</b>
          <small className={relayOnline ? 'connected' : ''}>
            {relayOnline === null ? '○ Relayを確認中…' : relayOnline ? '● URLを貼るだけでOK' : '○ Relayにつながらない'}
          </small>
        </div>
      </header>

      <main className="page-wrap">
        <section className="hero-wrap">
          <form className="url-hero" onSubmit={handleTrace}>
            <div className="url-label">🔗 <b>配信URLをぺたっ</b><span> ฅ^•ﻌ•^ฅ</span></div>
            <div className="url-input-shell">
              <span className="link-mark">↗</span>
              <input
                value={targetInput}
                onChange={(event) => setTargetInput(event.target.value)}
                placeholder={EXAMPLE_URL}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
              />
              {targetInput && <button type="button" className="clear-input" onClick={() => setTargetInput('')} aria-label="入力を消す">×</button>}
            </div>
            {dashboard.tracker.isRunning ? (
              <button type="button" className="peek-button stop" onClick={stopTrace} disabled={busy}>
                <span className="peek-cat">zzz</span>
                <span>いったん休む</span>
              </button>
            ) : (
              <button type="submit" className="peek-button" disabled={busy || !targetInput.trim()}>
                <span className="peek-cat">ฅ</span>
                <span>{busy ? 'つないでる…' : 'のぞきにいく！'}</span>
                <i>✦</i>
              </button>
            )}
          </form>
          <div className="hero-note">推しの配信を<br /><b>つないでみよう！</b><span>↙</span></div>
        </section>

        <div className="vibe-ribbon" aria-hidden="true">
          <span>✦ コメントが流れる</span>
          <span>♡ 配信の波が見える</span>
          <span>⌁ 盛り上がりをあとから振り返れる</span>
          <i>CASPULSEは、配信の横に置く小さな相棒。</i>
        </div>

        {clipboardCandidate && !targetInput && (
          <button type="button" className="clipboard-toast" onClick={() => {
            setTargetInput(clipboardCandidate);
            setClipboardCandidate(null);
          }}>
            <span>📎</span><div><b>ツイキャスのURLみつけた！</b><small>クリップボードから入れる</small></div><em>これを見る →</em>
          </button>
        )}

        {error && (
          <div className="error-banner">
            <span className="error-face">( ; ᯅ ; )</span>
            <div><b>うまくつながらなかった。</b><span>{error}</span></div>
            <button type="button" onClick={() => setError(null)}>×</button>
          </div>
        )}

        <section className="dashboard-grid">
          <aside className="left-rail">
            <article className={`stream-card sticker-card ${live ? 'is-live' : ''}`}>
              <div className="stream-card-head">
                <span className="live-badge">{live ? '● ただいま配信中！' : dashboard.tracker.isRunning ? '☾ 次の配信まち' : '☆ まだつないでないよ'}</span>
                <time>{live && dashboard.liveMovie ? durationText(dashboard.liveMovie.duration) : '--:--:--'}</time>
              </div>
              <div className="stream-visual">
                {live && liveThumbnail ? (
                  <>
                    <img src={liveThumbnail} alt={`${selectedUser?.name ?? ''}の配信サムネイル`} />
                    <div className="thumbnail-shine" />
                    <span className="thumbnail-live">LIVE</span>
                    <span className="thumbnail-note">いま、この瞬間。<br />ちゃんとここに。♡</span><span className="thumbnail-sticker">LIVE NOW ✦</span>
                  </>
                ) : selectedUser?.image ? (
                  <div className="offline-portrait">
                    <img src={selectedUser.image} alt="" />
                    <div><span>また配信きたら</span><b>ここが動き出すよ。♡</b></div>
                  </div>
                ) : (
                  <div className="empty-stream-art">
                    <img src="./assets/caspulse-icon.png" alt="" />
                    <b>配信をつないでみよう</b>
                    <span>URLを上にぺたっと貼るだけ。</span>
                  </div>
                )}
              </div>
              <div className="stream-title">{dashboard.liveMovie?.title || (selectedUser ? `${selectedUser.name} の次の配信を待ってるよ` : '好きな配信を、ここに。')}</div>
              <div className="stream-person">
                {selectedUser ? (
                  <>
                    <img src={selectedUser.image} alt="" />
                    <div><b>{selectedUser.name}</b><span>@{selectedUser.screenId}</span></div>
                    <button type="button" onClick={openStream} title="ツイキャスで開く">↗</button>
                  </>
                ) : <div className="no-person">まだ誰もおいかけてないよ。</div>}
              </div>
              {selectedUser && (
                <div className="stream-tags">
                  <span>{live ? '配信中' : '待機中'}</span>
                  <span>固定IDでおいかけ</span>
                  {dashboard.liveMovie?.subtitle && <span>{dashboard.liveMovie.subtitle}</span>}
                </div>
              )}
            </article>

            <article className="comments-card sticker-card">
              <div className="card-title-row">
                <div><span className="section-kicker">みんなの声、ながれてく。</span><h3>💬 コメントながれ</h3></div>
                <span>{dashboard.comments.length ? `${dashboard.comments.length}件` : 'まだ静か'}</span>
              </div>
              <div className="comment-list">
                {recentComments.length === 0 ? (
                  <div className="comments-empty"><span>☁</span><b>コメント待ち。</b><small>配信につながると、ここにふわっと流れてくるよ。</small></div>
                ) : recentComments.map((comment) => (
                  <div className="comment-row" key={comment.commentId}>
                    <img src={comment.image} alt="" />
                    <time>{shortTime(comment.createdAt)}</time>
                    <b>{comment.name}</b>
                    <span>{comment.message}</span>
                  </div>
                ))}
              </div>
              <div className="comment-footnote">たくさんの「すき」が、ここに流れる。♡</div>
            </article>
          </aside>

          <section className="center-stage">
            <div className="metric-row">
              <article className="metric-card cyan sticker-card">
                <div className="metric-icon">👥</div>
                <div><span>見てる人</span><strong>{latestMetric ? compactNumber(latestMetric.currentViewers) : '—'}</strong></div>
                <small>{latestMetric ? `${latestMetric.viewerDelta >= 0 ? '↑ +' : '↓ '}${latestMetric.viewerDelta} / 10秒` : 'つながると見えるよ'}</small>
                <em>{latestMetric?.viewerDelta && latestMetric.viewerDelta > 0 ? 'わーい！' : 'ちらっ'}</em><i className="metric-doodle">✦</i>
              </article>
              <article className="metric-card pink sticker-card">
                <div className="metric-icon">💬</div>
                <div><span>コメ / 分</span><strong>{latestMetric ? latestMetric.commentsPerMinute : '—'}</strong></div>
                <small>{latestMetric ? `${latestMetric.uniqueCommenters}人が参加中` : 'コメントの流れ'}</small>
                <em>{latestMetric && latestMetric.commentsPerMinute >= 20 ? 'コメ多い！' : 'ゆるゆる'}</em><i className="metric-doodle">♡</i>
              </article>
              <article className="metric-card yellow sticker-card">
                <div className="metric-icon">🔥</div>
                <div><span>勢い</span><strong>{latestMetric ? `${latestMetric.momentum >= 0 ? '+' : ''}${latestMetric.momentum}%` : '—'}</strong></div>
                <small>{latestMetric ? vibeWord(latestMetric.momentum) : '次の波は？'}</small>
                <em>{latestMetric && latestMetric.momentum >= 100 ? 'きてる！' : 'ふわっ'}</em><i className="metric-doodle">↗</i>
              </article>
              <article className="metric-card mint sticker-card">
                <div className="metric-icon">📡</div>
                <div><span>いま</span><strong>{live ? '配信中！' : dashboard.tracker.isRunning ? '待ってる' : 'READY'}</strong></div>
                <small>{live ? 'みんなでわいわい中！' : dashboard.tracker.isRunning ? '次の配信を見守り中' : 'URLぺたっで開始'}</small>
                <em>{live ? '♡' : 'zzz'}</em><i className="metric-doodle">⌁</i>
              </article>
            </div>

            <MultiPulseChart metrics={dashboard.metrics} />

            <article className="terminal-section sticker-card">
              <div className="terminal-head">
                <div className="terminal-title">
                  <span className="terminal-prompt">&gt;_</span>
                  <div><h3>わいわいログ</h3><small>配信の“いま”が、ここに流れる。</small></div>
                </div>
                <div className="terminal-switches">
                  <label><input type="checkbox" checked={ttsEnabled} onChange={(event) => setTtsEnabled(event.target.checked)} /> 読み上げ</label>
                  <label><input type="checkbox" checked={ttsIncludeName} onChange={(event) => setTtsIncludeName(event.target.checked)} disabled={!ttsEnabled} /> 名前も</label>
                  <label><input type="checkbox" checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)} /> ついてく</label>
                </div>
              </div>
              <div className="terminal-tools">
                <span>ฅ 配信をいっしょに見てるよ。</span>
                <input value={terminalFilter} onChange={(event) => setTerminalFilter(event.target.value)} placeholder="ログをさがす…" />
                <button type="button" onClick={() => setTerminal([])}>おそうじ</button>
              </div>
              <div className="terminal-body">
                {filteredTerminal.length === 0 && (
                  <div className="terminal-placeholder"><b>CASPULSE&gt;</b> ここはまだ静か。<br /><span>URLをぺたっとして「のぞきにいく！」を押してみてね。</span></div>
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
              <div className="terminal-doodle">いっしょに<br />みてるよ！♡ <span>ᓚᘏᗢ</span></div>
            </article>
          </section>

          <aside className="right-rail">
            <article className="mood-card sticker-card">
              <div className="card-title-row mood-title">
                <div><span className="section-kicker">数字から、そっと。</span><h3>✦ いまこんな感じ</h3></div>
                <span className="beta-pill">そっと観測中</span>
              </div>
              <div className="mood-speech">
                <img src="./assets/caspulse-icon.png" alt="" />
                <p>{live && latestMetric
                  ? `${activityWord(latestMetric.activityScore)}。いまの配信の空気を見てるよ。`
                  : dashboard.tracker.isRunning
                    ? '次の配信を待ちながら、ここで見守ってるよ。'
                    : '配信をつなぐと、ここの空気も動き出すよ。'}</p>
              </div>
              <div className="mood-lines">
                {atmosphere.map((line, index) => <div key={`${line.icon}-${index}`}><span>{line.icon}</span><p>{line.text}</p></div>)}
              </div>
              <div className="mood-note">いまは数字からそっと見てるだけ。AIで文脈まで読めるようになるのは、もう少し先。♡</div>
            </article>

            <article className="recent-card sticker-card">
              <div className="card-title-row"><h3>🐾 最近つないだ配信</h3><span>{dashboard.trackedUsers.length}</span></div>
              <div className="recent-list">
                {dashboard.trackedUsers.length === 0 ? (
                  <div className="recent-empty">まだないよ。最初のURLをぺたっとどうぞ。</div>
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
              <div className="cozy-sign">すきな時間を<br /><b>いっしょに。♡</b></div>
              <div className="cozy-art"><span className="headphones">🎧</span><img src="./assets/caspulse-icon.png" alt="" /><span className="mug">☕</span></div>
              <p>ツイキャスでつながる、<br />みんなのたのしい居場所。</p>
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
              <div><span className="modal-kicker">⚙ ちょこっと設定</span><h2>CASPULSEの設定</h2></div>
              <button type="button" onClick={() => setSettingsOpen(false)}>×</button>
            </div>

            <div className="connection-card">
              <div className={`connection-orb ${relayOnline ? 'online' : ''}`}>{relayOnline ? '✓' : '○'}</div>
              <div>
                <b>{relayOnline ? 'CASPULSE Relayにつながってるよ' : 'Relayを確認できないみたい'}</b>
                <span>ツイキャスへのログイン・Client ID入力は不要。</span>
              </div>
              <span className="setting-value">{relayOnline ? 'READY' : 'CHECK'}</span>
            </div>

            <div className="simple-setting-row"><div><b>💬 コメント読み上げ</b><span>ホーム画面の「読み上げ」でON/OFFできるよ。</span></div><span className="setting-value">{ttsEnabled ? 'ON' : 'OFF'}</span></div>
            <div className="simple-setting-row"><div><b>💾 保存</b><span>コメントと盛り上がり記録はローカルSQLite。</span></div><span className="setting-value">LOCAL</span></div>

            <details className="advanced-settings">
              <summary>このアプリについて</summary>
              <p>配信URL・配信情報の取得にはCASPULSE Relayを使うよ。コメント履歴や盛り上がり記録はこのPCのSQLiteに保存する。</p>
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
