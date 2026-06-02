# Yomi Calendar Share

React + TypeScript + Vite で作る、予定・ToDo・お金・日別写真・ラブログを同じ日付軸で扱う共有カレンダーです。

最初のホスティング先は Cloudflare Workers / D1 / R2 ですが、将来自宅サーバー、VPS、Docker、Kubernetes へ移行できるように、Cloudflare 固有コードは `server/cloudflare/` に寄せています。

## Current Status

現在は実運用しながら改善中です。

- フロントエンドは React の通常SPA
- ローカル開発では `localStorage` 保存
- 本番HTTPSでは同一originのHTTP APIを利用
- Cloudflare版では D1 にカレンダー全体のJSON snapshotを保存
- 画像は R2 に保存し、DBには固定URLではなく `imageKey` とメタデータを保存
- 共有トークン `WRITE_TOKEN` で読み書きAPIと画像APIを保護
- AI連携は未実装

## Main Features

- 月表示カレンダー
- 予定、詳細予定、日記、写真メモ
- ToDo
  - カレンダー上は未完了ドットで通知
  - 選択日の一覧ではタグごとに折りたたみ表示
  - タググループごとの `+` 追加
  - 複数タグ付きToDoは、付いている全タググループに表示
- タグ管理
  - 色設定
  - 表示順の上下移動
- 予定 / ToDo のドラッグ並び替え
- 日別写真
  - フロント側で圧縮
  - original / optimized を分ける設計方針
- お金モード
  - 収入 / 支出記録
  - クレカ利用記録
  - クレカ締め日 / 支払日から引き落とし予定を計算
  - 残高警告
- サブスク管理
  - 月額 / 年額
  - 請求月、請求日、支払いカード
  - クレカ支払日への反映
- バイト給料計算
  - バイトタグ付き予定から勤務時間を集計
  - 深夜時給、休憩時間、締め日、給料日
- ラブログ
  - 日別ログ
  - ハート貯金
- 日次 / 月次まとめ
- ライト / ダークテーマ
- Visual Update
  - 起動時スプラッシュ
  - 時間帯背景: 朝、昼、夕方、夜
  - 手動天気背景: 晴れ、雨、雷、曇り、雪、霰・雹
  - 設定でON/OFF
- JSONバックアップの書き出し / 読み込み

## Architecture

現在の構成:

```text
src/
  api/          HTTP API client and contracts
  components/   React UI components
  config/       environment/config entrypoint
  hooks/        reusable React hooks
  repositories/ calendar snapshot boundary
  storage/      storage service boundary
  styles/       global CSS
  types/        app domain types
  utils/        date, recurrence, salary, subscription, backup helpers
server/
  core/         portable server-side helpers
  cloudflare/   Cloudflare Worker entrypoint and bindings
migrations/     D1 migrations
docs/           operation and portability notes
```

設計方針:

- UIから D1 / R2 を直接触らない
- Cloudflare binding型は `server/cloudflare/` の外へ広げない
- フロントは通常のHTTP APIへアクセスする
- 環境値は `src/config/appConfig.ts` から読む
- 画像URLは永続保存せず、画像キーを保存する
- サブスク、給料、クレカなどの計算はフロント側の純粋ロジックに寄せる
- 移行時は API contract と snapshot 形式を保ち、entrypoint / DB / storage を差し替える

## Architecture Review Notes

現時点で構成は大きく破綻していません。Cloudflare 固有処理もおおむね分離できています。

ただし、次に大きく育つ前に分割したい箇所があります。

- `src/components/SettingsMode.tsx`
  - かなり大きいです。
  - `TagSettings`, `JobSettings`, `CreditCardSettings`, `SubscriptionSettings`, `DataSettings` に分ける候補です。
- `src/components/MoneyMode.tsx`
  - 集計ロジックと編集UIが同居しています。
  - `moneySummary`, `moneyWarnings`, `MoneyRecordList` へ分けると読みやすくなります。
- `src/components/EventList.tsx`
  - ToDoグループ、通常予定カード、ドラッグ並び替えが同居しています。
  - `TodoGroupList`, `TodoListItem`, `SortableEventCard` へ分ける候補です。
- Visual background
  - 現在は `App.tsx` と `global.css` にまとまっています。
  - 将来天気APIへつなぐ場合は `VisualBackground` コンポーネントと `weatherService` へ分離すると安全です。

今すぐ大規模リファクタは不要ですが、機能追加のついでに小さく分けるのが良いです。

## Data Compatibility

実運用中のため、既存データ互換を重視しています。

- localStorage key は維持
- D1 snapshot 形式は維持
- 既存サブスクは `billingCycle` 未設定なら月額扱い
- 既存予定 / ToDo は `sortOrder` 未設定なら従来の時刻順
- ToDoは引き続き `CalendarEvent` の `category: 'todo'`
- Visual設定は別localStorage keyで保存し、バックアップ本体には含めていません

