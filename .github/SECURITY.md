# Security Policy

## Secrets

Do not commit:

- TwitCasting access tokens
- Client Secrets
- local SQLite files
- recordings or private exports

CASPULSE does not require TwitCasting secrets in the desktop repository.

## OAuth token storage

When OS encryption is available, comment-posting access tokens are encrypted with Electron `safeStorage` before persistence. If secure storage is unavailable, CASPULSE keeps the token only for the current session.

## Electron boundary

The renderer runs with:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- no `<webview>`

IPC handlers reject calls that do not originate from the active CASPULSE renderer. Navigation away from the CASPULSE document is blocked, new windows are denied, and external URLs are restricted to an HTTPS allowlist.

## Content Security Policy

The renderer blocks inline scripts, insecure HTTP images, objects, frames, and form submissions. The local OAuth callback uses a per-request CSP nonce for its inline script/style.

## Dependencies

Direct npm dependencies are pinned to exact versions. Keep `package-lock.json` committed and use `npm ci` for repeatable builds after the lockfile has been generated/refreshed.

## Reporting

Never paste real credentials into a public GitHub issue. Report security problems with the minimum information necessary to reproduce them.
