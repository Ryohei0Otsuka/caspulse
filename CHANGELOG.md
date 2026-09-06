# Changelog

## v0.3.0 Beta 2

- Renamed the stream control from `停止` to the clearer `切断`.
- Disconnect now stops polling, clears the active stream view, and cancels queued speech without deleting saved SQLite history.
- Reworked comment TTS controls with explicit `コメント読み上げ` and `投稿者名も読む` labels.
- Added TTS volume adjustment, playback speed adjustment, and a test-play button.
- TTS settings are preserved locally between launches.
- Cancels queued speech when TTS is turned off or the stream is disconnected.
- Prefers an installed Japanese system voice when available.

## v0.3.0 Beta 1

- Reduced whitespace and rebuilt the layout for everyday comment-viewer use.
- Made the comment stream the main workspace.
- Removed the recent-streams panel so the main view stays focused on the active stream.
- Added optional TwitCasting OAuth for in-app comment posting.
- Added 140-character composer, Enter-to-send, and Shift+Enter line breaks.
- Kept anonymous viewing as the default; OAuth is only needed to post comments.
- User OAuth tokens stay local and are encrypted with Electron safeStorage when available.
- Added momentum/activity scoring v2 to reduce exaggerated scores on low-volume streams.
- Kept the CASPULSE Relay read-only for viewer data; user comments go directly to TwitCasting.
