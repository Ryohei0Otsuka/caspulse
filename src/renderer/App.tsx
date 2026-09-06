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

const emptyDashboard: DashboardPayload = {
  trackedUsers: [],
  auth: {
    connected: false,
    clientId: '',
    account: null,
    callbackUrl: '',
    secureStorageAvailable: true,
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
  if (value >= 85) return 'お祭り！';
  if (value >= 65) return 'かなりわいわい';
  if (value >= 40) return 'いいノリ';
  if (value >= 15) return 'じわじわ';
  return 'のんびり';
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
    const y = height - ((value - min) / range) * (height - 24) - 12;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function MultiPulseChart({ metrics }: { metrics: StreamMetric[] }) {
  const width = 860;
  const height = 240;
  const last = metrics.slice(-80);
  const viewers = last.map((metric) => metric.currentViewers);
  const comments = last.map((metric) => metric.commentsPerMinute);
  const viewersPoints = pointsFor(viewers, width, height);
  const commentsPoints = pointsFor(comments, width, height);

  const latest = last.at(-1);
  const peak = last.reduce<StreamMetric | null>((best, metric) => {
    if (!best || metric.activityScore > best.activityScore) return metric;
    return best;
  }, null);

  return (
    <div className="pulse-board">
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
          <strong>まだ波はしずか。</strong>
          <span>配信につながると、ここにコメントと視聴者の波が出てくるよ。</span>
        </div>
      ) : (
        <div className="pulse-chart-wrap">
          <svg className="pulse-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="いまの盛り上がり">
            <defs>
              <linearGradient id="viewer-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#47dff2" stopOpacity=".30" />
                <stop offset="100%" stopColor="#47dff2" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="comment-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff67d4" stopOpacity=".26" />
                <stop offset="100%" stopColor="#ff67d4" stopOpacity="0" />
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
        </div>
      )}
    </div>
  );
}

