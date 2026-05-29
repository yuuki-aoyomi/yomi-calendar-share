# Yomi Calendar Share

共有カレンダー機能を将来的に追加する前提で作る、React + TypeScript 製のカレンダーアプリです。

現時点ではブラウザだけで動く MVP として作っています。  
次の段階では Cloudflare Workers API / D1 / R2 で動く構成へ移行します。

AI連携は当面実装対象外です。

ただし Cloudflare に強く依存する構成にはしません。Cloudflare は最初の実行環境として扱い、
将来自宅サーバー、Docker、VPSへ移行できるように entrypoint / DB / storage を分離します。

このプロジェクトは、React / TypeScript の学習を兼ねて、Codex と相談しながら設計・実装したものです。

## 目的

`yomi-calendar` は個人用・ローカル中心のカレンダーとして残し、この `yomi-calendar-share` は将来的に以下を追加しやすい構成にすることを目的にしています。

- 共有カレンダー
- ユーザー認証
- API
- DB
- AIによる予定提案やアドバイス

## 使用技術

- React
- TypeScript
- Vite
- localStorage（現MVP）
- Cloudflare Workers / D1 / R2（次段階の移行先）

状態管理ライブラリは使わず、`useState` / `useMemo` / custom hooks を中心に実装しています。

## 主な機能

### 予定モード

- 月表示カレンダー
- 先月 / 来月の切り替え
- 今日の日付の強調表示
- 日付選択
- 選択日の予定一覧表示
- 予定追加
- 予定編集
- 開始時刻 / 終了時刻つき予定
- 予定削除
- 繰り返し予定
  - 毎週
  - 毎月
- 予定内タイムスケジュール
- 過去予定からの入力候補
- カテゴリ管理
  - 通常予定
  - 日記
  - ToDo
  - 細かい予定
  - 写真メモ
- タグ保存
- 日ごとの写真保存
- 画像の比率維持リサイズ
- 1MB超え画像の軽量化

### お金モード

- 収入 / 支出の登録
- 金額、カテゴリ、メモの保存
- 月ごとの合計収入
- バイト予定からの概算収入表示
- 月ごとの合計支出
- 月ごとの差額表示
- 複数バイト先の登録
- 複数クレカの登録
- クレカ締め日 / 支払日の保存
- クレカ引き落とし予定の自動表示

### ラブモード

- 相手のいいところ、良かった行動の記録
- メモ保存
- ハート数の保存
- 月ごとのハート合計 100 ハート目標表示
- ハートがたまっていく見た目

### 設定

- ライト / ダークモード切り替え
- 全データのJSONエクスポート
- バックアップJSONのインポート
- 保存対象データ件数の確認
- 画像保存ポリシーの表示

### AIアドバイス枠

本物のAI連携は未実装です。  
将来的な機能追加を想定して、画面上に仮の「AIアドバイス」カードを置いています。

## セットアップ

```bash
npm install
```

## 開発サーバー起動

```bash
npm run dev
```

表示された URL をブラウザで開きます。

例:

```text
http://localhost:5173/
```

## ビルド

```bash
npm run build
```

TypeScript の型チェックと Vite の本番ビルドを行います。

## プレビュー

```bash
npm run preview
```

ビルド後の成果物をローカルで確認できます。

## ファイル構成

```text
src/
  App.tsx
  main.tsx
  components/
    Calendar.tsx
    CalendarHeader.tsx
    CalendarGrid.tsx
    ModeTabs.tsx
    EventForm.tsx
    EventList.tsx
    DailyPhotoPanel.tsx
    ScheduleMode.tsx
    MoneyMode.tsx
    LoveMode.tsx
    SettingsMode.tsx
  hooks/
    useLocalStorageState.ts
  api/
    contracts.ts
  config/
    appConfig.ts
  repositories/
    calendarRepository.ts
server/
  core/
    calendarSnapshot.ts
    http.ts
  cloudflare/
    worker.ts
  storage/
    storageService.ts
  styles/
    global.css
  types/
    calendar.ts
  utils/
    backup.ts
    creditCard.ts
    date.ts
    id.ts
    imageCompression.ts
    recurrence.ts
```

## 設計メモ

### localStorage 処理の分離

保存処理は `src/hooks/useLocalStorageState.ts` にまとめています。

UIコンポーネントが直接 `localStorage` を触らないようにしておくことで、将来的に API や DB に置き換えるときの変更範囲を小さくできます。

次の移行では、`src/repositories/calendarRepository.ts` の境界に寄せてから D1 実装へ差し替えます。

### 型定義の分離

予定、お金、ラブログ、タグ、クレカ、バイト先、日別写真、バックアップの型は `src/types/calendar.ts` にまとめています。

データ構造を明確にしておくことで、将来 AI に渡すデータや API のリクエスト / レスポンス設計に流用しやすくなります。

### Cloudflare に依存しすぎない設計

初期デプロイ先として Cloudflare Pages / R2 などを想定しつつ、将来的に VPS、Docker、S3互換ストレージ、PostgreSQL などへ移行できるようにします。

そのため、現時点では R2 固有のURLやAPIをUIに埋め込まず、画像は将来的に `imageKey` とストレージ層で扱える形に移行する前提です。

画像保存の境界は `src/storage/storageService.ts` に置きます。

Cloudflare固有のコードは `server/cloudflare/worker.ts` に隔離します。
自宅サーバー移行時は `server/node` などの別entrypointを追加する想定です。

### バックアップ

設定画面から全データをJSONとして書き出し、読み込みできます。

現時点では localStorage の内容を可逆に保存する目的です。将来的には以下のようなフォルダ/zip形式への拡張を想定しています。

```text
backup/
  metadata.json
  events.json
  settings.json
  images/
    originals/
    optimized/
```

## 今回実装していないもの

- バックエンド
- DB
- 認証
- 本格的な共有機能
- R2などへの画像アップロード
- 本物のAI連携
- 給料の厳密な計算

## 今後の拡張候補

- ToDo の完了切り替え
- お金記録の編集
- ラブログの編集
- Cloudflare Workers API
- D1 / KV / R2 などを使った保存
- S3互換ストレージやローカル保存への差し替え
- ログイン機能
- 共有カレンダーのメンバー管理
- 日別写真の originals / optimized 分離保存
- zip形式のバックアップ
- AIによる予定提案、支出アドバイス、振り返り生成

## GitHub へ初回 push する手順

初回は commit を作ってから push します。

```bash
git add .
git commit -m "Initial commit"
git branch -M main
git push -u origin main
```

`src refspec main does not match any` が出る場合は、まだ commit が存在しない可能性があります。
