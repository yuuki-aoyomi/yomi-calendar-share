import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCardNotification } from '../server/core/cardNotificationParser';

test('JCB notification parses named fields, not examples in footer', () => {
  const result = parseCardNotification('カードご利用通知', `カード名称 ： 【OS】JCBカードW NL
JCBカードのご利用がありましたのでご連絡します。
【ご利用日時(日本時間)】 2026/10/21 15:15
【ご利用金額】 1,234円
【ご利用先】 サンプルテン
▼ご留意点
例）Amazonプライム年会費 5,900円`);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.transaction, { provider: 'jcb', transactionDate: '2026-10-21',
    usedAt: '2026-10-21T06:15:00.000Z', amountYen: 1234, merchant: 'サンプルテン', status: 'pending' });
});

test('Olive notification parses NFKC text and flattened amount', () => {
  const result = parseCardNotification('ご利用のお知らせ【三井住友カード】', `Ｏｌｉｖｅ／クレジットについてカードの利用内容をお知らせします。
ご利用内容 ご利用日時：2026/10/21 14:22サンプル商店（買物）980円
本メールはカードご利用の承認照会に基づく通知であり、カードのご利用及びご請求を確定するものではございません。`);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.transaction.merchant, 'サンプル商店');
  if (result.ok) assert.equal(result.transaction.amountYen, 980);
});

test('invalid dates and ambiguous Olive amounts are not imported', () => {
  assert.equal(parseCardNotification('カードご利用通知', `JCBカードのご利用がありましたのでご連絡します。
【ご利用日時(日本時間)】 2026/02/30 15:00
【ご利用金額】 123円
【ご利用先】 店`).ok, false);
  assert.equal(parseCardNotification('ご利用のお知らせ【三井住友カード】', `Olive/クレジットについてカードの利用内容をお知らせします。
ご利用日時：2026/10/21 14:22店A100円 店B200円
本メールはカードご利用の承認照会`).ok, false);
});
