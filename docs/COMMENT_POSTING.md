# Comment Posting

CASPULSEの匿名閲覧は従来どおりOAuth不要です。

アプリからコメントを投稿する場合だけTwitCastingユーザーOAuthを使用します。

## Developer setup

TwitCasting DeveloperでCASPULSEアプリのScopeを **Read and Write** に変更してください。

Callback URL:

```text
http://127.0.0.1:47831/oauth/callback
```

Relayの `/api/oauth-config` は公開情報であるClient IDだけを返します。Client SecretやユーザーのAccess Tokenは返しません。

ユーザーAccess TokenはCASPULSE本体にのみ保持し、可能な環境ではElectron `safeStorage` で暗号化してローカル保存します。
