# CASPULSE Relay

Private, read-only relay between the CASPULSE desktop app and TwitCasting API v2.

## Why this exists

CASPULSE is distributed as a local desktop app. The TwitCasting `Client Secret` must **not**
be embedded in the distributed executable, so the secret stays only in this relay's server-side
environment variables.

CASPULSE users do not need a TwitCasting Developer account or OAuth setup for the anonymous
viewer mode.

## Environment variables

Set these in Vercel Project Settings → Environment Variables:

- `TWITCASTING_CLIENT_ID`
- `TWITCASTING_CLIENT_SECRET`

Never commit either value to Git.

## Endpoints

### Health

`GET /api/health`

### Resolve a TwitCasting user

`GET /api/user?target=https://twitcasting.tv/twitcasting_jp`

Also accepts a `screen_id` or user ID directly.

### Current live

`GET /api/live?user_id=182224938`

### Comments

`GET /api/comments?movie_id=189037369`

For incremental retrieval:

`GET /api/comments?movie_id=189037369&slice_id=123456789`

## Security notes

- Read-only GET endpoints only.
- This is **not** a generic proxy.
- Client Secret is read only from server-side environment variables.
- Relay does not intentionally persist CASPULSE comment history or viewer history.
- CASPULSE's long-term logs belong in the local desktop app's SQLite database.
- CORS is currently `*` because the portable Electron app may have a non-HTTP origin.
- Before broad public distribution, add rate-abuse protection and monitoring.

## Local development

Create `.env.local` from `.env.example` and use Vercel CLI:

```bash
npm i -g vercel
vercel dev
```

Do not commit `.env.local`.
