# バックアップと復元

通常のデプロイ手順は [README](../README.md#通常更新と本番デプロイ) を参照してください。復元は既存データを書き換える操作です。目的に合った方法を選び、作業中は共有端末の編集・自動保存を停止します。

## バックアップの種類

| 種類 | 内容 | 含まれないもの |
| --- | --- | --- |
| 設定画面のJSON Export / Import | 現在の予定・ToDo・家計・タグ等。全体または対象を選んだ部分出力 | R2画像バイナリ、D1履歴テーブル、Secret、端末の表示設定 |
| アプリの変更履歴 | カレンダーごとの直近50 versionのsnapshot。プレビューと復元 | R2画像バイナリ、全DBの退避 |
| 日次D1バックアップJSON | `calendar_snapshots` の全行。`calendar_id`、`snapshot_json`、作成・更新日時 | 元のversion番号、履歴テーブル、migration管理テーブル、R2画像、Secret |
| 日次R2画像バックアップ | 保存済み最適化画像のETag別コピーとmanifest | アップロード前の原本、D1 snapshot |
| Wrangler D1 SQL export | migration前・復元前などに手動で退避するD1のSQL | R2画像、Workerコード・Secret |

JSON Export内にローカル写真のdata URLが含まれる場合はありますが、R2写真についてはメタデータと参照のみです。JSONだけで別環境に写真バイナリまで移せるわけではありません。

## 日次バックアップの導入・確認

1. 初回は `BACKUPS` 用R2バケットを作り、`wrangler.toml` のbindingと実バケット名を一致させます。既存バケットは再作成不要です。
2. [README](../README.md#cloudflare初回セットアップ) に従ってDB migration・Secret・コードを反映します。バケット未作成のままデプロイするとbindingの解決に失敗します。
3. Cron Triggersが `0 18 * * *`（UTC 18:00 = 毎日03:00 日本時間）になっていることを確認します。
4. 実行後のWorkerログと `BACKUPS` バケットで、D1 JSONと画像manifestが保存されたことを確認します。両方成功した後に保持期間の整理が走ります。失敗時はscheduledイベントのエラーを確認します。

保存先:

```text
d1-calendar-snapshots/YYYY-MM-DD/<UTC timestamp>.json
r2-images/manifests/YYYY-MM-DD/<UTC timestamp>.json
r2-images/objects/<source key>/__versions/<ETag>
```

日付ディレクトリ・ファイル内時刻はUTCです。03:00日本時間の実行ではUTC上の前日の日付になります。D1が空の場合も0行の正常なJSONを保存します。画像は `daily-images/optimized/` を対象とし、同一ETagは再コピーしません。

### 保持期間

`server/core/backupRetention.ts` とWorkerの実装を基準とします。

| 対象 | 削除候補になる条件 | 保護する世代 |
| --- | --- | --- |
| D1 JSON | アップロードから14日超 | 最新2件 |
| 画像manifest | アップロードから7日超 | 最新2件 |
| 画像のETag別コピー | アップロードから30日超 | 元画像キーごとの最新2件 |

削除は1回のCronあたり最大500件です。最新2件は古くても保持するため、「14日経過したら必ずすべて消える」という設定ではありません。元画像をアプリから削除した後もバックアップの最新2世代は保持されます。主画像 `IMAGES` の孤児GCとは別の処理です。

**以前の資料にあった「D1バックアップをR2 lifecycleで30日後に削除」は必須ではありません。** 現在はアプリ側で上表の整理を実装しています。既存のlifecycleルールはアプリの世代保護より優先してオブジェクトを消せるため、設定内容を確認し、保護したい最新世代と競合するルールを見直してください。この確認・変更は自動実行されません。

## 変更履歴からの復元

設定済みトークンでアプリの「変更履歴・復元」を開き、対象versionをプレビューします。未保存変更や競合を解消し、対象を確認して復元します。復元は古いversionへ番号を戻す操作ではなく、新しいversionを作成します。

APIはBearerトークンを必要とします。

- `GET /api/calendar-history/:calendarId`: 一覧
- `GET /api/calendar-history/:calendarId?version=N`: プレビュー
- `POST /api/calendar-history/:calendarId`: `{ "version": N, "expectedVersion": 現在のversion }` で復元

競合はHTTP 409、不正な履歴データは拒否します。画像キーの復元だけでは、消えた写真バイナリは復元されません。

## 日次D1 JSONの取得とローカル検証

バックアップは個人情報を含みます。リポジトリ外の非公開ディレクトリに保存します。以下の `YYYY-MM-DD/FILENAME.json` はR2に実在するキーへ置き換えます。

```bash
mkdir -p ../yomi-calendar-private
npx wrangler r2 object get yomi-calendar-share-backups/d1-calendar-snapshots/YYYY-MM-DD/FILENAME.json --file ../yomi-calendar-private/backup.json --remote
node scripts/restore-d1.mjs ../yomi-calendar-private/backup.json
```

`restore-d1.mjs` の既定動作は**dry-run**です。形式・件数・重複ID・snapshotがJSONオブジェクトであることを確認し、DBへは書き込みません。アプリの全項目の検証・実画面確認を代替するものではありません。

ローカルへの適用は、専用検証用D1を `wrangler.toml` に別binding / database名として用意し、migration `0001`〜`0003` を適用してから行います。本番と同じローカル検証DBを上書きしないよう、対象名を確認してください。

```bash
npx wrangler d1 migrations apply yomi-calendar-restore-test --local
node scripts/restore-d1.mjs ../yomi-calendar-private/backup.json --apply --database yomi-calendar-restore-test
npx wrangler d1 execute yomi-calendar-restore-test --local --command "SELECT calendar_id, version, updated_at FROM calendar_snapshots;"
```

このCLIは `--remote` を受け付けません。既存の同じカレンダーIDはUPSERTで上書きし、対象外の行は削除しません。新規行はversion 1、既存行は現在のversion + 1になります。更新日時は復元実行時刻、既存行の作成日時は維持し、履歴のoperationは `restore`、`restored_from_version` はNULLです。変更は同一トランザクションで行い、復元前のversionでの保存は409になります。

空バックアップは0件として正常ですが、適用しても既存データは削除しません。復元後は件数だけでなく、予定・日本語・画像参照・APIからの読み取りも確認してください。

## 本番D1の手動復元

本番D1を自動上書きする復元エンドポイント・復元CLIはありません。

1. 編集・アップロード・共有端末の自動保存を止め、現行D1を別途退避します。

   ```bash
   mkdir -p ../yomi-calendar-private
   npx wrangler d1 export yomi-calendar-share-db --remote --output ../yomi-calendar-private/d1-before-restore.sql
   ```

2. 復元対象JSONを取得し、上記の専用ローカルD1で検証します。
3. SQLは `scripts/restore-d1-sql.mjs` のversion更新・履歴記録の方式に従って用意し、適用対象とSQLをレビューします。単に古い `snapshot_json` をUPDATEするだけではversion・履歴が整合しません。
4. 内容を確認したSQLを本番へ適用します。バックアップにないカレンダーは自動削除しません。SQL exportをそのまま本番へ流し戻す方法も、schema・migration管理・既存テーブルとの整合確認なしには使いません。
5. 全端末を再読み込みし、現在versionの読み込み、保存、写真、履歴を確認して編集を再開します。

## 画像の復元と削除

認証付き管理APIで画像キーごとのバックアップを確認し、同じ元画像キーへコピーを戻します。

- `GET /api/admin/image-backups?imageKey=...`: 保存世代の一覧
- `POST /api/admin/image-restore`: `{ "imageKey": "...", "backupKey": "..." }`。`backupKey` 省略時は最新世代
- `GET /api/admin/image-storage`: 使用量・孤児候補・参照切れ
- `POST /api/admin/image-gc`: `{ "keys": ["..."], "confirm": "DELETE_ORPHANS" }`（最大100キー）。孤児候補を再検証して削除。現在snapshotと保持中履歴の参照、および24時間の猶予を考慮

各操作に `WRITE_TOKEN` が必要です。画像復元APIはD1メタデータを自動復元しません。履歴やJSON内の画像キーと突き合わせます。管理API呼び出し時もトークンをURLへ付けないでください。

GCは編集・アップロード・復元のない時間帯に実行します。24時間の猶予は、長時間未保存の編集や参照検証後の同時更新まで原子的に保護しません。

## 保護範囲と限界

- 日次バックアップ間には最大約24時間分の更新が失われる可能性があります。Cron失敗が続けばそれ以上です。
- バックアップバケットも同じアカウント内なので、アカウント喪失・全体削除への独立した保護ではありません。必要な復旧ポイントは別の保管先にも退避します。
- Secret、Worker設定、端末の表示設定は別途保管します。JSONを復元してもSecretは戻りません。
- 大量の画像・snapshotではCron実行時間、D1 / R2の使用量・保存容量も確認してください。
