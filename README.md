# Yomi Calendar Share

React + TypeScript + Vite で作る、予定・お金・ラブログを同じ日付軸で扱う共有カレンダーアプリです。

Cloudflare Workers / D1 / R2 でホストできます。将来自宅サーバー、Docker、VPSへ移行できるように、Cloudflare固有コードは `server/cloudflare/` に隔離しています。

AI連携は現在実装していません。

## Features

- 月表示カレンダー
- 先月 / 来月 / 今日への移動
- 予定、日記、ToDo、細かい予定、写真メモ
- タグ管理
- 日別写真
- 収入 / 支出記録
- バイト予定からの概算給料計算
- クレカ締め日 / 支払日からの引き落とし予定
- ラブログとハート貯金
- ライト / ダークモード
- JSONバックアップの書き出し / 読み込み
- Cloudflare D1 snapshot保存
- Cloudflare R2画像保存
- トークンによる予定データ・画像API保護
- 初回アクセス時のトークン入力画面

## Tech Stack

- Frontend: React, TypeScript, Vite
- Runtime: Cloudflare Workers
- Database: Cloudflare D1
- Image storage: Cloudflare R2
- Local fallback: localStorage

## Public Repository Safety

このリポジトリは public で公開できます。

コミットしてよいもの:

- `wrangler.toml`
- `.env.example`
- `.dev.vars.example`
- migration SQL
- source code

コミットしてはいけないもの:

- `.env`
- `.env.local`
- `.dev.vars`
- Cloudflare API token
- `WRITE_TOKEN`
- R2 access key / secret key

`.gitignore` で上記のローカル秘密情報は除外しています。

## Quick Start

```bash
npm install
npm run dev
```

Vite のローカル開発では、保存先はブラウザの `localStorage` です。

```text
http://localhost:5173/
```

## Cloudflare Hosting

このリポジトリの `wrangler.toml` は、以下のCloudflareリソース名を前提にしています。

```txt
D1 database: yomi-calendar-share-db
R2 bucket:   yomi-calendar-share-images
```

`database_id` は `wrangler.toml` に設定済みです。自分のCloudflareアカウントでforkして使う場合は、自分のD1のIDへ置き換えてください。

### 1. Cloudflare Dashboardで確認 / 作成

ブラウザで Cloudflare Dashboard を開きます。

1. Workers & Pages に移動
2. D1 で `yomi-calendar-share-db` を確認、なければ作成
3. R2 で `yomi-calendar-share-images` を確認、なければ作成
4. D1 の `Database ID` が `wrangler.toml` の `database_id` と一致しているか確認

CLIで操作する場合だけ、以下を使います。

```bash
npx wrangler login
npx wrangler d1 create yomi-calendar-share-db
npx wrangler r2 bucket create yomi-calendar-share-images
```

### 2. wrangler.toml を確認

```toml
[[d1_databases]]
binding = "DB"
database_name = "yomi-calendar-share-db"
database_id = "your-d1-database-id"

[[r2_buckets]]
binding = "IMAGES"
bucket_name = "yomi-calendar-share-images"
```

### 3. Configure Access Token

予定の読み込み、保存、画像表示、画像アップロードには `WRITE_TOKEN` が必要です。

Cloudflare Dashboardから設定する場合:

1. Workers & Pages
2. `yomi-calendar-share`
3. Settings
4. Variables and Secrets
5. Secret を追加
6. Name: `WRITE_TOKEN`
7. Value: 長いランダム文字列

CLIで設定する場合:

```bash
npx wrangler secret put WRITE_TOKEN
```

長いランダム文字列を入力してください。

例:

```text
use-a-long-random-string-here
```

デプロイ後、アプリ画面の `設定 > 書き込みトークン` に同じ値を入力します。
トークン未入力のブラウザでは、予定データと画像を読み込めません。

初回アクセス時、ブラウザにトークンが保存されていない場合は、カレンダー画面ではなくトークン入力画面が表示されます。
そこで `WRITE_TOKEN` と同じ値を入力すると、D1から予定データを読み込みます。

