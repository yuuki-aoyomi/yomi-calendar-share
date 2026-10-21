export type CardProvider = 'jcb' | 'olive';
export type ParsedCardNotification = {
  provider: CardProvider;
  transactionDate: string;
  usedAt: string;
  amountYen: number;
  merchant: string;
  status: 'pending';
};
export type ParseResult =
  | { ok: true; transaction: ParsedCardNotification }
  | { ok: false; reason: string };

const normalize = (value: string) => value.normalize('NFKC').replace(/\r\n?/g, '\n');
const parseAmount = (raw: string): number | null => {
  const amount = raw.replace(/[,，\s]/g, '');
  if (!/^\d{1,12}$/.test(amount)) return null;
  const n = Number(amount);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const parseTimestamp = (value: string): { usedAt: string; transactionDate: string } | null => {
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, hour - 9, minute));
  const restored = new Date(utc.getTime() + 9 * 3600_000);
  if (restored.getUTCFullYear() !== year || restored.getUTCMonth() !== month - 1 ||
      restored.getUTCDate() !== day || restored.getUTCHours() !== hour ||
      restored.getUTCMinutes() !== minute) return null;
  const date = [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
  return { usedAt: utc.toISOString(), transactionDate: date };
};
const reject = (reason: string): ParseResult => ({ ok: false, reason });

export function parseCardNotification(subject: string, textBody: string): ParseResult {
  const text = normalize(textBody);
  const heading = normalize(subject);
  // Do not parse forwarded footers as transactions. All required fields must appear in the notification body.
  if (/JCBカードのご利用がありましたのでご連絡します/.test(text)) {
    if (!/JCB/.test(heading) && !/カード名称\s*:\s*.*JCB/.test(text)) return reject('jcb_identity_missing');
    const date = /【ご利用日時\(日本時間\)】\s*([^\n【]+)/.exec(text);
    const amount = /【ご利用金額】\s*([\d,]+)\s*円/.exec(text);
    const merchant = /【ご利用先】\s*([^\n【]+)/.exec(text);
    if (!date || !amount || !merchant) return reject('missing_jcb_fields');
    const time = parseTimestamp(date[1]);
    const yen = parseAmount(amount[1]);
    const name = merchant[1].trim();
    if (!time || yen === null || !name || name.length > 256) return reject('invalid_jcb_fields');
    return { ok: true, transaction: { provider: 'jcb', ...time, amountYen: yen, merchant: name, status: 'pending' } };
  }
  if (/Olive\/クレジットについてカードの利用内容をお知らせします/.test(text)) {
    if (!/ご利用のお知らせ【三井住友カード】/.test(heading)) return reject('olive_subject_mismatch');
    const date = /ご利用日時\s*:\s*(\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2})/.exec(text);
    if (!date) return reject('missing_olive_date');
    const time = parseTimestamp(date[1]);
    if (!time) return reject('invalid_olive_date');
    const tail = text.slice((date.index ?? 0) + date[0].length);
    const boundary = tail.indexOf('本メールはカードご利用の承認照会');
    if (boundary < 0) return reject('missing_olive_boundary');
    const detail = tail.slice(0, boundary).trim();
    // Flattened forwarded mail is ambiguous if there are multiple prices or no yen amount.
    const hits = [...detail.matchAll(/([\d,]+)\s*円/g)];
    if (hits.length !== 1) return reject('ambiguous_olive_amount');
    const yen = parseAmount(hits[0][1]);
    const merchant = detail.slice(0, hits[0].index).trim().replace(/\s*\(買物\)\s*$/, '').trim();
    if (yen === null || !merchant || merchant.length > 256) return reject('invalid_olive_fields');
    if (detail.slice((hits[0].index ?? 0) + hits[0][0].length).trim()) return reject('extra_olive_detail');
    return { ok: true, transaction: { provider: 'olive', ...time, amountYen: yen, merchant, status: 'pending' } };
  }
  return reject('unsupported_notification');
}
