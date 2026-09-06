# Changelog

## v0.3.0

- Reduced whitespace and rebuilt the layout for everyday comment-viewer use.
- Made the comment stream the main workspace.
- Removed the recent-streams panel so the main view stays focused on the active stream.
- Added optional TwitCasting OAuth for in-app comment posting.
- Added 140-character composer, Enter-to-send, and Shift+Enter line breaks.
- Kept anonymous viewing as the default; OAuth is only needed to post comments.
- User OAuth tokens stay local and are encrypted with Electron safeStorage when available.
- Added momentum/activity scoring v2 to reduce exaggerated scores on low-volume streams.
- Kept the CASPULSE Relay read-only for viewer data; user comments go directly to TwitCasting.
