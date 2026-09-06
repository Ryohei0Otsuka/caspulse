# Changelog

## v0.2.2

- Made the TwitCasting URL entry point impossible to miss.
- Added a three-step start guide above the URL field.
- Added a one-click clipboard paste button for TwitCasting URLs.
- Enlarged and highlighted the URL field and primary action.
- Added explicit example text and autofocus for first launch.

## v0.2.1

- Fixed TypeScript typing for dashboard metrics and comments.
- Fixed async Electron clipboard reading in the main process.
- Restored `npm run typecheck` and portable build compatibility.

## v0.2.0

- Removed TwitCasting OAuth and Client ID entry from the desktop app.
- Connected the desktop app to the read-only CASPULSE Relay.
- Added anonymous-viewer UX: paste a TwitCasting URL and start immediately.
- Added `npm run build:portable`.
- Portable build now outputs `release/CASPULSE.exe`.
- Kept comments, metrics, and history in local SQLite.
- Kept direct official live-thumbnail refresh for the stream preview.

## v0.1.3

- Easy-connect UI groundwork.
- Pop UI polish and live thumbnail fallback.
