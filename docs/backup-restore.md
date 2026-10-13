# D1カレンダーデータのバックアップと復元

## 導入前の作業（必須）

1. Cloudflareアカウントで専用R2バケットを作成します。

   ```sh
   npx wrangler r2 bucket create yomi-calendar-share-backups
   ```

2. バケットのライフサイクル設定で `d1-calendar-snapshots/` 以下のオブジェクトを30日後に削除するルールを設定してください。**このルールはリポジトリからは自動設定されません。**
3. `npm run worker:check && npm test && npm run cf:deploy` を実行します。
4. Cloudflare WorkersのCron Triggersを確認してください。設定は `0 18 * * *`（UTC 18:00 = 日本時間03:00）です。

**注意：** バケットを作成せずにデプロイすると、R2バインディングが解決できず失敗します。

## バックアップ形式

`BACKUPS` バケットの `d1-calendar-snapshots/YYYY-MM-DD/` に、スキーマバージョン1のJSONを毎日保存します。全カレンダーの `calendar_id`、`snapshot_json`、`created_at`、`updated_at` を含みます。空のデータベースも0件のバックアップとして保存します。

失敗時はWorkerのscheduledイベントがエラーになります。CloudflareのWorkerログやアラートを有効にして監視してください。

## 復元手順（手動）

1. **まず現行D1を別途バックアップ**し、書き込みを停止します。
2. R2から復元対象のJSONをダウンロードします。例：
   ```sh
   npx wrangler r2 object get yomi-calendar-share-backups/d1-calendar-snapshots/YYYY-MM-DD/FILENAME.json --file backup.json --remote
   ```
3. JSONの `format` が `yomi-calendar-d1-backup`、`version` が `1`、`rowCount` が `rows.length` と一致し、各 `snapshot_json` が有効なJSONであることを検証します。
4. **本番に直接流し込まず**、検証用D1へ各行を `calendar_id` をキーにしてUPSERTし、件数・イベント・日本語・画像参照を確認します。
5. 復元対象を承認後、同じUPSERTを本番へ適用します。バックアップに存在しないカレンダーの削除は自動では行いません。
6. アプリから読み取り・書き込みを確認して再開します。

本PRには本番D1を自動上書きする復元エンドポイントはありません。事故防止のため、復元は手動で行います。

## 保護範囲と限界

- 対象：D1の `calendar_snapshots` テーブル
- **対象外：R2の写真バイナリ**（Issue #5）
- R2バックアップバケットのアクセス権を制限してください。カレンダーの個人情報が含まれます。
- 日次バックアップのため、最大で約24時間分の更新が失われる可能性があります。
- 大規模なデータベースではD1の読み取り件数・Cron実行時間の上限に注意してください。
