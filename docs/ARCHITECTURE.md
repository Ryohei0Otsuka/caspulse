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
  ├─ Clipboard URL detector
  ├─ Target parser
  ├─ Tracker / poll scheduler
  └─ SQLite service
```

## Renderer

The renderer never receives Node.js access. It renders:

- first-run one-button onboarding
- URL paste bar
- official live thumbnail
- recent targets
- metrics / graphs
- comments
- live terminal
- TTS controls

## Main process

The main process owns privileged operations:

- OAuth browser launch / loopback callback
- TwitCasting API requests
- clipboard reads
- encrypted token persistence
- SQLite
- external browser opening
- polling timers

## Build-time OAuth configuration

The normal user interface does not contain a Client ID field.

```text
.env.local / CI secret or variable
  ↓
scripts/generate-oauth-config.mjs
  ↓
src/main/generated-oauth-config.ts
  ↓
Electron build
```

Only the TwitCasting Client ID is embedded. Client Secret is never generated into the desktop bundle.

For migration, v0.1.3 can fall back to a Client ID stored by v0.1.2 development builds when no embedded ID exists.

## Identity model

Input may be a URL, `@screen_id`, or `screen_id`.

```text
input -> screen_id -> API user -> fixed user.id
```

`screen_id` remains display metadata. The fixed API `user.id` is the tracking key.

## Stream model

One tracked broadcaster can produce multiple `movie_id` values over time. The tracker keeps watching the broadcaster user ID after a stream ends, allowing a future stream to become the new active `movie_id` automatically.

## Thumbnail model

While live, the renderer uses the official live-thumbnail endpoint:

```text
GET https://apiv2.twitcasting.tv/users/:user_id/live/thumbnail
    ?size=large
    &position=latest
```

The image is refreshed periodically with a cache-busting query parameter. It does not require the renderer to receive the user's Access Token.
