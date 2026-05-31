import type { CalendarEvent, PartTimeJob } from '../types/calendar';
import { toDateKey } from './date';
import { getEventsForDate } from './recurrence';

export type SalaryPaymentSchedule = {
  id: string;
  paymentDate: string;
  jobId: string;
  jobName: string;
  amount: number;
  minutes: number;
  regularMinutes: number;
  lateNightMinutes: number;
  breakMinutes: number;
  events: CalendarEvent[];
};

export type WorkPayCalculation = {
  amount: number;
  paidMinutes: number;
  regularMinutes: number;
  lateNightMinutes: number;
  breakMinutes: number;
};

const parseDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const getLastDayOfMonth = (year: number, monthIndex: number): number =>
  new Date(year, monthIndex + 1, 0).getDate();

const getActualDay = (year: number, monthIndex: number, day: number): number =>
  Math.min(day, getLastDayOfMonth(year, monthIndex));

const normalizeClosingDay = (job: PartTimeJob): number => job.closingDay ?? 31;

const normalizePaymentDay = (job: PartTimeJob): number => job.paymentDay ?? 25;

const parseTimeToMinutes = (time?: string): number | undefined => {
  if (!time) return undefined;

  const [hour, minute] = time.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return undefined;

  return hour * 60 + minute;
};

const getOverlapMinutes = (
  start: number,
  end: number,
  rangeStart: number,
  rangeEnd: number,
): number => Math.max(Math.min(end, rangeEnd) - Math.max(start, rangeStart), 0);

export const estimateBreakMinutes = (workMinutes: number): number => {
  if (workMinutes > 8 * 60) return 60;
  if (workMinutes >= 6 * 60) return 30;
  return 0;
};

export const formatPayrollRule = (job: PartTimeJob): string => {
  const closingDay = normalizeClosingDay(job);
  const paymentDay = normalizePaymentDay(job);
  const lateNightText = job.lateNightHourlyWage
    ? `深夜 ${job.lateNightHourlyWage.toLocaleString()}円`
    : '深夜 25%増';

  return `${closingDay === 31 ? '末' : closingDay}日締め / ${paymentDay}日払い / ${lateNightText}`;
};

export const calculateWorkPay = (event: CalendarEvent, job: PartTimeJob): WorkPayCalculation => {
  const start = parseTimeToMinutes(event.startTime);
  const rawEnd = parseTimeToMinutes(event.endTime);

  if (start === undefined || rawEnd === undefined) {
    return {
      amount: 0,
      paidMinutes: 0,
      regularMinutes: 0,
      lateNightMinutes: 0,
      breakMinutes: 0,
    };
  }

  const end = rawEnd <= start ? rawEnd + 24 * 60 : rawEnd;
  const totalMinutes = Math.max(end - start, 0);
  const eventBreakMinutes = event.breakMinutes;
  const estimatedBreakMinutes = estimateBreakMinutes(totalMinutes);
  const breakMinutes = Math.min(
    eventBreakMinutes ?? estimatedBreakMinutes,
    totalMinutes,
  );
  const lateNightEarlyMorning = getOverlapMinutes(start, end, 0, 5 * 60);
  const lateNightBeforeMidnight = getOverlapMinutes(start, end, 22 * 60, 24 * 60);
  const lateNightAfterMidnight = getOverlapMinutes(start, end, 24 * 60, 29 * 60);
  const rawLateNightMinutes = lateNightEarlyMorning + lateNightBeforeMidnight + lateNightAfterMidnight;
  const rawRegularMinutes = Math.max(totalMinutes - rawLateNightMinutes, 0);
  const regularBreakMinutes = Math.min(rawRegularMinutes, breakMinutes);
  const lateNightBreakMinutes = breakMinutes - regularBreakMinutes;
  const regularMinutes = Math.max(rawRegularMinutes - regularBreakMinutes, 0);
  const lateNightMinutes = Math.max(rawLateNightMinutes - lateNightBreakMinutes, 0);
  const hourlyWage = job.hourlyWage ?? 0;
  const lateNightHourlyWage = job.lateNightHourlyWage ?? Math.round(hourlyWage * 1.25);
  const amount = Math.round(
    (regularMinutes / 60) * hourlyWage + (lateNightMinutes / 60) * lateNightHourlyWage,
  );

  return {
    amount,
    paidMinutes: regularMinutes + lateNightMinutes,
    regularMinutes,
    lateNightMinutes,
    breakMinutes,
  };
};

