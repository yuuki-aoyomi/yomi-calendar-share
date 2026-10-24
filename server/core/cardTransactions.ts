export type CardTransactionStatus = 'pending' | 'confirmed' | 'cancelled';

export type CardTransaction = {
  id: string;
  calendarId: string;
  sourceId: string;
  externalReference: string | null;
  usedAt: string | null;
  transactionDate: string;
  amountYen: number;
  merchant: string | null;
  category: string;
  status: CardTransactionStatus;
  confirmedAmountYen: number | null;
  expectedPaymentDate: string | null;
  confirmedPaymentDate: string | null;
  linkedMoneyRecordId: string | null;
  needsReview: boolean;
  createdAt: string;
  updatedAt: string;
};

export const isDateKey = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export function validateCardTransactionPatch(value: unknown):
  | { ok: true; value: Record<string, string | number | boolean | null> }
  | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'Expected an object.' };
  const body = value as Record<string, unknown>;
  const allowed = new Set(['merchant', 'category', 'status', 'confirmedAmountYen', 'confirmedPaymentDate', 'needsReview']);
  const patch: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(body)) {
    if (!allowed.has(key)) return { ok: false, error: 'Unknown field: ' + key };
    if (key === 'status' && (typeof item !== 'string' || !['pending', 'confirmed', 'cancelled'].includes(item)))
      return { ok: false, error: 'Invalid status.' };
    if ((key === 'merchant' || key === 'category') && (typeof item !== 'string' || item.length > 256 || (key === 'category' && item.trim().length === 0)))
      return { ok: false, error: 'Invalid ' + key + '.' };
    if (key === 'confirmedAmountYen' && item !== null && (!Number.isSafeInteger(item) || (item as number) < 0))
      return { ok: false, error: 'Invalid amount.' };
    if (key === 'confirmedPaymentDate' && item !== null && !isDateKey(item))
      return { ok: false, error: 'Invalid payment date.' };
    if (key === 'needsReview' && typeof item !== 'boolean')
      return { ok: false, error: 'Invalid review flag.' };
    patch[key] = item as string | number | boolean | null;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Empty patch.' };
  return { ok: true, value: patch };
}

export const cardTransactionPatchColumns: Record<string, string> = {
  merchant: 'merchant',
  category: 'category',
  status: 'status',
  confirmedAmountYen: 'confirmed_amount_yen',
  confirmedPaymentDate: 'confirmed_payment_date',
  needsReview: 'needs_review',
};

export type CardTransactionCursor = { transactionDate: string; createdAt: string; id: string };

// Portable opaque cursor: includes calendar scope and the complete, immutable sort key.
export function encodeCardTransactionCursor(calendarId: string, row: CardTransactionCursor): string {
  const bytes = new TextEncoder().encode(JSON.stringify([1, calendarId, row.transactionDate, row.createdAt, row.id]));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCardTransactionCursor(raw: string, calendarId: string): CardTransactionCursor | null {
  if (!/^[A-Za-z0-9_-]{1,2048}$/.test(raw)) return null;
  try {
    const base64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!Array.isArray(value) || value.length !== 5 || value[0] !== 1 || value[1] !== calendarId ||
        !isDateKey(value[2]) || typeof value[3] !== 'string' || !value[3] || value[3].length > 64 ||
        typeof value[4] !== 'string' || !value[4] || value[4].length > 128) return null;
    return { transactionDate: value[2], createdAt: value[3], id: value[4] };
  } catch { return null; }
}
