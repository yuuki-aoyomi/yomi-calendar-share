import type { CreditCardSetting, MoneyRecord } from '../types/calendar';
import { toDateKey } from './date';

export type CreditCardPaymentSchedule = {
  id: string;
  paymentDate: string;
  cardId: string;
  cardName: string;
  amount: number;
  records: MoneyRecord[];
};

const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const getLastDayOfMonth = (year: number, monthIndex: number): number =>
  new Date(year, monthIndex + 1, 0).getDate();

const getActualDay = (year: number, monthIndex: number, day: number): number =>
  Math.min(day, getLastDayOfMonth(year, monthIndex));

export const calculateCreditCardPaymentDate = (
  usedDateKey: string,
  card: CreditCardSetting,
): string => {
  const usedDate = parseDateKey(usedDateKey);
  const usedYear = usedDate.getFullYear();
  const usedMonthIndex = usedDate.getMonth();
  const usedDay = usedDate.getDate();
  const closingDay = getActualDay(usedYear, usedMonthIndex, card.closingDay);
  const paymentMonthOffset = usedDay <= closingDay ? 1 : 2;
  const paymentBaseDate = new Date(usedYear, usedMonthIndex + paymentMonthOffset, 1);
  const paymentYear = paymentBaseDate.getFullYear();
  const paymentMonthIndex = paymentBaseDate.getMonth();
  const paymentDay = getActualDay(paymentYear, paymentMonthIndex, card.paymentDay);

  return toDateKey(new Date(paymentYear, paymentMonthIndex, paymentDay));
};

export const buildCreditCardPaymentSchedules = (
  records: MoneyRecord[],
  cards: CreditCardSetting[],
): CreditCardPaymentSchedule[] => {
  const groupedSchedules = new Map<string, CreditCardPaymentSchedule>();

  records
    .filter((record) => record.type === 'expense' && record.isCreditCard && record.creditCardId)
    .forEach((record) => {
      const card = cards.find((item) => item.id === record.creditCardId);
      if (!card) return;

      const paymentDate = calculateCreditCardPaymentDate(record.date, card);
      const key = `${card.id}:${paymentDate}`;
      const current = groupedSchedules.get(key);

      if (current) {
        current.amount += record.amount;
        current.records.push(record);
        return;
      }

      groupedSchedules.set(key, {
        id: key,
        paymentDate,
        cardId: card.id,
        cardName: card.name,
        amount: record.amount,
        records: [record],
      });
    });

  return [...groupedSchedules.values()].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
};
