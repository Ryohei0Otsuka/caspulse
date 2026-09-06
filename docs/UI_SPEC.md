# CASPULSE UI Spec — v0.3.0 Beta 2

## Core feeling

Not an operations dashboard. Not an admin console.

CASPULSE should feel like a compact neon comment viewer sitting beside a TwitCasting stream.

Keywords:

- pop
- neon
- soft cyber
- streamer culture
- compact
- dense but readable

## Main layout

```text
Header
Compact URL / connection bar

┌──────────────┬────────────────────────────┬──────────────┐
│ Live preview │ Live comments              │ Now          │
│ 4 metrics    │ Comment composer           │ Live log     │
│              │ Activity graph             │              │
└──────────────┴────────────────────────────┴──────────────┘
```

The main screen does **not** show a recent-streams panel. Historical stream/comment data stays in local SQLite and can be surfaced later in a dedicated history view if needed.

## Copy rules

Prefer:

- 配信URL
- 視聴しに行く！
- 視聴者
- コメ / 分
- 勢い
- 盛り上がり
- コメント
- 配信の様子
- ライブログ

Avoid overly cute wording and normal-user technical jargon.

Popness should come from color, glow, motion, and composition rather than cutesy copy.


## TTS / disconnect controls

The comment header uses explicit wording:

- コメント読み上げ
- 音量
- 投稿者名も読む
- テスト

Detailed TTS volume and speed controls are also available in Settings.

While tracking a stream, the connection bar exposes **切断** rather than the ambiguous **停止**. Disconnect stops network polling and queued speech, clears the active view, and leaves saved SQLite history intact.
