# CASPULSE Architecture — v0.2.0

```text
TwitCasting URL
      |
      v
CASPULSE.exe (Electron / local)
      |
      +--> CASPULSE Relay (read-only API relay)
      |        |
      |        v
      |    TwitCasting API v2
      |
      +--> Official Live Thumbnail endpoint
      |
      +--> SQLite (local comments / metrics / history)
```

## Boundary

The desktop app contains no TwitCasting Client Secret and requires no user OAuth for anonymous-viewer mode.

The Relay holds application credentials server-side and exposes only purpose-built read endpoints:

- `/api/user`
- `/api/live`
- `/api/comments`
- `/api/health`

CASPULSE does not use the Relay as a generic proxy.
