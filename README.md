# Yomi Calendar Share

共有カレンダー機能を将来的に追加する前提で作る、React + TypeScript 製のカレンダーアプリです。

現時点ではバックエンド、DB、認証、共有機能、AI連携は実装せず、まずはブラウザだけで動く MVP として作っています。  
データは `localStorage` に保存します。

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
- localStorage

状態管理ライブラリは使わず、`useState` / `useMemo` / custom hooks を中心に実装しています。

## 主な機能

### 予定モード

- 月表示カレンダー
- 先月 / 来月の切り替え
- 今日の日付の強調表示
- 日付選択
- 選択日の予定一覧表示
- 予定追加
- 開始時刻 / 終了時刻つき予定
- 予定削除
- カテゴリ管理
  - 通常予定
  - 日記
  - ToDo
  - 細かい予定
  - 写真メモ
- タグ保存
- 写真URL / 写真メモ文字列の保存

### お金モード

- 収入 / 支出の登録
- 金額、カテゴリ、メモの保存
- 月ごとの合計収入
- 月ごとの合計支出
- 月ごとの差額表示
- `バイト` タグ付き予定の勤務時間合計表示

### ラブモード

- 相手のいいところ、良かった行動の記録
- メモ保存
- ハート数の保存
- 月ごとのハート合計
- ハートがたまっていく見た目

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
    ScheduleMode.tsx
    MoneyMode.tsx
    LoveMode.tsx
  hooks/
    useLocalStorageState.ts
  styles/
    global.css
  types/
    calendar.ts
  utils/
    date.ts
```

## 設計メモ

### localStorage 処理の分離

保存処理は `src/hooks/useLocalStorageState.ts` にまとめています。

UIコンポーネントが直接 `localStorage` を触らないようにしておくことで、将来的に API や DB に置き換えるときの変更範囲を小さくできます。

### 型定義の分離

予定、お金、ラブログの型は `src/types/calendar.ts` にまとめています。

データ構造を明確にしておくことで、将来 AI に渡すデータや API のリクエスト / レスポンス設計に流用しやすくなります。

## 今回実装していないもの

- バックエンド
- DB
- 認証
- 本格的な共有機能
- 画像アップロード
- 本物のAI連携
- 給料の詳細計算

## 今後の拡張候補

- 予定の編集
- ToDo の完了切り替え
- お金記録の編集
- ラブログの編集
- Cloudflare Workers API
- D1 / KV / R2 などを使った保存
- ログイン機能
- 共有カレンダーのメンバー管理
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
