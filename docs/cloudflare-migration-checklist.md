# デプロイ・移行チェックリスト

Cloudflare版はすでに実装・運用されています。これからD1 / R2へ載せ替えるという旧手順ではなく、現在の環境の更新・別環境への移行確認に使います。実行コマンドは [README](../README.md) を参照してください。

## 既存環境の更新

- [ ] 対象PRがmainへマージされている
- [ ] 作業ツリーの変更を保全し、`git switch main` → `git pull --ff-only origin main` を実行した
- [ ] ブランチとコミットを確認し、検証用ブランチからデプロイしていない
- [ ] `npm ci`、`npm test`、`npm run worker:check` が成功した
- [ ] ビルド用 `VITE_*` が本番の値。画面とAPIは同一origin、共有するカレンダーIDは一致している
- [ ] CloudflareアカウントとWorker名、D1 ID、R2バケット名を確認した
- [ ] 未適用migrationを確認し、必要な場合はバックアップ後にWorkerより先に適用した
- [ ] `npm run cf:deploy` が成功し、出力のversion・URLを控えた
- [ ] 保存・再読み込み・写真・変更履歴を確認した
- [ ] 次回Cron後のD1バックアップ・画像manifest・保持期間整理を確認する

## 別アカウント・別環境へ移す場合

- [ ] `DB`、`IMAGES`、`BACKUPS`、`ASSETS` のbindingを用意した
- [ ] D1のIDを自分の環境へ置き換え、名前変更時はmigrationスクリプトも合わせた
- [ ] migrationを適用し、本番Secretを新しいWorkerに登録した
- [ ] JSONだけでなくR2画像バイナリも移した。参照キーと画像が一致している
- [ ] D1 snapshot内の旧表示URL・画像キーを確認した。旧URLに埋め込まれたトークンを新環境へ持ち込まない
- [ ] 設定・Secret・カレンダーID・共有URLを確認した。ブラウザのlocalStorageはoriginごとに別になる
- [ ] バックアップ・復元を検証用環境で確認した
- [ ] 移行中の書き込み停止と、問題時の切り戻し方法を決めた

## 実装済みと今後の境界

- D1には予定・家計・ラブログ・タグ・バイト・カード・サブスク・写真メタデータのJSON snapshotとversion履歴を保存します。
- R2は現在 `daily-images/optimized/` の写真と、そのバックアップを保存します。原本の別保存は未実装です。
- `src/storage/storageService.ts` は境界の型定義です。現在の画像UIは `src/api/calendarApi.ts` のHTTP関数を利用しており、全操作を実装した汎用StorageService adapterが完成しているわけではありません。
- AI提案、アプリ内のユーザー別権限、別origin CORS、Node.js版backendは未実装です。将来設計と現在使える機能を混同しないでください。
- Worker versionの切り戻しだけではDB・画像は元に戻りません。[バックアップと復元](backup-restore.md) を併せて確認します。