export const calculateSalaryPaymentDate = (workDateKey: string, job: PartTimeJob): string => {
  const workDate = parseDateKey(workDateKey);
  const workYear = workDate.getFullYear();
  const workMonthIndex = workDate.getMonth();
  const workDay = workDate.getDate();
  const closingDay = getActualDay(workYear, workMonthIndex, normalizeClosingDay(job));
  const paymentMonthOffset = workDay <= closingDay ? 1 : 2;
  const paymentBaseDate = new Date(workYear, workMonthIndex + paymentMonthOffset, 1);
  const paymentYear = paymentBaseDate.getFullYear();
  const paymentMonthIndex = paymentBaseDate.getMonth();
  const paymentDay = getActualDay(paymentYear, paymentMonthIndex, normalizePaymentDay(job));

  return toDateKey(new Date(paymentYear, paymentMonthIndex, paymentDay));
};

const getDateKeysForMonth = (monthKey: string): string[] => {
  const [year, month] = monthKey.split('-').map(Number);
  const monthIndex = month - 1;
  const daysInMonth = getLastDayOfMonth(year, monthIndex);

  return Array.from({ length: daysInMonth }, (_, index) =>
    toDateKey(new Date(year, monthIndex, index + 1)),
  );
};

const moveMonthKey = (monthKey: string, diff: number): string => {
  const [year, month] = monthKey.split('-').map(Number);
  return toDateKey(new Date(year, month - 1 + diff, 1)).slice(0, 7);
};

export const buildSalaryPaymentSchedules = (
  events: CalendarEvent[],
  jobs: PartTimeJob[],
  monthKey: string,
): SalaryPaymentSchedule[] => {
  const groupedSchedules = new Map<string, SalaryPaymentSchedule>();
  const workMonthKeys = [moveMonthKey(monthKey, -2), moveMonthKey(monthKey, -1), monthKey];

  workMonthKeys
    .flatMap((workMonthKey) => getDateKeysForMonth(workMonthKey))
    .forEach((dateKey) => {
      const dayEvents = getEventsForDate(events, dateKey);

      jobs.forEach((job) => {
        const workEvents = dayEvents.filter((event) => (event.tagIds ?? []).includes(job.tagId));
        if (workEvents.length === 0) return;

        const paymentDate = calculateSalaryPaymentDate(dateKey, job);
        if (!paymentDate.startsWith(monthKey)) return;

        const key = `${job.id}:${paymentDate}`;
        const current = groupedSchedules.get(key);
        const workPay = workEvents.reduce<WorkPayCalculation>(
          (sum, event) => {
            const calculation = calculateWorkPay(event, job);

            return {
              amount: sum.amount + calculation.amount,
              paidMinutes: sum.paidMinutes + calculation.paidMinutes,
              regularMinutes: sum.regularMinutes + calculation.regularMinutes,
              lateNightMinutes: sum.lateNightMinutes + calculation.lateNightMinutes,
              breakMinutes: sum.breakMinutes + calculation.breakMinutes,
            };
          },
          {
            amount: 0,
            paidMinutes: 0,
            regularMinutes: 0,
            lateNightMinutes: 0,
            breakMinutes: 0,
          },
        );

        if (current) {
          current.amount += workPay.amount;
          current.minutes += workPay.paidMinutes;
          current.regularMinutes += workPay.regularMinutes;
          current.lateNightMinutes += workPay.lateNightMinutes;
          current.breakMinutes += workPay.breakMinutes;
          current.events.push(...workEvents);
          return;
        }

        groupedSchedules.set(key, {
          id: key,
          paymentDate,
          jobId: job.id,
          jobName: job.name,
          amount: workPay.amount,
          minutes: workPay.paidMinutes,
          regularMinutes: workPay.regularMinutes,
          lateNightMinutes: workPay.lateNightMinutes,
          breakMinutes: workPay.breakMinutes,
          events: [...workEvents],
        });
      });
    });

  return [...groupedSchedules.values()].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
};
