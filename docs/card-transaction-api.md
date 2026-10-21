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
