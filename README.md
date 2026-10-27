# Yomi Calendar Share

React + TypeScript + Vite で作る、予定・ToDo・お金・日別写真・ラブログを同じ日付軸で扱う共有カレンダーです。

最初のホスティング先は Cloudflare Workers / D1 / R2 ですが、将来自宅サーバー、VPS、Docker、Kubernetes へ移行できるように、Cloudflare 固有コードは `server/cloudflare/` に寄せています。

## Current Status

現在は実運用しながら改善中です。

- フロントエンドは React の通常SPA
- 通常のViteローカル開発では `localStorage` 保存。Worker APIのローカル検証は別途設定が必要
- 本番HTTPSでは同一originのHTTP APIを利用
- Cloudflare版では D1 にカレンダー全体のJSON snapshotを保存
- APIモードの写真は R2 に保存し、snapshotには `imageKey`・API表示用URL・メタデータを保存（R2公開URLへの固定はしない）
- 日別写真は毎日 `BACKUPS` R2 bucket へ世代バックアップし、同一ETagは重複保存しない
- 共有トークン `WRITE_TOKEN` でデータ読み書き・管理APIを保護。画像表示はトークンで発行した読み取り専用Cookieを使用
- AI連携は未実装

## Main Features

- 月表示カレンダー
- 予定、詳細予定、日記、写真メモ
- ToDo
  - カレンダー上は未完了ドットで通知
  - 「予定」タブ内のToDo管理では、通常は全期間の「未完了・強調表示あり」を期限順に表示
  - 「未完了すべて / 完了済み / すべてのToDo」への切り替えと、「全期間 / 過去 / 今日 / 今後」の絞り込み
  - 一覧から編集・完了・未完了への復帰・強調表示の切り替え。強調を外してもデータは残り、未完了として管理できる
  - 選択日の一覧ではタグごとに折りたたみ表示
  - タググループごとの `+` 追加
  - 複数タグ付きToDoは、付いている全タググループに表示
- タグ管理
  - 色設定
  - 表示順の上下移動
- 予定 / ToDo のドラッグ並び替え
- 日別写真
  - フロント側で圧縮
  - 現在は最適化後の画像のみ保存。原本を別途保管する機能は未実装
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
- JSONバックアップの全体 / 部分書き出し・読み込み、重複確認
- タイトル・メモ・タグ等の横断検索
- カレンダーの変更履歴・プレビュー・復元（直近50世代）

## 運用ドキュメント

