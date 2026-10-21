import { cardTransactionPatchColumns, decodeCardTransactionCursor, encodeCardTransactionCursor,
  validateCardTransactionPatch } from '../core/cardTransactions';
import { json, jsonError } from '../core/http';

type CardTransactionRow = {
  id: string; calendar_id: string; source_id: string; transaction_date: string;
  used_at: string | null; amount_yen: number; merchant: string | null;
  category: string; status: string; confirmed_amount_yen: number | null;
  expected_payment_date: string | null; confirmed_payment_date: string | null;
  linked_money_record_id: string | null; needs_review: number;
  created_at: string; updated_at: string;
};

export async function handleCardTransactions(
  request: Request,
  db: D1Database,
  url: URL,
): Promise<Response> {
  const match = /^\/api\/card-transactions(?:\/([^/]+))?$/.exec(url.pathname);
  if (!match) return jsonError('not_found', 'Route not found.', 404);
  const calendarId = url.searchParams.get('calendarId')?.trim();
  if (!calendarId || calendarId.length > 128) return jsonError('bad_request', 'Valid calendarId is required.', 400);
  const id = match[1];

  if (request.method === 'GET' && !id) {
    const limitString = url.searchParams.get('limit') ?? '50';
    const limit = Number(limitString);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      return jsonError('bad_request', 'limit must be between 1 and 100.', 400);
    const rawCursor = url.searchParams.get('cursor');
    const cursor = rawCursor === null ? null : decodeCardTransactionCursor(rawCursor, calendarId);
    if (rawCursor !== null && !cursor) return jsonError('bad_request', 'Invalid cursor for this calendar.', 400);
    const after = cursor ? ' AND (transaction_date, created_at, id) < (?, ?, ?)' : '';
    const bindings = cursor
      ? [calendarId, cursor.transactionDate, cursor.createdAt, cursor.id, limit + 1]
      : [calendarId, limit + 1];
    const rows = await db.prepare(`
      SELECT id, calendar_id, source_id, transaction_date, used_at, amount_yen,
             merchant, category, status, confirmed_amount_yen,
             expected_payment_date, confirmed_payment_date, linked_money_record_id,
             needs_review, created_at, updated_at
      FROM card_transactions WHERE calendar_id = ?${after}
      ORDER BY transaction_date DESC, created_at DESC, id DESC LIMIT ?
    `).bind(...bindings).all<CardTransactionRow>();
    const results = rows.results ?? [];
    const page = results.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor = results.length > limit && last
      ? encodeCardTransactionCursor(calendarId, { transactionDate: last.transaction_date, createdAt: last.created_at, id: last.id })
      : null;
    return json({ transactions: page.map(toPublicTransaction), nextCursor });
  }

  if (request.method === 'PATCH' && id) {
    let decodedId: string;
    try { decodedId = decodeURIComponent(id); } catch { return jsonError('bad_request', 'Invalid id.', 400); }
    if (!decodedId || decodedId.length > 128) return jsonError('bad_request', 'Invalid id.', 400);
    const payload = await request.json().catch(() => null);
    const parsed = validateCardTransactionPatch(payload);
    if (!parsed.ok) return jsonError('bad_request', parsed.error, 400);
    const columns = Object.entries(parsed.value);
    const clause = columns.map(([key]) => cardTransactionPatchColumns[key] + ' = ?').join(', ');
    const values = columns.map(([key, value]) => key === 'needsReview' ? Number(value) : value);
    const change = await db.prepare(`UPDATE card_transactions SET ${clause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND calendar_id = ?`).bind(...values, decodedId, calendarId).run();
    if (!change.meta.changes) return jsonError('not_found', 'Transaction not found.', 404);
    const row = await db.prepare(`SELECT id, calendar_id, source_id, transaction_date, used_at,
      amount_yen, merchant, category, status, confirmed_amount_yen, expected_payment_date,
      confirmed_payment_date, linked_money_record_id, needs_review, created_at, updated_at
      FROM card_transactions WHERE id = ? AND calendar_id = ?`)
      .bind(decodedId, calendarId).first<CardTransactionRow>();
    return json({ transaction: toPublicTransaction(row!) });
  }

  return jsonError('method_not_allowed', 'Unsupported method.', 405);
}

function toPublicTransaction(row: CardTransactionRow) {
  return {
    id: row.id, calendarId: row.calendar_id, sourceId: row.source_id,
    transactionDate: row.transaction_date, usedAt: row.used_at, amountYen: row.amount_yen,
    merchant: row.merchant, category: row.category, status: row.status,
    confirmedAmountYen: row.confirmed_amount_yen, expectedPaymentDate: row.expected_payment_date,
    confirmedPaymentDate: row.confirmed_payment_date, linkedMoneyRecordId: row.linked_money_record_id,
    needsReview: Boolean(row.needs_review), createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
