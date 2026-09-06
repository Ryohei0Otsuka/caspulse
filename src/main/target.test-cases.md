# Target parser examples

These are human-readable regression cases for `parseTwitCastingTarget`.

| Input | Expected API lookup key |
| --- | --- |
| `https://twitcasting.tv/g:113456859404992188053` | `g:113456859404992188053` |
| `https://twitcasting.tv/example/movie/123456` | `example` |
| `@example` | `example` |
| `example` | `example` |

Non-TwitCasting hosts and URLs without a broadcaster path must be rejected.