- [通常更新・本番デプロイ](#通常更新と本番デプロイ)
- [Cloudflare初回セットアップ](#cloudflare初回セットアップ)
- [バックアップと復元](docs/backup-restore.md)
- [無料枠と使用量の確認](docs/free-tier-operations.md)
- [デプロイ・移行チェックリスト](docs/cloudflare-migration-checklist.md)
- [将来のホスティング移行方針](docs/portable-hosting-plan.md)

## Calendar version history

Snapshot履歴はD1 migration `0003_add_snapshot_history.sql` で作成します。新Workerのデプロイ前に `npm run db:migrate:remote` を実行してください。直近50世代を保持し、`GET /api/calendar-history/:calendarId` で一覧、`?version=N` でプレビュー、`POST /api/calendar-history/:calendarId` で `{version, expectedVersion}` を指定して新しいversionへ復元できます。復元と履歴メタデータはSQLite triggerで同一DB更新内に記録され、競合時はHTTP 409を返します。APIは既存Bearerトークン認証が必要です。

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
- 写真の参照は画像キーを軸にし、R2の固定公開URLへ依存しない（現在はAPI表示用URLもsnapshotに含む）
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

保存API・全体Import・部分Importでは共通の実行時検証を行い、不正な配列/項目型、重複ID、不正な日付や数値を反映前に拒否します。保存APIはHTTP 400を返し、現在データ・version・履歴を変更しません。従来の6コレクション（予定・家計・ラブログ・タグ・バイト・カード）は必須とし、旧データで未設定の `subscriptions` / `dailyPhotos` と予定の `tagIds` / `tags` / `timelineItems` のみ空配列へ補完します。明示的な `null` や不正な型は空配列へ変換しません。

DB読み出し・409競合応答・履歴プレビューでも項目を検証します。破損JSONや不正な項目はHTTP 500の `invalid_stored_snapshot` とし、空カレンダーとして返したり自動修復したりしません。読み出しでは旧形式との互換のため、欠落したコレクションを従来同様に空配列へ補完します。履歴復元は書き込み前に検証・補完と1MB制限を適用し、失敗時は現在データ・version・履歴を変更しません。正常な履歴は破損した現在データからの復旧にも使用可能です。履歴一覧・version確認はメタデータのみを扱います。

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

前提は Git、Node.js 24系、npm、Cloudflareを利用する場合はそのアカウントです。CIもNode.js 24を使用します。コマンド例はmacOS / Linux / Windows Git Bash向けです。PowerShellでは `cp` 等を対応する操作に読み替えてください。

```bash
git clone https://github.com/yuuki-aoyomi/yomi-calendar-share.git
cd yomi-calendar-share
node --version
npm --version
npm ci
npm run dev
```

`http://localhost:5173/` を開きます。通常は `localStorage` 保存で、Cloudflareアカウント・トークンは不要です。このデータは本番へ自動転送されません。`npm ci` はlockfile通りに依存を導入するコマンドで、依存更新が目的の場合を除き `npm install` より優先します。

## Scripts

| コマンド | 用途・書き込み先 |
| --- | --- |
| `npm run dev` | Vite開発サーバー。通常はブラウザのlocalStorage |
| `npm test` | `tests/*.test.ts` をビルドし、Node test runnerで実行 |
| `npm run build` | フロントエンド型チェックと `dist/` 生成。デプロイはしない |
| `npm run preview` | ビルド済みフロントの確認。Worker APIは起動しない |
| `npm run worker:check` | Workerの型チェック。デプロイはしない |
| `npm run cf:dev` | フロントをビルド後、WranglerでローカルWorker / D1 / R2を起動 |
| `npm run cf:deploy` | フロントをビルド後、設定先の本番Workerへデプロイ |
| `npm run db:migrate:local` | ローカルD1へ未適用migrationを適用 |
| `npm run db:migrate:remote` | **本番D1**へ未適用migrationを適用 |
| `node scripts/smoke-image-session.mjs` | CIと同じローカルHTTP画像認証スモークテスト |

`cf:deploy` はテスト・Worker型チェック・DB migrationを自動実行しません。GitHub Actionsは検証のみで、リポジトリのworkflowから本番デプロイは行いません。Cloudflare側で別途Workers Buildsを設定している場合は、その自動デプロイ設定を別に確認してください。

## Environment Variables

フロントエンド設定は `.env.example` を参考に `.env.local` などの非公開ファイルへ記述します。

```env
VITE_RUNTIME_TARGET=auto
VITE_API_BASE_URL=
VITE_CALENDAR_ID=default
```

| 設定 | 動作 |
| --- | --- |
| `auto`、API URL空欄 | localhost / 127.0.0.1 / ::1および通常HTTPはlocalStorage、その他のHTTPSは同一origin API |
| `cloudflare` | localhostでもHTTP APIを使う |
| `local`、API URL空欄 | HTTPSでもlocalStorageを使う |
| `VITE_API_BASE_URL` 非空欄 | runtime指定にかかわらずHTTP APIを使う |

本番は `auto` または `cloudflare`、`VITE_API_BASE_URL` は空欄とし、画面・APIを同一originで配信してください。現在のWorkerはCORSを実装しておらず、画像セッションも `credentials: 'same-origin'` なので、**別origin APIへの切り替えは設定だけでは動作しません**。

- `VITE_*` はビルド時に埋め込まれます。変更後は再ビルド・再デプロイ（Vite開発時は再起動）が必要です。
- `VITE_CALENDAR_ID` は共有者間で合わせます。別の値にすると別カレンダーになり、元データが消えたように見えます。
- `WRITE_TOKEN` を `VITE_*` に入れないでください。ブラウザ配信物に含まれます。
- WorkerのローカルSecretは `.dev.vars`、本番はCloudflare Secretです。`.dev.vars` を作るだけでは本番Secretは登録されません。

## ローカルWorkerの確認

Vite単体の `npm run dev` / `preview` ではD1・R2・Worker APIを検証できません。

1. `.dev.vars.example` を `.dev.vars` へコピーし、開発用 `WRITE_TOKEN` を設定します。本番とは別の値を使います。
2. `.env.local` を以下にします（通常のlocalStorage開発へ戻す場合は `auto` に戻してください）。

   ```env
   VITE_RUNTIME_TARGET=cloudflare
   VITE_API_BASE_URL=
   VITE_CALENDAR_ID=default
   ```

3. ローカルDBを準備して起動します。

   ```bash
   npm run db:migrate:local
   npm run cf:dev
   ```

4. Wranglerが表示するURL（通常 `http://localhost:8787/`）を開き、初回の「カレンダーを開く」画面の「書き込みトークン」に `.dev.vars` の値を入力します。予定の保存・再読み込みと写真の追加・表示を確認します。

`--remote` を付けないローカル実行のDB・R2は本番とは別です。`.wrangler/` 内のローカル状態を削除すると検証データも失われます。画像CookieはSecure属性付きなので、ブラウザ確認にはlocalhostを使い、LAN内IPの平文HTTPでは画像表示を前提にしないでください。

## Cloudflare初回セットアップ

既存環境の更新は次の「通常更新と本番デプロイ」を使います。リソースの再作成やSecretの再登録は毎回必要ありません。

### 1. アカウントとリソース

```bash
npx wrangler login
npx wrangler whoami
npx wrangler d1 create yomi-calendar-share-db
npx wrangler r2 bucket create yomi-calendar-share-images
npx wrangler r2 bucket create yomi-calendar-share-backups
```

`wrangler.toml` の `database_id` を作成結果へ置き換え、Worker名・リソース名も自分の環境に合わせます。既存のIDを別アカウントでそのまま使用しないでください。DB名を変更した場合、`package.json` のmigrationスクリプト内のDB名も合わせます。

必須bindingは `DB`、`IMAGES`、`BACKUPS`、`ASSETS` です。静的画面は `[assets]` の `./dist` から配信し、entrypointは `server/cloudflare/worker.ts` です。Workers Static Assets構成なので、Pages用のデプロイコマンドは使いません。R2バケットは公開不要です。

### 2. 本番DBと初回Secret

本番向け `.env.local` / `.env.production.local` とシェル環境を確認します。`VITE_RUNTIME_TARGET=local` や検証用 `VITE_API_BASE_URL` が残ったままビルドしないでください。

```bash
npm test
npm run worker:check
npm run db:migrate:remote
```

現在のmainはmigration `0001`〜`0003` を使用します。migrationはWorkerのデプロイより先に適用します。

32バイト以上の乱数を16進表記にした共有トークン（64文字以上）を用意し、非公開ファイル `.dev.vars.production` に以下の形式で保存します。例の値は置き換え、Gitへコミットしないでください（このファイルは `.gitignore` 対象です）。

```env
WRITE_TOKEN=replace-with-a-long-random-production-token
```

コードとSecretを一度に初回デプロイします。

```bash
npm run cf:deploy -- --secrets-file .dev.vars.production
```

`--secrets-file` はファイル内のSecretをCloudflareへ登録します。通常のコード更新では省略でき、登録済みSecretは保持されます。トークンは安全に保管し、端末内のファイルが不要になったら削除してください。

既存Workerのトークンを変更する場合は `npx wrangler secret put WRITE_TOKEN` も使えます。このコマンドはSecret保存だけでなく新しいWorker versionを即時デプロイするため、変更するタイミングを確認してください。変更後は全共有端末の設定も更新します。

### 3. 初回確認

デプロイ出力のHTTPS URLを開き、初回の「カレンダーを開く」画面に本番Secretと同じトークンを入力します（接続後は設定画面から変更可能です）。予定の保存・再読み込み、写真、履歴を確認します。Cronは `0 18 * * *`（UTC 18:00 = 毎日03:00 日本時間）です。翌実行後にバックアップログとR2オブジェクトも確認してください。

## 通常更新と本番デプロイ

PRはユーザーがレビューしてマージし、本番デプロイもユーザーが実行します。**マージしただけではローカルのコードや本番は更新されません。**

### 1. mainを最新にする

リポジトリのディレクトリで実行します。最初の `git status --short` に変更が出た場合は、その内容を保全・整理してから続行してください。未コミット変更を消すコマンドは実行しません。

```bash
git status --short
git switch main
git pull --ff-only origin main
git branch --show-current
git log -1 --oneline
git status --short --branch
```

ブランチ名が `main` で、目的のPRを含むコミットになっていることをGitHubのmainと照合します。ローカルだけのコミットがある場合もそのままデプロイせず確認してください。`git pull` は現在のブランチをmainへ切り替える操作ではありません。`--ff-only` が失敗したら停止し、分岐を確認します。

`origin` が未設定なら `git remote -v` で確認し、存在しない場合に限り次を実行します。

```bash
git remote add origin https://github.com/yuuki-aoyomi/yomi-calendar-share.git
git fetch origin
```

### 2. 検証とmigrationの確認

```bash
npm ci
npm test
npm run worker:check
npx wrangler d1 migrations list yomi-calendar-share-db --remote
```

未適用migrationがある場合は内容と対象DBを確認し、既存データをバックアップしてから適用します。JSONバックアップは画像バイナリやD1の履歴テーブル全体を含まないため、用途に応じて [バックアップ手順](docs/backup-restore.md) も確認してください。

```bash
npm run db:migrate:remote
```

UIやドキュメントのみの変更で未適用migrationがなければ、DB操作は不要です。

### 3. 本番へ反映

本番ビルド用の環境値・Cloudflareアカウント・`wrangler.toml` の対象を確認して実行します。

```bash
npx wrangler whoami
npm run cf:deploy
```

フロントのビルドが成功した後、Workerと静的画面が反映されます。`npm run build` だけでは本番は変わりません。デプロイしたコミットSHA、出力されたWorker versionとURLを控えます。

アップロードせずビルド・bundleだけ確認する場合:

```bash
npm run build
npx wrangler deploy --dry-run
```

dry-runでは本番のbinding・Secret・権限・実接続の成功までは保証できません。

### 4. 反映確認と切り戻し

- ページを再読み込みし、変更したUIを確認する
- 同期が「保存済み」になること、再読み込みしてもデータが残ることを確認する
- 写真の追加・表示、変更履歴・プレビューを確認する
- 共有相手も同じURL・カレンダーID・有効なトークンを使っていることを確認する

変更が見えない場合は、最初にデプロイしたブランチ・コミット・URLを確認してください。認証エラーはWorker Secretと端末のトークン、画像だけのエラーは画像セッション・同一origin・Cookieを確認します。`no such table` / `no such column` は対象DBと未適用migrationを確認します。

問題がある場合はCloudflareのデプロイ履歴から既知の正常なWorker versionへ戻すことを検討します。ただし、**WorkerのロールバックはD1のスキーマ・データやR2を巻き戻しません**。DB・画像の復旧は別途 [バックアップと復元](docs/backup-restore.md) に従います。

## Access Control

このアプリはログイン機能ではなく、共有トークン方式です。

`WRITE_TOKEN` が必要な操作:

- カレンダーデータ読み込み・保存、変更履歴一覧・プレビュー・復元
- 画像アップロードと画像閲覧セッションの発行
- 画像バックアップ世代一覧・復元、画像ストレージ統計・孤児画像GC

画像GETはトークンそのものをURLに付けず、`POST /api/image-session` で発行する1時間有効の読み取り専用Cookie（HttpOnly / Secure / SameSite=Strict）で認可します。
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

- フロントで1,000,000 bytes・長辺1600pxを目安に縮小・圧縮。元ファイルが条件内なら再圧縮を省略する場合がある
- フロント・Workerの受け入れ上限は2 MiB（2,097,152 bytes）。目標サイズ以内への圧縮を常に保証するものではない
- 現在の保存先は `daily-images/optimized/`。原本の別保存は未実装
- DBには `imageKey` とmetadataを保存
- R2の固定公開URLは保存しない
- 表示URLはAPI経由で生成。画像GETは `private, no-store` とし、Worker Cache APIは使用しない
- 毎日のCronで `IMAGES` から `BACKUPS` へETag単位の世代バックアップを作成
- 保持期間・削除条件は [バックアップと復元](docs/backup-restore.md) を参照
- `GET /api/admin/image-backups?imageKey=...` でバックアップ世代一覧を取得
- `POST /api/admin/image-restore` で指定世代または最新世代を復元
- `GET /api/admin/image-storage` でR2使用量・孤児画像候補・参照切れを確認。現在のsnapshotと保持中の全履歴の画像（旧画像URLを含む）を参照対象とし、`gcEligibleKeys` にアップロード後24時間以上経過した削除可能候補を返す
- `POST /api/admin/image-gc` は現在と履歴の参照を再確認し、アップロード後24時間以上経過した孤児だけを明示確認付きで削除。参照データの破損や履歴取得失敗時は503で停止し、削除しない
- 24時間の猶予は保存待ちの保護であり、長期間未保存の編集や参照確認後の同時更新を原子的に保護するものではない。GCは編集・アップロード・復元を行っていない時間に実行し、#23の競合制御は継続対応する

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

- [ホスティング移行方針](docs/portable-hosting-plan.md)
- [無料枠の運用](docs/free-tier-operations.md)
- [デプロイ・移行チェックリスト](docs/cloudflare-migration-checklist.md)

## Public Repository Safety

コミットしてよいもの:

- `wrangler.toml`
- `.dev.vars.example`
- migration SQL
- source code
- docs

コミットしてはいけないもの:

- `.env`
- `.env.local` / `.env.production.local`
- `.dev.vars` / `.dev.vars.production`
- Cloudflare API token
- `WRITE_TOKEN`
- R2 access key / secret key

## Known Limitations

- AI機能は未実装
- ログイン / ユーザー別権限は未実装
- 天気背景は手動選択で、外部天気API連携は未実装
- `SettingsMode`, `MoneyMode`, `EventList` は今後分割したい
- 現在のDB保存はsnapshot方式で、正規化テーブルではない（保存上限1,000,000 bytes）
- APIモードの未保存変更は画面のメモリーに保持される。同期失敗・オフライン中に閉じると失われる可能性がある
- カード通知の自動受信・取込、Push通知、PWAは現在のmainでは未実装
- 原本の別保存、別origin APIへのCORS対応、無料枠を超えない自動制御は未実装


## 参照したCloudflare公式資料

運用手順はリポジトリの実装と、以下の公式資料を照合しています。CLIオプションはインストール済みWranglerの `--help` でも確認してください。

- [Secretsと初回デプロイ](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Workerデプロイ・SecretのCLI](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
- [D1 migration・exportのCLI](https://developers.cloudflare.com/workers/wrangler/commands/d1/)
- [Worker versionとストレージの関係](https://developers.cloudflare.com/workers/versions-and-deployments/)
