import type { CalendarDataSnapshot } from '../repositories/calendarRepository';

export type ApiError = {
  code: string;
  message: string;
};

export type ApiResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: ApiError;
    };

export type CalendarSnapshotResponse = ApiResult<CalendarDataSnapshot>;
