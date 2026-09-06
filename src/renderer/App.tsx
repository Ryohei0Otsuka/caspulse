import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import type {
  CommentAuthStatus,
  DashboardPayload,
  StoredComment,
  StreamMetric,
  TerminalEvent,
  TrackerUpdate,
} from '../shared/types';

const THUMBNAIL_REFRESH_MS = 20_000;
const emptyDashboard: DashboardPayload = {
  auth: { connected: true, account: null, callbackUrl: '', secureStorageAvailable: true, appClientConfigured: true },
  tracker: { trackedUserId: null, isRunning: false, isLive: false, activeMovieId: null, lastCheckedAt: null, error: null },
  selectedUser: null,
  liveMovie: null,
  metrics: [],
  comments: [],
};
const emptyCommentAuth: CommentAuthStatus = { connected: false, account: null, secureStorageAvailable: true };

function formatTime(epoch: number, seconds = false) {
  return new Date(epoch * 1000).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });
}
function compact(value: number) { return new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 }).format(value); }
function cleanForSpeech(message: string) { return message.replace(/https?:\/\/\S+/gi, ' URL ').replace(/w{3,}/gi, ' わら ').slice(0, 180); }
function speechSupported() { return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window; }
function cancelSpeech() { if (speechSupported()) window.speechSynthesis.cancel(); }
function speakText(text: string, volume: number, rate: number) {
  if (!speechSupported()) return false;
  const synth = window.speechSynthesis;
  if (synth.paused) synth.resume();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.volume = Math.max(0, Math.min(1, volume));
  utterance.rate = Math.max(0.5, Math.min(2, rate));
  const voices = synth.getVoices();
  const japaneseVoice = voices.find(voice => voice.lang.toLowerCase().startsWith('ja'));
  if (japaneseVoice) utterance.voice = japaneseVoice;
  synth.speak(utterance);
  return true;
}
function speakComments(comments: StoredComment[], includeName: boolean, volume: number, rate: number) {
  for (const comment of comments.slice(-5)) {
    speakText(includeName ? `${comment.name}。${cleanForSpeech(comment.message)}` : cleanForSpeech(comment.message), volume, rate);
  }
}
function points(values: number[], width: number, height: number) {
  if (!values.length) return '';
  const max = Math.max(...values, 1), min = Math.min(...values, 0), range = Math.max(1, max - min);
  return values.map((v, i) => `${values.length === 1 ? width / 2 : (i / (values.length - 1)) * width},${height - ((v - min) / range) * (height - 20) - 10}`).join(' ');
}
function momentumText(v: number) {
  if (v >= 150) return '急上昇'; if (v >= 60) return '上昇中'; if (v >= 20) return 'やや上向き'; if (v <= -40) return '落ち着き気味'; return '安定';
}
function activityText(v: number) {
  if (v >= 80) return 'かなり活発'; if (v >= 60) return '盛り上がり中'; if (v >= 35) return 'いい流れ'; if (v >= 15) return '少し動きあり'; return '落ち着いています';
}
function friendlyLabel(label: string) {
  return ({ INPUT:'入力', RESOLVE:'確認', TRACE:'追跡', LIVE:'LIVE', CHAT:'コメント', POST:'投稿', PULSE:'勢い', WAIT:'待機', END:'終了', STOP:'切断', IDENTITY:'ID更新', SYNC:'同期', AUTH:'連携', ERROR:'エラー', COMMENT:'コメント' } as Record<string,string>)[label] ?? label;
}

function PulseChart({ metrics }: { metrics: StreamMetric[] }) {
  const last = metrics.slice(-60), width = 820, height = 170;
  const viewers = points(last.map(v => v.currentViewers), width, height);
  const comments = points(last.map(v => v.commentsPerMinute), width, height);
  const latest = last.at(-1);
  return <article className="panel pulse-panel">
    <div className="panel-head"><div><span>FLOW</span><h3>盛り上がり</h3></div><small>視聴者 / コメント</small></div>
    {last.length < 2 ? <div className="chart-empty">配信データを待っています。</div> : <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="盛り上がりグラフ">
        {[.25,.5,.75].map(v => <line key={v} x1="0" x2={width} y1={height*v} y2={height*v} className="grid-line" />)}
        <polyline points={viewers} className="chart-line viewers" />
        <polyline points={comments} className="chart-line comments" />
      </svg>
      {latest && <div className="chart-now"><b>{latest.activityScore}</b><span>{activityText(latest.activityScore)}</span></div>}
    </div>}
  </article>;
}

