# CASPULSE

> **ツイキャスの“いま”を、いっしょに楽しもう。**

CASPULSE は、好きなTwitCasting配信をローカルPCで追いかけながら、コメント・視聴者数・コメントの勢いをひとつの画面で眺めるためのデスクトップアプリです。

URLを貼って **「のぞきにいく！」**。  
あとは配信者の固定 `user.id` を軸に、現在の配信 `movie_id`、コメント、盛り上がりの波を追います。

**v0.1.1 — Pop UI refresh**  
Repository: `Ryohei0Otsuka/caspulse`

![CASPULSE UI concept](docs/caspulse-ui-concept.png)

> 上の画像はUIデザインのコンセプトモックです。実装は同じ「ネオン × ポップ × 配信文化」の方向で構成しています。

---

## いまできること

- `https://twitcasting.tv/...` の配信URLをそのまま貼る
- `@screen_id` / `screen_id` の直接入力にも対応
- 表示上の `screen_id` をTwitCastingの固定 `user.id` へ解決して追従
- 配信中なら現在の `movie_id` を自動取得
- オフラインなら同じ固定IDのまま次の配信を待つ
- コメントを一定間隔で取得してSQLiteへ保存
- コメント投稿者の `screen_id` と固定 `user.id` を両方保存
- 配信サムネイルを表示
- **見てる人 / コメ・分 / 勢い / いま** を表示
- 視聴者とコメントの時系列を **いまの盛り上がり** グラフとして表示
- 最新コメントを **コメントながれ** へ表示
- 配信イベントを **わいわいログ** へ時系列表示
- OS / Chromiumの音声合成でコメント読み上げ
- 最近つないだ配信をローカル保存
- OAuthアクセストークンをElectron `safeStorage` で暗号化保存（利用可能なOSのみ）

v0.1.1ではスクレイピングを行わず、データ取得はTwitCasting API v2を使います。

---

## CASPULSEの流れ

```text
配信URLをぺたっ
      ↓
screen_id を読み取る
      ↓
TwitCasting user.id に解決
      ↓
固定 user.id でおいかける
      ↓
current_live を確認
      ↓
movie_id を取得
      ↓
コメント + 視聴者 + 勢い
      ↓
SQLite + コメントながれ + わいわいログ + 盛り上がりグラフ
```

`screen_id` は画面表示に使いますが、追従の芯は解決済みの `user.id` です。  
配信者が後から `screen_id` を変更しても、固定ID側から最新プロフィールを再取得します。

---

## 「勢い」と「ノリ」

### 勢い

直近15秒のコメント量を、その前60秒から作った基準と比べる短期変化率です。

```text
直近 = 最新15秒のコメント数
基準 = その前60秒のコメント数 ÷ 4
勢い = (直近 - 基準) / 基準 × 100
```

表示上は `-100%` 〜 `+999%` に収めます。

### ノリ

コメント数、参加人数、視聴者の増加、正方向の勢いを混ぜた **0〜100の実験スコア** です。

これは「この話題がウケた」と原因を断定する値ではありません。おすすめ掲載、SNS流入、他配信の終了など、CASPULSEから見えない外的要因もあります。

`配信の空気` パネルもv0.1.1ではこの実測値から短いひとことを作るだけで、AI文脈解析ではありません。

詳しくは [`docs/METRICS.md`](docs/METRICS.md)。

---

## 必要なもの

- Windows 10 / 11
- Node.js `20.19+` または `22.12+`（Node 24推奨）
- npm
- TwitCasting Developerアプリ / APIアクセス

Desktop runtime は Electron `44.2.0` を固定しています。

---

## 1. インストール

GitHub DesktopでRepositoryをCloneし、Repositoryフォルダでターミナルを開きます。

```powershell
cd "C:\Users\Ryohei\Documents\GitHub\caspulse"
npm install
```

起動：

```powershell
npm run dev
```

---

## 2. ツイキャスとつなぐ