すでに開いている状態でトークンを変更したい場合は、アプリ内の `設定 > 書き込みトークン` から変更できます。

### 4. Local Cloudflare Test

Windows PowerShell:

```powershell
Copy-Item .dev.vars.example .dev.vars
```

`.dev.vars` の `WRITE_TOKEN` を本番とは別の長い文字列に変更します。

Migration:

```bash
npm run db:migrate:local
```

Cloudflare構成で起動:

```bash
npm run cf:dev
```

### 5. Apply Remote Migration

```bash
npm run db:migrate:remote
```

### 6. Deploy

```bash
npm run cf:deploy
```

## Environment Variables

`.env.example`:

```env
VITE_RUNTIME_TARGET=auto
VITE_API_BASE_URL=
VITE_CALENDAR_ID=default
```

`VITE_RUNTIME_TARGET=auto` の場合、localhostではlocalStorage、本番HTTPSでは同じoriginのAPIを使います。

Cloudflare Workers assets と同じoriginで動かす場合、通常 `VITE_API_BASE_URL` は空でOKです。

別originのAPIへ向ける場合だけ設定します。

```env
VITE_RUNTIME_TARGET=cloudflare
VITE_API_BASE_URL=https://example.your-worker.workers.dev
VITE_CALENDAR_ID=default
```

重要: `WRITE_TOKEN` は `.env` や `VITE_*` に入れないでください。Vite の `VITE_*` はブラウザ配信物に含まれます。
本番ではCloudflare Secretに保存し、ブラウザ側では初回アクセス画面または設定画面から入力します。

## Access Control

このアプリはログイン機能ではなく、共有トークン方式で保護しています。

`WRITE_TOKEN` が必要な操作:

- 予定データの読み込み
- 予定データの保存
- 画像表示
- 画像アップロード

トークン未入力時:

- 本番HTTPS環境では、最初にトークン入力画面を表示
- D1 / R2 のデータは読み込まない
- URLを知っているだけでは予定や画像を見られない

注意:

- トークンを知っている人は全データを読めて編集できます。
- 本格的なユーザー別権限は未実装です。
- 複数人で厳密に運用する場合は、Cloudflare Access やログイン機能の追加を検討してください。

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run worker:check
npm run cf:dev
npm run cf:deploy
npm run db:migrate:local
npm run db:migrate:remote
```

## Data Model

現在はD1に `calendar_snapshots` としてカレンダー全体をJSON snapshotで保存します。

理由:

- MVP移行時にUIを壊しにくい
- D1 write回数を抑えやすい
- 将来自宅サーバーへ移行しやすい

データが増えたら、次のように正規化できます。

- events
- money_records
- love_logs
- tags
- part_time_jobs
- credit_cards
- daily_photos

## Images

画像はフロントで軽量化してからR2にアップロードします。

- D1には `imageKey` とmetadataを保存
- R2の固定公開URLは保存しない
- 表示URLはAPI経由で生成

これにより、将来自宅サーバーでは `imageKey` をローカルファイルパスやMinIO keyへ置き換えられます。

## Portability

Cloudflare版:

```text
server/cloudflare/worker.ts
D1
R2
```

将来自宅サーバー版の想定:

```text
server/node/
SQLite or PostgreSQL
local filesystem or MinIO
```

API契約は変えず、entrypoint / database / storage adapter を差し替える方針です。

詳しくは以下を参照してください。

- `docs/portable-hosting-plan.md`
- `docs/free-tier-operations.md`
- `docs/cloudflare-migration-checklist.md`

## Project Structure

```text
src/
  api/
  components/
  config/
  hooks/
  repositories/
  storage/
  styles/
  types/
  utils/
server/
  core/
  cloudflare/
migrations/
docs/
```

## Notes

- AI機能は未実装です。
- 認証ユーザー管理は未実装です。
- `WRITE_TOKEN` は簡易的な読み書き保護です。
- 複数人で本格運用する場合は、Cloudflare Access やログイン機能の追加を検討してください。
