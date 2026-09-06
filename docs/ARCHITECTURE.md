# Architecture

```text
Renderer (React)
  │
  │ narrow contextBridge API
  ▼
Preload
  │
  │ ipcRenderer / ipcMain
  ▼
Electron Main
  ├─ OAuth loopback callback
  ├─ TwitCasting API client
  ├─ Target parser
  ├─ Tracker / poll scheduler
  └─ SQLite service
```

## Renderer

The renderer never receives Node.js access. It renders:

- URL trace bar
- stable ID identity card
- recent targets
- metrics / graphs
- live terminal
- TTS controls

## Main process

The main process owns all privileged operations:

- network requests to TwitCasting API
- encrypted token persistence
- SQLite
- external browser opening
- polling timers

## Identity model

Input may be a URL, `@screen_id`, or `screen_id`.

```text
input -> screen_id -> API user -> fixed user.id
```

`screen_id` remains display metadata. The fixed API `user.id` is the tracking key.

## Stream model

One tracked broadcaster can produce multiple `movie_id` values over time. The tracker keeps watching the broadcaster user ID after a stream ends, allowing a future stream to become the new active `movie_id` automatically.