function atmosphereLines(metric: StreamMetric | null, isLive: boolean): Array<{ icon: string; text: string }> {
  if (!isLive) {
    return [
      { icon: '🌙', text: 'いまは配信待ち。次の配信をのんびり待ってるよ。' },
      { icon: '🔗', text: 'URLをつないでおけば、同じ人の次回配信も追いかける。' },
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
  const [clientId, setClientId] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terminal, setTerminal] = useState<TerminalEvent[]>([]);
  const [terminalFilter, setTerminalFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsIncludeName, setTtsIncludeName] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  const refresh = async (userId?: string) => {
    const data = await window.caspulse.getDashboard(userId);
    setDashboard(data);
    setClientId(data.auth.clientId);
    if (data.selectedUser) setSelectedUserId(data.selectedUser.userId);
  };

  useEffect(() => {
    void window.caspulse.getBootstrap().then((data) => {
      setDashboard(data);
      setClientId(data.auth.clientId);
      setSelectedUserId(data.selectedUser?.userId ?? null);
    }).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));

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
          ? [
              update.trackedUser,
              ...current.trackedUsers.filter((user) => user.userId !== update.trackedUser?.userId),
            ]
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
    void refresh(selectedUserId).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [selectedUserId]);

  const latestMetric = dashboard.metrics.at(-1) ?? null;
  const selectedUser = dashboard.selectedUser;
  const trackingSelected = Boolean(
    selectedUserId
    && dashboard.tracker.isRunning
    && dashboard.tracker.trackedUserId === selectedUserId,
  );
  const live = Boolean(trackingSelected && dashboard.tracker.isLive && dashboard.liveMovie);

  const filteredTerminal = useMemo(() => {
    const query = terminalFilter.trim().toLowerCase();
    if (!query) return terminal;
    return terminal.filter((line) => `${line.label} ${line.message} ${line.detail ?? ''}`.toLowerCase().includes(query));
  }, [terminal, terminalFilter]);

  const recentComments = dashboard.comments.slice(-10).reverse();
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
    if (!dashboard.auth.connected) {
      setSettingsOpen(true);
      return;
    }
    void runAction(async () => {
      const result = await window.caspulse.startTrackingInput(targetInput);
      setDashboard(result.dashboard);
      setSelectedUserId(result.target.userId);
      setTargetInput(`https://twitcasting.tv/${result.target.screenId}`);
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

  const connectOAuth = () => {
    void runAction(async () => {
      const auth = await window.caspulse.authStart(clientId);
      setDashboard((current) => ({ ...current, auth }));
      setManualToken('');
      setSettingsOpen(false);
    });
  };

  const importToken = () => {
    void runAction(async () => {
      const auth = await window.caspulse.authImportToken(manualToken);
      setDashboard((current) => ({ ...current, auth }));
      setManualToken('');
      setSettingsOpen(false);
    });
  };

  const disconnect = () => {
    void runAction(async () => {
      const auth = await window.caspulse.authDisconnect();
      setDashboard((current) => ({
        ...current,
        auth,
        tracker: { ...current.tracker, isRunning: false, isLive: false, activeMovieId: null },
        liveMovie: null,
      }));
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
    if (dashboard.liveMovie?.link) void window.caspulse.openExternal(dashboard.liveMovie.link);
    else if (selectedUser) void window.caspulse.openExternal(`https://twitcasting.tv/${selectedUser.screenId}`);
  };

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="ambient ambient-three" />

      <header className="topbar">
        <div className="brand-wrap">
          <img className="brand-icon" src="/assets/caspulse-icon.png" alt="CASPULSE" />
          <div className="brand-copy">
            <div className="brand-line"><h1>CASPULSE</h1><span className="heartbeat">⌁</span></div>
            <p>ツイキャスの“いま”を、いっしょに楽しもう。</p>
          </div>
          <div className="brand-sticker">すきな配信、<br /><b>もっとたのしく。♡</b></div>
        </div>

        <nav className="nav-tabs" aria-label="CASPULSE navigation">
          <button className="nav-tab active">⌂ <span>ホーム</span></button>
          <button className="nav-tab soon" title="v0.2で追加予定">◷ <span>履歴</span><small>soon</small></button>
          <button className="nav-tab" onClick={() => setSettingsOpen(true)}>⚙ <span>設定</span></button>
        </nav>

        <div className="top-message">
          <span>好きな配信が、</span>
          <b>もっと好きになる。♡</b>
          <small className={dashboard.auth.connected ? 'connected' : ''}>
            {dashboard.auth.connected ? `● @${dashboard.auth.account?.screen_id} と接続中` : '○ APIはまだつながってないよ'}
          </small>
        </div>
      </header>

      <main className="page-wrap">
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

        {error && (
          <div className="error-banner">
            <span className="error-face">( ; ᯅ ; )</span>
            <div><b>うまくつながらなかった。</b><span>{error}</span></div>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <section className="dashboard-grid">
          <aside className="left-rail">
            <article className={`stream-card ${live ? 'is-live' : ''}`}>
              <div className="stream-card-head">
                <span className="live-badge">{live ? '◉ ただいま配信中！' : dashboard.tracker.isRunning ? '☾ 次の配信まち' : '☆ まだつないでないよ'}</span>
                <time>{live && dashboard.liveMovie ? durationText(dashboard.liveMovie.duration) : '--:--:--'}</time>
              </div>
              <div className="stream-visual">
                {live && dashboard.liveMovie?.large_thumbnail ? (
                  <img src={dashboard.liveMovie.large_thumbnail} alt="配信サムネイル" />
                ) : selectedUser?.image ? (
                  <div className="offline-portrait">
                    <img src={selectedUser.image} alt="" />
                    <div><span>また配信きたら</span><b>ここが動き出すよ。♡</b></div>
                  </div>
                ) : (
                  <div className="empty-stream-art">
                    <div className="big-cat">ᓚᘏᗢ</div>
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
                    <button onClick={openStream} title="ツイキャスで開く">↗</button>
                  </>
                ) : (
                  <div className="no-person">まだ誰もおいかけてないよ。</div>
                )}
              </div>
              {selectedUser && (
                <div className="stream-tags">
                  <span>uid:{selectedUser.userId}</span>
                  <span>{live ? 'LIVE' : 'WAITING'}</span>
                  {dashboard.liveMovie && <span>movie:{dashboard.liveMovie.id}</span>}
                </div>
              )}
            </article>

            <article className="comments-card">
              <div className="card-title-row">
                <h3>💬 コメントながれ</h3>
                <span>{dashboard.comments.length ? `${dashboard.comments.length}件` : 'まだ静か'}</span>
              </div>
              <div className="comment-list">
                {recentComments.length === 0 ? (
                  <div className="comments-empty">
                    <span>☁</span>
                    <b>コメント待ち。</b>
                    <small>配信につながると、ここにふわっと流れてくるよ。</small>
                  </div>
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
              <article className="metric-card cyan">
                <div className="metric-icon">👥</div>
                <div><span>見てる人</span><strong>{latestMetric ? compactNumber(latestMetric.currentViewers) : '—'}</strong></div>
                <small>{latestMetric ? `${latestMetric.viewerDelta >= 0 ? '↑ +' : '↓ '}${latestMetric.viewerDelta} / 10秒` : 'つながると見えるよ'}</small>
                <em>{latestMetric?.viewerDelta && latestMetric.viewerDelta > 0 ? 'わーい！' : 'ちらっ'}</em>
              </article>
              <article className="metric-card pink">
                <div className="metric-icon">💬</div>
                <div><span>コメ / 分</span><strong>{latestMetric ? latestMetric.commentsPerMinute : '—'}</strong></div>
                <small>{latestMetric ? `${latestMetric.uniqueCommenters}人が参加中` : 'コメントの流れ'}</small>
                <em>{latestMetric && latestMetric.commentsPerMinute >= 20 ? 'コメ多い！' : 'ゆるゆる'}</em>
              </article>
              <article className="metric-card yellow">
                <div className="metric-icon">🔥</div>
                <div><span>勢い</span><strong>{latestMetric ? `${latestMetric.momentum >= 0 ? '+' : ''}${latestMetric.momentum}%` : '—'}</strong></div>
                <small>{latestMetric ? vibeWord(latestMetric.momentum) : '次の波は？'}</small>
                <em>{latestMetric && latestMetric.momentum >= 100 ? 'きてる！' : 'ふわっ'}</em>
              </article>
              <article className="metric-card mint">
                <div className="metric-icon">📡</div>
                <div><span>いま</span><strong>{live ? '配信中！' : dashboard.tracker.isRunning ? '待ってる' : 'READY'}</strong></div>
                <small>{live ? 'みんなでわいわい中！' : dashboard.tracker.isRunning ? '次の配信を見張り中' : 'URLぺたっで開始'}</small>
                <em>{live ? '♡' : 'zzz'}</em>
              </article>
            </div>

            <MultiPulseChart metrics={dashboard.metrics} />

            <article className="terminal-section">
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
                <button onClick={() => setTerminal([])}>おそうじ</button>
              </div>
              <div className="terminal-body">
                {filteredTerminal.length === 0 && (
                  <div className="terminal-placeholder">
                    <b>CASPULSE&gt;</b> ここはまだ静か。<br />
                    <span>URLをぺたっとして「のぞきにいく！」を押してみてね。</span>
                  </div>
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
            <article className="mood-card">
              <div className="card-title-row mood-title">
                <div><span>✦ 配信の空気</span><h3>いまこんな感じ</h3></div>
                <span className="beta-pill">v0.1</span>
              </div>
              <div className="mood-speech">
                <div className="mini-bot">◉‿◉</div>
                <p>{live && latestMetric
                  ? `${activityWord(latestMetric.activityScore)}。数字から“いま”をそっと見てるよ。`
                  : dashboard.tracker.isRunning
                    ? '次の配信を待ちながら、ここで見守ってるよ。'
                    : '配信をつなぐと、ここの空気も動き出すよ。'}</p>
              </div>
              <div className="mood-lines">
                {atmosphere.map((line, index) => (
                  <div key={`${line.icon}-${index}`}><span>{line.icon}</span><p>{line.text}</p></div>
                ))}
              </div>
              <div className="mood-note">※ v0.1は実測値のひとこと。AI文脈まとめはこれから育てる。♡</div>
            </article>

            <article className="recent-card">
              <div className="card-title-row">
                <h3>🐾 最近つないだ配信</h3>
                <span>{dashboard.trackedUsers.length}</span>
              </div>
              <div className="recent-list">
                {dashboard.trackedUsers.length === 0 ? (
                  <div className="recent-empty">まだないよ。最初のURLをぺたっとどうぞ。</div>
                ) : dashboard.trackedUsers.slice(0, 6).map((user) => {
                  const active = dashboard.tracker.trackedUserId === user.userId && dashboard.tracker.isRunning;
                  return (
                    <div className={`recent-user ${user.userId === selectedUserId ? 'selected' : ''}`} key={user.userId}>
                      <button className="recent-main" onClick={() => startRecent(user)} disabled={busy || !dashboard.auth.connected}>
                        <img src={user.image} alt="" />
                        <span><b>{user.name}</b><small>@{user.screenId}</small></span>
                        {active && <i>●</i>}
                      </button>
                      <button className="remove-recent" onClick={() => removeRecent(user)} title="履歴から外す">×</button>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="cozy-card">
              <div className="cozy-sign">すきな時間を<br /><b>いっしょに。♡</b></div>
              <div className="cozy-art">
                <span className="headphones">🎧</span>
                <span className="cozy-cat">ᓚᘏᗢ</span>
                <span className="mug">☕</span>
              </div>
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
              <div><span className="modal-kicker">⚙ まずはここだけ</span><h2>ツイキャスとつなぐ</h2></div>
              <button onClick={() => setSettingsOpen(false)}>×</button>
            </div>

            <div className="settings-guide">
              <span>1</span><p>TwitCasting Developerでアプリを作る</p>
              <span>2</span><p>Client IDをここに貼る</p>
              <span>3</span><p>「ツイキャスとつなぐ」を押す</p>
            </div>

            <div className="settings-block">
              <label>CLIENT ID</label>
              <input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="TwitCasting Developer Client ID" />
              <p>Callback URL はこれに合わせてね。</p>
              <code className="callback-code">{dashboard.auth.callbackUrl || 'http://127.0.0.1:47831/oauth/callback'}</code>
              <button className="primary-wide" onClick={connectOAuth} disabled={busy || !clientId.trim()}>
                {busy ? 'つないでる…' : 'ツイキャスとつなぐ ✦'}
              </button>
            </div>

            <details className="advanced-settings">
              <summary>開発用：アクセストークンを直接入れる</summary>
              <p>開発確認用。保存時はElectron safeStorageで暗号化するよ。</p>
              <input type="password" value={manualToken} onChange={(event) => setManualToken(event.target.value)} placeholder="access_token" />
              <button className="ghost-wide" onClick={importToken} disabled={busy || !manualToken.trim()}>確認して保存</button>
            </details>

            <div className="settings-foot">
              <span className={dashboard.auth.connected ? 'connected-text' : ''}>
                {dashboard.auth.connected ? `@${dashboard.auth.account?.screen_id} とつながってるよ` : 'まだつながってないよ'}
              </span>
              {dashboard.auth.connected && <button className="danger-link" onClick={disconnect}>つながりを切る</button>}
            </div>
            {!dashboard.auth.secureStorageAvailable && (
              <div className="storage-warning">OSの安全な暗号化ストレージが使えないため、トークンは再起動後に残さないよ。</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
