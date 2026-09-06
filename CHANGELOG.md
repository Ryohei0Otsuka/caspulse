# Changelog

## 0.1.3 — Easy Connect + Mock UI polish

- Hide Client ID setup from normal users; embed it at build time.
- Add first-run “ツイキャスとつなぐ” onboarding.
- Make the dashboard closer to the neon/pop UI concept with doodles and friendly copy.
- Show the current movie thumbnail immediately and refresh with the official Live Thumbnail API.
- Keep technical OAuth controls inside developer-only details.
- Prepare NSIS Setup and Portable Windows distribution targets.


## v0.1.3 — Pop UI / Easy Connect refresh

- Removed the normal user-facing Client ID input flow.
- Added build-time CASPULSE Client ID generation through `.env.local` / `CASPULSE_TWITCASTING_CLIENT_ID`.
- Kept a migration fallback for Client IDs stored by v0.1.2 development builds.
- Added a first-run one-button **ツイキャスとつなぐ** onboarding experience.
- Added a developer-only setup notice when a source build has no Client ID configured.
- Added TwitCasting clipboard URL detection.
- Reworked the UI toward the neon/pop CASPULSE mock direction.
- Added a live thumbnail view using the official TwitCasting Live Thumbnail endpoint with periodic refresh.
- Simplified user-facing settings and moved technical details into a developer disclosure.
- Added separate Setup and Portable Windows artifact names.
- Updated README for end users first, developers second.

## v0.1.2 — OAuth guide refresh

- Added beginner-friendly Client ID guidance.
- Clarified Client ID / Client Secret / Access Token responsibilities.

## v0.1.1 — Pop UI refresh

- Reworked wording and visual direction for TwitCasting culture.
- Added CASPULSE app icon and UI concept image.

## v0.1.0

- Initial Electron + React + TypeScript + SQLite prototype.
- URL / ID tracking, live detection, comments, metrics, TTS and terminal logging.
