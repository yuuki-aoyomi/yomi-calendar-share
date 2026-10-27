import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCardNotification } from '../server/core/cardNotificationParser';

const jcb = (amount: string) => `JCBカードのご利用がありましたのでご連絡します。
【ご利用日時(日本時間)】 2026/10/21 12:00
【ご利用金額】 ${amount}円
【ご利用先】 サンプル店`;
const olive = (amount: string) => `Olive/クレジットについてカードの利用内容をお知らせします。
ご利用日時：2026/10/21 14:22サンプル店（買物）${amount}円
本メールはカードご利用の承認照会`;

test('rejects signed, fractional and malformed amounts without matching a suffix', () => {
  for (const amount of ['-980', '- 980', '+980', '−980', '1.23', '1. 23', '1 234', '1,2,3', '1234,567', '1e3', '0', '1234567890123']) {
    assert.equal(parseCardNotification('JCBカードご利用通知', jcb(amount)).ok, false, `JCB: ${amount}`);
    assert.equal(parseCardNotification('ご利用のお知らせ【三井住友カード】', olive(amount)).ok, false, `Olive: ${amount}`);
  }
  for (const amount of ['980', '1,234', '1234567', '１２，３４５']) {
    const expected = Number(amount.normalize('NFKC').replace(/,/g, ''));
    for (const result of [parseCardNotification('JCBカードご利用通知', jcb(amount)),
      parseCardNotification('ご利用のお知らせ【三井住友カード】', olive(amount))]) {
      assert.equal(result.ok, true, amount);
      if (result.ok) assert.equal(result.transaction.amountYen, expected);
    }
  }
});

test('never fills missing JCB fields from forwarded or repeated notifications', () => {
  const missingAmount = jcb('200').replace('【ご利用金額】 200円\n', '');
  const previous = jcb('300').replace('2026/10/21', '2026/10/20');
  for (const body of [
    missingAmount + '\n転送されたメッセージ\n' + previous,
    jcb('200') + '\n' + previous,
    missingAmount + '\nForwarded message\n【ご利用金額】 300円',
    missingAmount + '\n▼ご留意点\n【ご利用金額】 300円',
    jcb('200') + '\n【ご利用金額】 300円',
  ]) assert.equal(parseCardNotification('JCBカードご利用通知', body).ok, false);
});

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
