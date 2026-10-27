# 無料枠と使用量の確認

無料枠内を目指して運用しますが、現在の実装だけで数年・10年間の無料運用を保証するものではありません。画像の主データとバックアップの両方が増え、画像閲覧やCronもリクエストを消費します。料金・枠は [Workers](https://developers.cloudflare.com/workers/platform/pricing/) / [D1](https://developers.cloudflare.com/d1/platform/pricing/) / [R2](https://developers.cloudflare.com/r2/pricing/) の公式情報と、実際のダッシュボードで確認します。

## 実装済みの使用量対策

- Reactは静的assetsとして配信し、SSR・AI処理は行いません。
- 自動保存は2秒debounce、内容が前回と同じなら保存を省略します。トークン未設定時はリモート保存を行いません。
- APIモードでは15秒間隔の更新確認も行います。保存回数だけではWorker・D1の使用量を見積もれません。
- snapshot上限は1,000,000 bytes、カレンダー履歴は直近50 versionです。写真バイナリをD1へ入れないAPIモードを基本とします。
- 写真はブラウザで1,000,000 bytes・長辺1600pxを目安に縮小・圧縮します。条件内の画像は再圧縮しない場合があります。フロント・Workerの受け入れ上限は2 MiB（2,097,152 bytes）です。
- 画像表示は読み取りCookieで認可し、`private, no-store` を返します。**Worker Cache APIは使用していません。** 再表示によるWorker実行とR2 readを見積もってください。
- 日次バックアップは同一ETagの画像コピーを省略します。ただし既存コピーのHEADや一覧・manifestの操作も発生します。
- バックアップ整理はD1 JSON 14日、画像manifest 7日、画像旧世代30日を基準とし、最新世代を保護します。詳細は [バックアップと復元](backup-restore.md#保持期間) を参照してください。

## 定期的に確認するもの

| 対象 | 確認する項目 |
| --- | --- |
| Workers | 日次リクエスト数、CPU時間、失敗・制限、Cron実行結果 |
| D1 | 読み書き行数、DB容量、snapshotサイズ、履歴の容量 |
| R2 IMAGES | 保存容量、オブジェクト数、画像取得・アップロード操作 |
| R2 BACKUPS | 主画像の副本を含む保存容量、HEAD / LIST / PUT等の操作 |

`GET /api/admin/image-storage` はアプリ対象の画像使用量・孤児候補を調べるAPIであり、Cloudflare全体の請求・無料枠残量を取得するAPIではありません。最終確認はダッシュボードで行います。

画像の主データと、削除済み画像を含むバックアップの最新2世代には自動期限削除がありません。長期容量を一定にしたい場合は、復元できる範囲を決めた上で別保管先への退避や保管方針の変更を検討します。孤児GCやバックアップ整理だけで容量増加がすべて止まるわけではありません。

無料枠を超えない強制停止・自動課金制限はアプリに未実装です。アカウントの利用プラン・課金設定・使用量通知を確認し、無料枠へ近づいたら実測値を基に運用を見直してください。

## 将来の移行

API契約とJSON形式を維持し、`server/cloudflare/` のentrypoint・DB・storage adapterを差し替える方針です。Node.js / SQLite / PostgreSQL / MinIO等への移行実装はまだありません。[ホスティング移行方針](portable-hosting-plan.md) を参照してください。
