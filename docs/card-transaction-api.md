# カード取引API（Draft）

このAPIは認証済み利用者向けの基盤です。メール受信・家計への反映・バックアップは未完成のため、本番適用は保留してください。課題は #65 で管理します。

## 一覧のページ送り

`GET /api/card-transactions?calendarId=default&limit=100`

既存のWRITE_TOKEN認証が必要です。`limit`は1〜100、既定値は50です。

応答は `{ transactions: [...], nextCursor: string | null }` です。

1. 最初は`cursor`なしで取得します。
2. `nextCursor`が文字列なら、同じ`calendarId`の次のリクエストに`URLSearchParams`で`cursor`として渡します。
3. `nextCursor`が`null`なら最後のページです。

カーソルの中身はクライアントで変更しないでください。別カレンダー用・不正なカーソルは400を返します。offset方式には対応していません。

順序は`transaction_date DESC, created_at DESC, id DESC`です。同日時の取引もIDで区別します。PATCHではこの3項目を変更できません。途中で新しい取引が追加された場合は、一覧を先頭から再取得すると表示されます。これは時点を固定したスナップショットではありません。

`0005_card_transaction_pagination.sql`で、この順序に対応する索引を追加します。索引は検索・並べ替えの無駄を減らしますが、無料枠への適合は実D1での想定件数による測定が別途必要です。本番へのmigration適用はまだ行いません。


## 更新競合の防止

一覧GETと成功したPATCHの各取引には `revision`（初期値0）が含まれます。

`PATCH /api/card-transactions/:id?calendarId=default`

```json
{ "expectedRevision": 0, "status": "confirmed", "confirmedAmountYen": 500 }
```

取得時の `revision` を `expectedRevision` として必ず送信してください。
一致する場合だけ更新し、番号を1増やして `{ transaction: ... }` を返します。
番号確認・更新・応答行の取得は単一の条件付きUPDATE RETURNINGで行います。

- 400: expectedRevisionが未指定、不正（0以上かつMAX_SAFE_INTEGER未満の安全な整数が必要）、または編集項目なし。
- 404: 指定カレンダー内に取引が存在しない。
- 409: 取得後に別の更新が行われた。一覧を再取得し、内容を確認してから新しい番号で編集してください。自動上書き再試行はしません。

`0006_card_transaction_revision.sql` は既存行と新規行をrevision 0にします。
このAPIを使う将来の通知更新も同じ条件付き更新に従う必要があります。
旧クライアントの番号なしPATCHは400になります。本番migrationは今回適用していません。