## Tech Stack

- Frontend: React, TypeScript, Vite
- Local storage: browser `localStorage`
- Production runtime: Cloudflare Workers
- Database: Cloudflare D1
- Object storage: Cloudflare R2
- Future DB targets: SQLite, PostgreSQL
- Future storage targets: local filesystem, MinIO, S3, NAS

## Quick Start

```bash
npm install
npm run dev
```

Local URL:

```text
http://localhost:5173/
```

ローカル開発では、通常 `localStorage` に保存されます。

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

よく使う確認:

```bash
npm run build
npm run worker:check
```

## Environment Variables

Frontend config:

```env
VITE_RUNTIME_TARGET=auto
VITE_API_BASE_URL=
VITE_CALENDAR_ID=default
```

`VITE_RUNTIME_TARGET=auto` の挙動:

- localhost: `localStorage`
- 本番HTTPS: 同一originのAPI

別origin API を使う場合:

```env
VITE_RUNTIME_TARGET=cloudflare
VITE_API_BASE_URL=https://example.your-worker.workers.dev
VITE_CALENDAR_ID=default
```

重要:

- `WRITE_TOKEN` を `VITE_*` に入れないでください。
- `VITE_*` はブラウザ配信物に含まれます。
- 本番の `WRITE_TOKEN` は Cloudflare Secret に保存します。

## Cloudflare Setup

想定リソース名:

```text
D1 database: yomi-calendar-share-db
R2 bucket:   yomi-calendar-share-images
```

`wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "yomi-calendar-share-db"
database_id = "your-d1-database-id"

[[r2_buckets]]
binding = "IMAGES"
bucket_name = "yomi-calendar-share-images"
```

作成例:

```bash
npx wrangler login
npx wrangler d1 create yomi-calendar-share-db
npx wrangler r2 bucket create yomi-calendar-share-images
```

Secret:

```bash
npx wrangler secret put WRITE_TOKEN
```

ローカルCloudflare確認:

```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run cf:dev
```

本番migration:

```bash
npm run db:migrate:remote
```

Deploy:

```bash
npm run cf:deploy
```

## Access Control

このアプリはログイン機能ではなく、共有トークン方式です。

`WRITE_TOKEN` が必要な操作:

- カレンダーデータ読み込み
- カレンダーデータ保存
- 画像アップロード
- 画像表示

注意:

- トークンを知っている人は全データを読めて編集できます。
- 本格的なユーザー別権限は未実装です。
- 複数人で厳密に運用する場合は、Cloudflare Access やログイン機能を検討してください。

## Data Model

現在は D1 に `calendar_snapshots` としてカレンダー全体をJSON snapshotで保存しています。

理由:

- MVPとして壊しにくい
- 画面変更に追従しやすい
- D1 write回数を抑えやすい
- 将来移行時にJSONとして読み出しやすい

将来的にデータが増えたら、以下へ正規化できます。

```text
events
money_records
love_logs
tags
part_time_jobs
credit_cards
subscriptions
daily_photos
settings
```

## Images

画像方針:

- フロントで圧縮してからアップロード
- DBには `imageKey` とmetadataを保存
- R2の固定公開URLは保存しない
- 表示URLはAPI経由で生成

将来自宅サーバーでは、同じ `imageKey` をローカルファイルパスやMinIO keyへ置き換えます。

## Portability Plan

Cloudflare版:

```text
server/cloudflare/worker.ts
D1
R2
```

将来の自宅サーバー / VPS / Docker 版:

```text
server/node/
SQLite or PostgreSQL
local filesystem or MinIO
```

移行時に守ること:

- API contract を変えない
- `CalendarDataSnapshot` を移行単位にする
- DB / storage adapter を差し替える
- UIから特定ホスティング先のAPIを直接呼ばない

詳しくは以下を参照してください。

- `docs/portable-hosting-plan.md`
- `docs/free-tier-operations.md`
- `docs/cloudflare-migration-checklist.md`

## Public Repository Safety

コミットしてよいもの:

- `wrangler.toml`
- `.dev.vars.example`
- migration SQL
- source code
- docs

コミットしてはいけないもの:

- `.env`
- `.env.local`
- `.dev.vars`
- Cloudflare API token
- `WRITE_TOKEN`
- R2 access key / secret key

## Known Limitations

- AI機能は未実装
- ログイン / ユーザー別権限は未実装
- 天気背景は手動選択で、外部天気API連携は未実装
- `SettingsMode`, `MoneyMode`, `EventList` は今後分割したい
- 現在のDB保存はsnapshot方式で、正規化テーブルではない
