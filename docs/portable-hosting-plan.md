# Portable Hosting Plan

このプロジェクトは最初に Cloudflare Workers / D1 / R2 で動かす。
ただし、将来自宅サーバー、Docker、VPSへ移行できるように、Cloudflare固有コードは隔離する。

## 境界

| 役割 | 現在 | 将来の差し替え先 |
| --- | --- | --- |
| HTTP entrypoint | `server/cloudflare/worker.ts` | Express / Hono / Fastify |
| DB | D1 | SQLite / PostgreSQL |
| 画像保存 | R2 | MinIO / S3 / local filesystem / NAS |
| Frontend | React + Vite assets | Static hosting / Nginx |

## ルール

- UIからD1やR2を直接呼ばない。
- Cloudflare binding型は `server/cloudflare` から外へ漏らさない。
- APIは通常のHTTPとして設計する。
- DBにはR2の固定URLではなく、画像キーを保存する。
- 共有機能は `calendarId` を起点にする。

## 次の実装方針

1. Cloudflare Workerはadapterとして維持する。
2. 共通処理は `server/core` に寄せる。
3. 自宅サーバー移行時は `server/node` を追加する。
4. R2依存の画像保存は storage adapter として差し替える。
