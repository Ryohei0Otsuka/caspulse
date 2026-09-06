# CASPULSE

> ツイキャスの“いま”を、いっしょに楽しむポータブル・ローカルアプリ。

CASPULSE は、ツイキャスの配信URLを貼るだけで、コメントの流れ・視聴者推移・コメント速度・勢いをローカルで眺めるためのデスクトップアプリです。

## 利用者の使い方

インストールは不要です。

1. 配布ZIPを解凍
2. `CASPULSE.exe` をダブルクリック
3. 起動画面上部の **「ここに配信URLを貼ってね」** へURLを貼る（`📋 貼り付け`でもOK）
4. **のぞきにいく！**

ツイキャスDeveloper登録、Client ID入力、OAuth連携、npm は利用者には不要です。

## 取得と保存

CASPULSE本体はローカルで動作します。

- 配信者情報 / 現在配信 / コメント取得: `CASPULSE Relay`
- 配信サムネイル: TwitCasting公式Live Thumbnail
- コメント履歴 / 盛り上がり指標 / 最近つないだ配信: 利用者PCのSQLite
- コメント読み上げ: OS / ChromiumのSpeech Synthesis

RelayはCASPULSEのClient Secretを配布exeへ埋め込まないための読み取り専用中継です。

`https://caspulse-relay.vercel.app`

CASPULSE独自の利用者アカウントは作成しません。

## 開発者向け

### 必要環境

- Windows 11
- Node.js 24系推奨
- npm

### 開発起動

```powershell
npm install
npm run dev
```

### Portable EXEを作る

```powershell
npm run build:portable
```

成功すると:

```text
release/
└─ CASPULSE.exe
```

この `CASPULSE.exe` はインストーラーではありません。単体で起動するPortable版です。

### Relay URLを開発時だけ差し替える

PowerShell:

```powershell
$env:CASPULSE_RELAY_URL="http://127.0.0.1:3000"
npm run dev
```

未指定時は本番Relay `https://caspulse-relay.vercel.app` を使います。

## 現在の機能

- TwitCasting URL / `@screen_id` / user ID入力
- 配信者解決とID追従
- 配信開始 / 終了追跡
- コメント取得・SQLite保存
- コメント速度
- 視聴者推移
- 勢い / activity score
- ポップなライブダッシュボード
- わいわいログ
- コメント読み上げ
- 実配信サムネイル表示
- 最近つないだ配信

## 今後

- MOMENT / AUTO MOMENT
- 録音（権利・許諾を前提とした用途）
- 音声文字起こし
- 文脈サマリー
- アイテム連携可能範囲の整理
- Relayのキャッシュ / abuse protection

## Privacy

CASPULSEは、アプリ独自のログインや利用者アカウントを要求しません。

長期のコメントログや分析データはローカルSQLiteへ保存します。API中継のため対象となる配信識別情報はCASPULSE Relayへ送信されます。ネットワーク通信である以上、ホスティング基盤等で通常の通信ログが扱われる可能性はあります。

## License

MIT License
