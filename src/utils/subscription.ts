import type { CreditCardSetting, Subscription } from '../types/calendar';
import { calculateCreditCardPaymentDate } from './creditCard';
import { toDateKey } from './date';

export type SubscriptionPaymentSchedule = {
  id: string;
  paymentDate: string;
  billingDate: string;
  subscriptionId: string;
  name: string;
  amount: number;
  category: string;
  creditCardId?: string;
  creditCardName?: string;
  memo?: string;
};

const getLastDayOfMonth = (year: number, monthIndex: number): number =>
  new Date(year, monthIndex + 1, 0).getDate();

const getActualDay = (year: number, monthIndex: number, day: number): number =>
  Math.min(day, getLastDayOfMonth(year, monthIndex));

const moveMonthKey = (monthKey: string, diff: number): string => {
  const [year, month] = monthKey.split('-').map(Number);
  return toDateKey(new Date(year, month - 1 + diff, 1)).slice(0, 7);
};

const calculateBillingDate = (monthKey: string, billingDay: number): string => {
  const [year, month] = monthKey.split('-').map(Number);
  const monthIndex = month - 1;
  const actualDay = getActualDay(year, monthIndex, billingDay);

  return toDateKey(new Date(year, monthIndex, actualDay));
};

export const buildSubscriptionPaymentSchedules = (
  subscriptions: Subscription[],
  monthKey: string,
  creditCards: CreditCardSetting[] = [],
): SubscriptionPaymentSchedule[] => {
  const billingMonthKeys = [moveMonthKey(monthKey, -2), moveMonthKey(monthKey, -1), monthKey];

  return subscriptions
    .filter((subscription) => subscription.isActive)
    .flatMap((subscription) =>
      billingMonthKeys.map((billingMonthKey) => {
        const billingDate = calculateBillingDate(billingMonthKey, subscription.billingDay);
        const creditCard = creditCards.find((card) => card.id === subscription.creditCardId);
        const paymentDate = creditCard
          ? calculateCreditCardPaymentDate(billingDate, creditCard)
          : billingDate;

        return {
          id: `${subscription.id}:${billingDate}:${paymentDate}`,
          paymentDate,
          billingDate,
          subscriptionId: subscription.id,
          name: subscription.name,
          amount: subscription.amount,
          category: subscription.category,
          creditCardId: creditCard?.id,
          creditCardName: creditCard?.name,
          memo: subscription.memo,
        };
      }),
    )
    .filter((schedule) => schedule.paymentDate.startsWith(monthKey))
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
};