TwitCasting Developerでアプリを登録し、Callback URLを次の値に合わせます。

```text
http://127.0.0.1:47831/oauth/callback
```

CASPULSEを起動したら：

1. **設定** を開く
2. Developerアプリの **Client ID** を貼る
3. **ツイキャスとつなぐ ✦** を押す
4. ブラウザ側で許可する
5. CASPULSEへ戻る

Client SecretはRepositoryへ入れません。アクセストークンもGitへCommitしないでください。

開発確認用として、設定の詳細欄からアクセストークンを直接読み込む方法も残しています。

---

## 3. 配信をのぞく

画面上部の **配信URLをぺたっ** に入力します。

```text
https://twitcasting.tv/g:113456859404992188053
```

または：

```text
@screen_id
screen_id
```

**のぞきにいく！** を押します。

わいわいログには、例えば次のように流れます。

```text
21:30:01 [ぺたっ]      URLを受け取ったよ：https://twitcasting.tv/...
21:30:01 [みつけた]    配信者をみつけた！ @screen_id
21:30:01 [おいかけ]    @screen_id をおいかけるよ！
21:30:02 [配信きた！]  配信きた！「雑談するよ〜」につながったよ。
21:30:05 [コメ]        @viewer：こんばんは！
21:30:10 [ノリ]        いま 18コメ/分 · 勢い +140% · ノリ 72
```

配信が終わったら固定 `user.id` を保持したまま、次の配信を待ちます。

---

## ローカルデータ

SQLite DBはRepositoryの中ではなく、Electronのユーザーデータ領域に作成します。

現在のテーブル：

- `tracked_users`
- `streams`
- `comments`
- `metrics`
- `gifts` — 将来のOwner Mode用
- `moments` — 将来のハイライト機能用
- `settings`

DBや将来の録音データは `.gitignore` 対象です。

---

## APIポーリング

v0.1.1の基本値：

- 配信状態：**10秒ごと**
- コメント：配信中 **3秒ごと**

コメントAPIは1回で取得できる件数に上限があるため、非常にコメント量の多い配信では全件を完全取得できない可能性があります。v0.1ではこの制約を隠しません。

---

## セキュリティ

- `contextIsolation: true`
- `nodeIntegration: false`
- renderer sandbox ON
- preloadで公開するIPCを限定
- OAuth tokenは利用可能な環境でElectron `safeStorage` 暗号化
- Client Secretを埋め込まない
- `.env` に秘密情報を置く必要なし
- DBはローカルのみ
- 外部リンクはTwitCasting / GitHubに限定

---

## Roadmap

### v0.2 — あとから見返す

- 配信履歴
- 手動 / 自動MOMENT
- コメント・ユーザー検索
- セッションCSV / JSON出力
- 高コメント量配信向けの取得方式再検討

### v0.3 — 聴く

- 自分の配信、または録音許可のある配信の録音
- 音声タイムライン同期
- TTS詳細設定
- NGワード / NGユーザー

### v0.4 — 文脈を読む

- 音声文字起こし
- 配信者発言 + コメントの文脈サマリー
- 話題の切り替わり
- AUTO MOMENT
- 「原因」ではなく観測根拠を添えたピーク説明

### アイテム

Gift APIはアクセストークンに紐づくユーザー宛の直近アイテムが中心になるため、通常の第三者配信ビューアで任意配信のアイテムを取得できるものとしては扱いません。

将来は配信者本人向け **Owner Mode** として実装候補にします。

---

## Tech

- Electron 44
- React 19
- TypeScript
- Vite 8
- Node `node:sqlite`
- TwitCasting API v2
- Web Speech API / SpeechSynthesis

---

## Windows build

```powershell
npm run dist:win
```

生成先：

```text
release/
```

CASPULSE専用アプリアイコンは `build/icon.ico` に同梱しています。

---

## Commit summary

```text
Redesign CASPULSE with a playful TwitCasting-first UI, friendly live logs, real stream previews, and a custom app icon
```

## License

MIT License
