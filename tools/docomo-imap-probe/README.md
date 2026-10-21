# ドコモメール IMAP疎通検証（PR #63）

## 目的・範囲

Cloudflare Workers（Cloudflare側で実行）から、ドコモメールのIMAPサーバー `imap.spmode.ne.jp:993` へ **TLS接続できるか**、その後IMAPの初期応答（`* OK`）が返るかを検証します。認証・受信箱の参照・カード明細の読み込み・D1書き込みは **一切行いません**。ドコモメールのアドレスやIMAP専用パスワードは不要です。

**未実施:** Cloudflare上からの実接続テスト。GitHub Actionsの成功は接続成功を意味しません。

## 前提

- Windows / PowerShell、Git BashなどでNode.jsとnpmを使用できること。
- このリポジトリにアクセスでき、Cloudflareへログインできること。
- コマンドを実行する場所はリポジトリのルート（`package.json` がある場所）。
- Cloudflare側のリモートプレビューには**検証コードが一時アップロード**されます。利用料金やプレビュー制約はアカウント・プランに依存します。
- プローブは**本番Workerとは別名** `yomi-docomo-imap-connectivity-probe` を使い、D1/R2/Cron/本番ルートは設定していません。

## 手順（Windows / Git Bash）

### 1. PR専用ブランチをチェックアウト

既存の変更があれば退避してから、リポジトリのルートで実行します。

```bash
git fetch origin
git switch test/docomo-imap-workers-connectivity
git pull --ff-only origin test/docomo-imap-workers-connectivity
npm ci
```

手元にこのブランチがまだないときは、`git switch -c test/docomo-imap-workers-connectivity --track origin/test/docomo-imap-workers-connectivity` を使用します。**`main` で実行しない**でください。

### 2. ログイン・設定の確認

```bash
npx wrangler whoami
cat tools/docomo-imap-probe/wrangler.toml
```

必要なら `npx wrangler login`。設定の `name` が `yomi-docomo-imap-connectivity-probe` で、`main` が `./worker.ts` であること、**D1や本番ドメインのrouteがない**ことを確認します。

### 3. 一時トークンを用意（Git Bash）

下記を実行すると、ターミナルにトークンを表示せずに秘密情報ファイルを生成します。**ドコモのパスワードではありません。**

```bash
node -e 'const c=require("node:crypto");const f=require("node:fs");const p="tools/docomo-imap-probe/.dev.vars";f.writeFileSync(p,"PROBE_TOKEN="+c.randomBytes(32).toString("hex")+"\n",{mode:0o600,flag:"wx"});'
git check-ignore tools/docomo-imap-probe/.dev.vars
```

後者で対象パスが表示されることを確認します。ファイルが既にあれば生成は失敗するので、上書きせず内容を確認してください。

**重要:** `.dev.vars` がリモートプレビューへ確実に渡るかはWranglerの挙動に依存します。起動ログで `PROBE_TOKEN` が読み込まれたことを確認し、401になる場合は無理に公開せず停止して設定を見直してください。トークンをリポジトリやPRコメント、スクリーンショットに含めないでください。

### 4. Cloudflare上のリモートプレビュー起動

```bash
npx wrangler dev --remote --config tools/docomo-imap-probe/wrangler.toml --port 8788
```

通常のローカル `wrangler dev` ではCloudflareからの外向き接続を検証できません。**`--remote` が必須**です。表示されるローカル転送先（通常は `http://127.0.0.1:8788`）を控え、ターミナルを起動したままにします。

これはCloudflareの一時的なプレビュー環境でコードを実行する操作です。**`wrangler deploy` や `npm run cf:deploy` は実行しない**でください。

### 5. プローブを呼び出す（別のGit Bash）

検証トークンをレスポンスやコマンド引数として表示・共有しないため、次のNode.jsワンライナーでファイルから読み込みます。

```bash
node -e 'const f=require("node:fs");const t=f.readFileSync("tools/docomo-imap-probe/.dev.vars","utf8").match(/^PROBE_TOKEN=(.+)$/m)?.[1];if(!t)throw Error("PROBE_TOKEN missing");fetch("http://127.0.0.1:8788/probe",{method:"POST",headers:{authorization:"Bearer "+t}}).then(async r=>console.log("HTTP",r.status,await r.text())).catch(e=>{console.error(e.message);process.exitCode=1})'
```

送信されるのは検証用トークンのみです。**IMAPのユーザー名・パスワードは送信しません。** `/probe` のみが対象です。

### 6. 出力の見方

| 出力例 | 意味 | 次の対応 |
| --- | --- | --- |
| `HTTP 200 {"ok":true,"stage":"imap_greeting"}` | TLS接続後にIMAPの正常応答を確認 | IMAP認証処理の設計に進める（認証成功は未確認） |
| `HTTP 502 ... "code":"timeout"` | 接続または応答のタイムアウト | 再試行は1回程度に留め、接続制約と実装を確認 |
| `HTTP 502 ... "code":"connection_failed"` | TCP/TLSまたは読み込み失敗 | 詳細はローカルログで確認。パスワードの問題ではない |
| `HTTP 502 ... "code":"invalid_greeting"` | 期待したIMAP初期応答ではない | 接続先・解析処理を確認 |
| `HTTP 502 ... "code":"server_rejected"` | IMAP側が接続を拒否 | 接続元制限・混雑などを確認 |
| `HTTP 401 Unauthorized` | PROBE_TOKEN未設定・不一致 | 変数ロードと送信トークンを確認。認証を無効化しない |
| 接続拒否 `ECONNREFUSED` | 8788ポートでプレビュー未起動 | 起動ターミナルを確認 |
| `404 Not found` | POST先のパスまたはメソッドが違う | `POST /probe` を使用 |

**成功判定は `ok: true` と `imap_greeting` の両方が出た場合のみ**です。メールボックスにアクセスできたことや、将来の10年間の接続安定性を意味しません。

### 7. 終了・片付け

- リモート開発ターミナルで `Ctrl+C` して停止。
- 使い捨てトークンのファイルを削除：`rm tools/docomo-imap-probe/.dev.vars`（Git Bash）。
- `git status --short` を実行し、トークンや生成物が追跡されていないことを確認。
- **本番アプリのデプロイ・本番D1のマイグレーションは行わない**こと。

## 注意点・安全上の制約

1. プレビューとはいえCloudflareにコードを一時アップロードします。本番Workerと別名でも、ログイン中のCloudflareアカウント・クォータを利用します。
2. `PROBE_TOKEN` は第三者へのAPI呼び出しを制限しますが、正式な認証基盤ではありません。プローブを常時公開運用しないでください。
3. `imap.spmode.ne.jp:993` は接続先を固定。利用者入力から任意のホストやポートへ接続できないようにしています。
4. この実装はサーバーの初期応答のみ読み、メール本文・カード番号・IMAP専用パスワード・個人情報は扱いません。
5. IMAPサーバーからの応答の生文字列は返しません。エラーも粗いコードに限定します。
6. リモートプレビューでの認証情報の引き渡しが未確認の場合は、実行を中断して検証方式を見直します。
7. 常時稼働の通知取得、通信障害の再試行、D1反映、重複排除、カードタグへの紐付けは**別の実装段階**です。
8. リポジトリの `main`・本番Worker・本番D1を変更せずに検証できます。

参考：
- https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/
- https://developers.cloudflare.com/workers/local-development/
- https://developers.cloudflare.com/workers/configuration/secrets/