export function App() {
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [commentAuth, setCommentAuth] = useState<CommentAuthStatus>(emptyCommentAuth);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [targetInput, setTargetInput] = useState('');
  const [commentText, setCommentText] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terminal, setTerminal] = useState<TerminalEvent[]>([]);
  const [ttsEnabled, setTtsEnabled] = useState(() => localStorage.getItem('caspulse.tts.enabled') === 'true');
  const [ttsIncludeName, setTtsIncludeName] = useState(() => localStorage.getItem('caspulse.tts.includeName') === 'true');
  const [ttsVolume, setTtsVolume] = useState(() => Number(localStorage.getItem('caspulse.tts.volume') ?? '0.7'));
  const [ttsRate, setTtsRate] = useState(() => Number(localStorage.getItem('caspulse.tts.rate') ?? '1.0'));
  const ttsSettings = useRef({ enabled: ttsEnabled, includeName: ttsIncludeName, volume: ttsVolume, rate: ttsRate });
  const [relayOnline, setRelayOnline] = useState<boolean | null>(null);
  const [liveThumbnail, setLiveThumbnail] = useState<string | null>(null);
  const terminalEnd = useRef<HTMLDivElement | null>(null);

  const refresh = async (userId?: string) => {
    const data = await window.caspulse.getDashboard(userId); setDashboard(data); if (data.selectedUser) setSelectedUserId(data.selectedUser.userId);
  };

  useEffect(() => {
    void Promise.all([window.caspulse.getBootstrap(), window.caspulse.getRelayStatus(), window.caspulse.getCommentAuthStatus(), window.caspulse.getClipboardTwitCastingTarget()])
      .then(([data, relay, auth, clip]) => {
        setDashboard(data); setSelectedUserId(data.selectedUser?.userId ?? null); setRelayOnline(relay.ok); setCommentAuth(auth); if (clip) setTargetInput(clip);
      }).catch(e => setError(e instanceof Error ? e.message : String(e)));
    const offTracker = window.caspulse.onTrackerUpdate((update: TrackerUpdate) => {
      setDashboard(current => {
        const selected = current.selectedUser?.userId === update.tracker.trackedUserId;
        const nextComments = selected && update.newComments.length ? [...current.comments, ...update.newComments].filter((v,i,a)=>a.findIndex(x=>x.commentId===v.commentId)===i).slice(-600) : current.comments;
        const nextMetrics = selected && update.latestMetric ? [...current.metrics, update.latestMetric].slice(-180) : current.metrics;
        const tts = ttsSettings.current;
        if (tts.enabled && selected && update.newComments.length) speakComments(update.newComments, tts.includeName, tts.volume, tts.rate);
        return { ...current, selectedUser: selected && update.trackedUser ? update.trackedUser : current.selectedUser, tracker:update.tracker, liveMovie:selected ? update.liveMovie : current.liveMovie, comments:nextComments, metrics:nextMetrics };
      });
    });
    const offTerminal = window.caspulse.onTerminalEvent(e => setTerminal(current => [...current,e].slice(-500)));
    return () => { offTracker(); offTerminal(); };
  }, []);

  useEffect(() => {
    const normalizedVolume = Number.isFinite(ttsVolume) ? Math.max(0, Math.min(1, ttsVolume)) : 0.7;
    const normalizedRate = Number.isFinite(ttsRate) ? Math.max(0.7, Math.min(1.5, ttsRate)) : 1.0;
    ttsSettings.current = { enabled: ttsEnabled, includeName: ttsIncludeName, volume: normalizedVolume, rate: normalizedRate };
    localStorage.setItem('caspulse.tts.enabled', String(ttsEnabled));
    localStorage.setItem('caspulse.tts.includeName', String(ttsIncludeName));
    localStorage.setItem('caspulse.tts.volume', String(normalizedVolume));
    localStorage.setItem('caspulse.tts.rate', String(normalizedRate));
    if (!ttsEnabled) cancelSpeech();
  }, [ttsEnabled, ttsIncludeName, ttsVolume, ttsRate]);

  useEffect(() => () => cancelSpeech(), []);
  useEffect(() => { terminalEnd.current?.scrollIntoView({ block:'nearest' }); }, [terminal]);
  useEffect(() => { if (selectedUserId) void refresh(selectedUserId).catch(e=>setError(e instanceof Error ? e.message : String(e))); }, [selectedUserId]);

  const selectedUser = dashboard.selectedUser;
  const trackingSelected = Boolean(selectedUserId && dashboard.tracker.isRunning && dashboard.tracker.trackedUserId === selectedUserId);
  const live = Boolean(trackingSelected && dashboard.tracker.isLive && dashboard.liveMovie);
  const latest = dashboard.metrics.at(-1) ?? null;
  const recentComments = dashboard.comments.slice(-60).reverse();

  useEffect(() => {
    let cancelled=false, timer:number|undefined;
    const update = async () => {
      if (!live || !selectedUser?.userId) { if (!cancelled) setLiveThumbnail(null); return; }
      const fallback = dashboard.liveMovie?.large_thumbnail || dashboard.liveMovie?.small_thumbnail || null;
      if (!cancelled && fallback) setLiveThumbnail(fallback.replace(/^http:/,'https:'));
      try { const img=await window.caspulse.getLiveThumbnail(selectedUser.userId); if (!cancelled && img) setLiveThumbnail(img); } catch { /* fallback stays */ }
    };
    void update(); if (live) timer=window.setInterval(()=>void update(), THUMBNAIL_REFRESH_MS);
    return ()=>{ cancelled=true; if(timer!==undefined) clearInterval(timer); };
  }, [live, dashboard.liveMovie?.id, selectedUser?.userId]);

  const run = async (fn:()=>Promise<void>) => { setBusy(true); setError(null); try { await fn(); } catch(e){ setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  const handleTrace = (e:FormEvent) => { e.preventDefault(); void run(async()=>{ const r=await window.caspulse.startTrackingInput(targetInput); setDashboard(r.dashboard); setSelectedUserId(r.target.userId); setTargetInput(`https://twitcasting.tv/${r.target.screenId}`); }); };
  const connectComment = () => void run(async()=>setCommentAuth(await window.caspulse.connectCommentAuth()));
  const disconnectComment = () => void run(async()=>setCommentAuth(await window.caspulse.disconnectCommentAuth()));
  const sendComment = async () => {
    const text=commentText.trim(); if (!text || !dashboard.liveMovie) return;
    setPosting(true); setError(null);
    try {
      const r=await window.caspulse.postComment(dashboard.liveMovie.id,text);
      if (r.comment) setDashboard(current=>({...current,comments:[...current.comments,r.comment!].filter((v,i,a)=>a.findIndex(x=>x.commentId===v.commentId)===i).slice(-600)}));
      setCommentText('');
      setCommentAuth(await window.caspulse.getCommentAuthStatus());
    } catch(e) { setError(e instanceof Error ? e.message : String(e)); setCommentAuth(await window.caspulse.getCommentAuthStatus()); }
    finally { setPosting(false); }
  };
  const onCommentKey = (e:KeyboardEvent<HTMLTextAreaElement>) => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); void sendComment(); } };
  const openStream = () => { const url=dashboard.liveMovie?.link || (selectedUser ? `https://twitcasting.tv/${selectedUser.screenId}` : null); if(url) void window.caspulse.openExternal(url.replace(/^http:/,'https:')); };
  const toggleTts = (enabled: boolean) => {
    setTtsEnabled(enabled);
    if (!enabled) cancelSpeech();
  };
  const testTts = () => {
    setError(null);
    cancelSpeech();
    if (!speakText('CASPULSE、読み上げテストです。', ttsVolume, ttsRate)) setError('この環境ではコメント読み上げを利用できません。');
  };
  const disconnectStream = () => void run(async()=>{
    const tracker = await window.caspulse.stopTracking();
    cancelSpeech();
    setSelectedUserId(null);
    setLiveThumbnail(null);
    setCommentText('');
    setDashboard(current=>({ ...emptyDashboard, auth: current.auth, tracker }));
  });

  const atmosphere = useMemo(() => {
    if (!live) return dashboard.tracker.isRunning ? '現在はオフラインです。次の配信を待機しています。' : '配信URLを入力すると、コメントと盛り上がりを表示します。';
    if (!latest) return '配信に接続しました。データを取得しています。';
    return `${activityText(latest.activityScore)}。${latest.commentsPerMinute}コメ/分、勢い ${latest.momentum>=0?'+':''}${latest.momentum}%。`;
  }, [live, latest, dashboard.tracker.isRunning]);

  return <div className="app-shell">
    <header className="topbar compact-topbar">
      <div className="brand-wrap"><img className="brand-icon" src="./assets/caspulse-icon.png" alt=""/><div><h1>CASPULSE</h1><p>ツイキャスの流れを、ひとつの画面で。</p></div></div>
      <div className="top-status"><span className={relayOnline?'ok':''}>{relayOnline?'● Relay':'○ Relay'}</span><button onClick={()=>setSettingsOpen(true)}>⚙ 設定</button></div>
    </header>

    <main className="workspace">
      <form className={`connect-strip ${dashboard.tracker.isRunning?'connected':''}`} onSubmit={handleTrace}>
        <label>配信URL</label><input value={targetInput} onChange={e=>setTargetInput(e.target.value)} placeholder="https://twitcasting.tv/xxxxx" autoFocus={!dashboard.tracker.isRunning}/>
        <button type="button" className="ghost" onClick={()=>void run(async()=>{ const v=await window.caspulse.getClipboardTwitCastingTarget(); if(!v) throw new Error('クリップボードにツイキャスURLがありません。'); setTargetInput(v); })}>貼り付け</button>
        <button type="submit" className="primary" disabled={busy || !targetInput.trim()}>{dashboard.tracker.isRunning?'切り替える':'視聴しに行く！'}</button>
        {dashboard.tracker.isRunning && <button type="button" className="stop" title="配信との接続を終了します" onClick={disconnectStream}>切断</button>}
      </form>
      {error && <div className="error-bar"><span>!</span>{error}<button onClick={()=>setError(null)}>×</button></div>}

      <section className="dense-grid">
        <aside className="left-column">
          <article className="panel stream-card">
            <div className="stream-image">{liveThumbnail ? <img src={liveThumbnail} alt="配信サムネイル"/> : selectedUser ? <img className="profile-fallback" src={selectedUser.image} alt=""/> : <img className="profile-fallback" src="./assets/caspulse-icon.png" alt=""/>}<span className={`live-badge ${live?'on':''}`}>{live?'● LIVE':'OFFLINE'}</span></div>
            <div className="stream-copy"><h2>{dashboard.liveMovie?.title || selectedUser?.name || '配信を選択'}</h2>{selectedUser && <p>@{selectedUser.screenId}</p>}<button onClick={openStream} disabled={!selectedUser}>ツイキャスで開く ↗</button></div>
          </article>
          <div className="mini-metrics">
            <div><span>視聴者</span><b>{latest?compact(latest.currentViewers):'—'}</b><small>{latest?`${latest.viewerDelta>=0?'+':''}${latest.viewerDelta} 直近`:'待機中'}</small></div>
            <div><span>コメ/分</span><b>{latest?latest.commentsPerMinute:'—'}</b><small>{latest?`${latest.uniqueCommenters}人参加`:'待機中'}</small></div>
            <div><span>勢い</span><b>{latest?`${latest.momentum>=0?'+':''}${latest.momentum}%`:'—'}</b><small>{latest?momentumText(latest.momentum):'待機中'}</small></div>
            <div><span>盛り上がり</span><b>{latest?latest.activityScore:'—'}</b><small>{latest?activityText(latest.activityScore):'待機中'}</small></div>
          </div>
        </aside>

        <section className="main-column">
          <article className="panel comments-panel">
            <div className="panel-head comments-head"><div><span>LIVE COMMENTS</span><h3>コメント</h3></div><div className="comment-tools"><label className="tts-toggle"><input type="checkbox" checked={ttsEnabled} onChange={e=>toggleTts(e.target.checked)}/> コメント読み上げ</label><label className="tts-volume" title="読み上げ音量"><span>音量</span><input type="range" min="0" max="1" step="0.05" value={ttsVolume} onChange={e=>setTtsVolume(Number(e.target.value))} disabled={!ttsEnabled}/><b>{Math.round(ttsVolume*100)}%</b></label><label><input type="checkbox" checked={ttsIncludeName} onChange={e=>setTtsIncludeName(e.target.checked)} disabled={!ttsEnabled}/> 投稿者名も読む</label><button type="button" className="tts-test" onClick={testTts}>テスト</button></div></div>
            <div className="comments-scroll">{recentComments.length?recentComments.map(c=><div className="comment-row" key={c.commentId}><img src={c.image} alt=""/><time>{formatTime(c.createdAt)}</time><div><b>{c.name}</b><small>@{c.screenId}</small></div><p>{c.message}</p></div>):<div className="comments-empty">配信につながるとコメントがここに流れます。</div>}</div>
            <div className={`composer ${commentAuth.connected?'ready':''}`}>
              {!commentAuth.connected ? <><div className="composer-info"><b>CASPULSEからコメント</b><span>閲覧は匿名のまま。投稿するときだけツイキャス連携を使います。</span></div><button className="auth-button" onClick={connectComment} disabled={busy}>ツイキャス連携</button></> : <>
                <img src={commentAuth.account?.image} alt=""/><textarea value={commentText} onChange={e=>setCommentText(e.target.value.slice(0,140))} onKeyDown={onCommentKey} maxLength={140} disabled={!live||posting} placeholder={live?'コメントを入力（Enterで送信 / Shift+Enterで改行）':'配信中のみコメントできます'}/><div className="send-stack"><small>{commentText.length}/140</small><button onClick={()=>void sendComment()} disabled={!live||posting||!commentText.trim()}>{posting?'送信中':'送信'}</button></div>
              </>}
            </div>
          </article>
          <PulseChart metrics={dashboard.metrics}/>
        </section>

        <aside className="right-column">
          <article className="panel mood-panel"><div className="panel-head"><div><span>NOW</span><h3>配信の様子</h3></div><small>BETA</small></div><p className="mood-main">{atmosphere}</p>{latest&&<div className="mood-grid"><span>視聴者 <b>{latest.currentViewers}</b></span><span>参加 <b>{latest.uniqueCommenters}人</b></span><span>勢い <b>{latest.momentum>=0?'+':''}{latest.momentum}%</b></span><span>スコア <b>{latest.activityScore}</b></span></div>}</article>
          <article className="panel terminal-panel"><div className="panel-head"><div><span>LOG</span><h3>ライブログ</h3></div><button onClick={()=>setTerminal([])}>クリア</button></div><div className="terminal-scroll">{terminal.length?terminal.slice(-80).map(line=><div className={`terminal-line kind-${line.kind}`} key={line.id}><time>{formatTime(line.at,true)}</time><b>[{friendlyLabel(line.label)}]</b><span>{line.message}</span></div>):<p className="empty-small">接続待機中。</p>}<div ref={terminalEnd}/></div></article>
        </aside>
      </section>
    </main>

    {settingsOpen && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSettingsOpen(false)}}><section className="settings-modal"><div className="modal-head"><div><span>SETTINGS</span><h2>設定</h2></div><button onClick={()=>setSettingsOpen(false)}>×</button></div>
      <div className="setting-row"><div><b>Relay</b><span>匿名閲覧用の読み取り接続</span></div><strong>{relayOnline?'接続済み':'未接続'}</strong></div>
      <div className="setting-row"><div><b>コメント投稿</b><span>{commentAuth.connected?`@${commentAuth.account?.screen_id} で連携中`:'必要な人だけツイキャス連携'}</span></div>{commentAuth.connected?<button className="danger" onClick={disconnectComment}>解除</button>:<button onClick={connectComment}>連携する</button>}</div>
      <div className="setting-row tts-setting-row"><div><b>コメント読み上げ</b><span>新しく届いたコメントをWindowsの音声で読み上げます</span></div><label className="setting-switch"><input type="checkbox" checked={ttsEnabled} onChange={e=>toggleTts(e.target.checked)}/><strong>{ttsEnabled?'ON':'OFF'}</strong></label></div>
      <div className="setting-control"><label><span>音量</span><input type="range" min="0" max="1" step="0.05" value={ttsVolume} onChange={e=>setTtsVolume(Number(e.target.value))}/><b>{Math.round(ttsVolume*100)}%</b></label><label><span>速度</span><input type="range" min="0.7" max="1.5" step="0.05" value={ttsRate} onChange={e=>setTtsRate(Number(e.target.value))}/><b>{ttsRate.toFixed(2)}x</b></label><button type="button" onClick={testTts}>🔊 テスト再生</button></div>
      <div className="setting-row"><div><b>保存</b><span>コメント・推移はローカルSQLiteへ保存</span></div><strong>LOCAL</strong></div>
      <p className="setting-note">コメント投稿用アクセストークンは、利用可能な環境ではOSのsafeStorageで暗号化してローカル保存します。Relayには送信しません。</p>
    </section></div>}
  </div>;
}
