# Free Tier Operations

Cloudflare Workers / D1 / R2 の無料枠だけで数年運用するための方針。
将来自宅サーバーへ移行できるように、Cloudflareはadapterとして扱う。

## 前提

- AI処理は実装しない。
- SSRはしない。Reactは静的assetsとして配信する。
- DBはD1 snapshot保存から始める。
- 画像はR2に保存し、D1には画像キーとmetadataだけ保存する。
- 読み書きAPIは `WRITE_TOKEN` を必須にする。

## 無料枠を守るための設計

### Workers

- 静的ファイル配信を中心にし、動的APIは保存・画像取得だけにする。
- 重い計算をWorkerに置かない。
- 1リクエスト内でD1/R2を何度も呼ばない。

### D1

- 自動保存は2秒debounceする。
- 前回保存内容と同じなら書き込まない。
- ブラウザ側に書き込みトークンがない場合は保存APIを呼ばない。
- snapshotは1MBを上限にする。
- 将来データが増えたら、events / moneyRecords / loveLogs を個別テーブルに分ける。

### R2

- 画像はフロントで圧縮してからアップロードする。
- Worker側でも1.2MBを超える画像は拒否する。
- D1にはR2の固定URLではなく `imageKey` を保存する。
- 画像取得はWorker Cache APIを使い、同じ画像でR2 readを増やしすぎない。
- 自宅サーバー移行時は `imageKey` をローカルファイルパスやMinIO keyへ変換できるようにする。

## 自宅サーバー移行時

Cloudflare版:

```txt
server/cloudflare/worker.ts
D1
R2
```

自宅サーバー版:

```txt
server/node/
SQLite or PostgreSQL
local filesystem or MinIO
```

API契約は変えず、entrypointとstorage adapterだけ差し替える。
