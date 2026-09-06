# Security Policy

## Secrets

Do not commit:

- TwitCasting access tokens
- Client Secrets
- local SQLite files
- recordings or private exports

CASPULSE v0.1 does not require secrets in `.env`.

## OAuth token storage

When Electron reports that OS encryption is available, access tokens are encrypted with Electron `safeStorage` before persistence.

On Windows this uses the protection available to Electron on the current user account. If secure storage is unavailable, CASPULSE keeps the token only for the current session and displays a warning.

## Electron boundary

The renderer runs with:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`

Only a small IPC API is exposed by the preload script.

## Reporting

Never paste real credentials into a public GitHub issue. Report security problems with the minimum information necessary to reproduce them.
